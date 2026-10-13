import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { workspace } from "./helpers.mjs";

const BIN = process.env.AGENT_BROWSER_BIN || "agent-browser";
const hasAgentBrowser = spawnSync("sh", ["-c", `command -v "${BIN}"`]).status === 0;

// Load logs an error, requests a missing path, and throws. Save does the same
// again, so collect must keep only what happened after the mark.
const PAGE = `<!doctype html><title>Capture</title><button id=save>Save</button><script>
  console.error("before-mark"); fetch("/before"); setTimeout(() => { throw new Error("before-mark") });
  save.onclick = () => { console.error("after-mark"); fetch("/after"); setTimeout(() => { throw new Error("after-mark") }) };
</script>`;
const SERVER = `require("node:http").createServer((q, r) => q.url === "/"
  ? r.writeHead(200, { "content-type": "text/html" }).end(${JSON.stringify(PAGE)})
  : r.writeHead(404).end()).listen(0, "127.0.0.1", function () { console.log(this.address().port) })`;

let ws, server, base;
const session = `wqa-capture-${process.pid}`;
const ab = (...args) =>
  JSON.parse(
    spawnSync(BIN, ["--json", ...args], {
      encoding: "utf8",
      env: { ...process.env, AGENT_BROWSER_SESSION: session },
    }).stdout
  );

beforeAll(async () => {
  if (!hasAgentBrowser) return;
  server = spawn(process.execPath, ["-e", SERVER], { stdio: ["ignore", "pipe", "inherit"] });
  base = `http://127.0.0.1:${await new Promise((r) => server.stdout.once("data", (d) => r(String(d).trim())))}/`;
});
afterAll(() => {
  if (hasAgentBrowser) ab("close");
  server?.kill();
});
beforeEach(() => {
  ws = workspace();
  // agent-browser keeps its socket under HOME; a temp HOME makes the path too long.
  Object.assign(ws.env, { AGENT_BROWSER_SESSION: session, HOME: process.env.HOME });
  ws.init();
});
afterEach(() => ws.cleanup());

test.skipIf(!hasAgentBrowser)("collect keeps only the evidence after the mark", () => {
  expect(ab("--headed", "false", "open", base).success).toBe(true);
  for (let i = 0; i < 20 && !ab("errors").data.errors.length; i++) spawnSync("sleep", ["0.2"]);
  const attempt = ws.claim();
  expect(ws.ok("capture", "mark").existingErrors).toBeGreaterThanOrEqual(1);
  ab("click", "#save");
  for (let i = 0; i < 20 && ab("errors").data.errors.length < 2; i++) spawnSync("sleep", ["0.2"]);

  const out = ws.ok("capture", "collect", "--label", "after-save");
  expect(out).toMatchObject({
    label: "after-save",
    url: base,
    visible: true,
    console: { error: 1 },
    errors: 1,
    http4xx: 1,
    http5xx: 0,
  });
  expect(out.files).toContain(`${attempt.directory}/after-save.png`);
  const errors = readFileSync(join(ws.run, attempt.directory, "after-save.errors.json"), "utf8");
  expect(errors).toMatch(/after-mark/);
  expect(errors).not.toMatch(/before-mark/);
  const network = JSON.parse(readFileSync(join(ws.run, attempt.directory, "after-save.network.json"), "utf8"));
  expect(network.map((r) => new URL(r.url).pathname)).toEqual(["/after"]);
  expect(network[0].headers).toBeUndefined();

  // A label is used once; nothing is overwritten.
  const again = ws.invoke("capture", "collect", "--label", "after-save");
  expect(again.status).toBe(1);
  expect(again.stderr).toMatch(/already exists/);
}, 120_000);

test.skipIf(!hasAgentBrowser)("diagnose classifies the current tab and saves a labelled dump", () => {
  expect(ab("--headed", "false", "open", base).success).toBe(true);
  for (let i = 0; i < 20 && !ab("errors").data.errors.length; i++) spawnSync("sleep", ["0.2"]);
  const out = ws.ok("diagnose");
  // The fixture throws on load, so the visible, loaded page is an app error.
  expect(out).toMatchObject({ likely: "app-error", url: base, visibility: "visible", serverUp: true });
  const attempt = ws.claim();
  const saved = ws.ok("diagnose", "--label", "blank-check");
  expect(saved.file).toBe(`${attempt.directory}/blank-check.diagnose.json`);
}, 120_000);

test.skipIf(!hasAgentBrowser)("refuses a session that is not running instead of launching one", () => {
  const idle = `wqa-idle-${process.pid}`;
  ws.env.AGENT_BROWSER_SESSION = idle;
  ws.claim();
  const out = ws.invoke("capture", "mark");
  expect(out.status).toBe(1);
  expect(out.stderr).toMatch(/is not running/);
  expect(ab("session", "list").data.sessions).not.toContain(idle);
});
