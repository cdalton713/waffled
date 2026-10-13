import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MIN_VERSION } from "../scripts/lib/browser.mjs";

// Pins the agent-browser behavior that references/ui.md depends on. A failure
// here means the installed version changed and the UI reference needs review.
// AGENT_BROWSER_BIN pins the binary when several installs shadow each other.
const BIN = process.env.AGENT_BROWSER_BIN || "agent-browser";
const hasAgentBrowser = spawnSync("sh", ["-c", `command -v "${BIN}"`]).status === 0;

// The Save handler logs, requests a missing path, and throws, so one click
// exercises console, network, and uncaught-error capture. The iframe is served
// from a second origin, as checkout extensions are.
const INNER = `<!doctype html><title>Inner</title>
<label for=q>Coupon</label><input id=q>
<button onclick="document.body.append('applied ' + q.value)">Apply</button>`;
const page = (framePort) => `<!doctype html><title>Fixture</title>
<label for=name>Name</label><input id=name>
<button id=save disabled>Save</button>
<p id=out></p>
<div style="position:relative;display:inline-block">
  <button id=under>Hidden target</button>
  <div id=cover style="position:absolute;inset:0;background:#eee"></div>
</div>
<iframe src="http://localhost:${framePort}/"></iframe>
<script>
  const [name, save, out] = ["name", "save", "out"].map((id) => document.getElementById(id));
  let state = "";
  name.addEventListener("input", (e) => { state = e.target.value; save.disabled = !state; });
  save.addEventListener("click", () => {
    out.textContent = "Saved: " + state;
    console.error("save-clicked " + state);
    fetch("/missing");
    setTimeout(() => { throw new Error("boom " + state); });
  });
</script>`;

// The servers run in their own process: spawnSync blocks this one while the
// browser loads the page, so an in-process server would never answer.
const SERVER = `
  const http = require("node:http");
  const serve = (body) => http.createServer((req, res) => {
    if (req.url === "/") res.writeHead(200, { "content-type": "text/html" }).end(body);
    else res.writeHead(404).end();
  });
  const inner = serve(${JSON.stringify(INNER)}).listen(0, "127.0.0.1", () => {
    const outer = serve((${page.toString()})(inner.address().port));
    outer.listen(0, "127.0.0.1", () => console.log(outer.address().port));
  });
`;

let server, base, dir;
const session = `wqa-spec-${process.pid}`;
beforeAll(async () => {
  server = spawn(process.execPath, ["-e", SERVER], { stdio: ["ignore", "pipe", "inherit"] });
  const port = await new Promise((r) => server.stdout.once("data", (d) => r(String(d).trim())));
  base = `http://127.0.0.1:${port}/`;
  dir = mkdtempSync(join(tmpdir(), "wqa-browser-"));
});
afterAll(() => {
  if (hasAgentBrowser) ab("close");
  if (dir) rmSync(dir, { recursive: true, force: true });
  server?.kill();
});

function ab(...args) {
  const res = spawnSync(BIN, ["--json", ...args], {
    encoding: "utf8",
    timeout: 60_000,
    env: { ...process.env, AGENT_BROWSER_SESSION: session },
  });
  const out = JSON.parse(res.stdout);
  return { ...out, status: res.status };
}

function refFor(snapshot, role, name) {
  const hit = Object.entries(snapshot.data.refs).find(
    ([, r]) => r.role === role && (name === undefined || r.name === name),
  );
  if (!hit) throw new Error(`no ${role} "${name}" in ${JSON.stringify(snapshot.data.refs)}`);
  return `@${hit[0]}`;
}

test.skipIf(!hasAgentBrowser)("resolves to a supported agent-browser version", () => {
  const out = spawnSync(BIN, ["--version"], { encoding: "utf8" }).stdout;
  const [major, minor] = out.match(/(\d+)\.(\d+)/).slice(1).map(Number);
  expect(major * 1000 + minor, out).toBeGreaterThanOrEqual(MIN_VERSION[0] * 1000 + MIN_VERSION[1]);
});

test.skipIf(!hasAgentBrowser)("keeps the behavior the UI reference relies on", () => {
  expect(ab("open", base)).toMatchObject({ success: true, error: null });
  let snap = ab("snapshot", "-i");
  const name = refFor(snap, "textbox", "Name");
  const save = refFor(snap, "button", "Save");

  // A disabled click reports success, so the reference requires `is enabled`.
  expect(ab("is", "enabled", save).data.enabled).toBe(false);
  expect(ab("click", save)).toMatchObject({ success: true, status: 0 });
  expect(ab("get", "text", "#out").data.text).toBe("");

  // fill replaces the value, and get value reads it back.
  ab("fill", name, "Blue widget");
  ab("fill", name, "Red widget");
  expect(ab("get", "value", name).data.value).toBe("Red widget");

  ab("console", "--clear");
  ab("errors", "--clear");
  expect(ab("click", save).success).toBe(true);
  expect(ab("wait", "--text", "Saved: Red widget").success).toBe(true);

  let errors = [];
  for (let i = 0; i < 20 && errors.length === 0; i++) {
    errors = ab("errors").data.errors;
    spawnSync("sleep", ["0.2"]);
  }
  expect(JSON.stringify(errors)).toMatch(/boom Red widget/);
  expect(JSON.stringify(ab("console").data)).toMatch(/save-clicked Red widget/);
  expect(JSON.stringify(ab("network", "requests", "--status", "4xx").data)).toMatch(/\/missing/);

  const covered = ab("click", refFor(snap, "button", "Hidden target"));
  expect(covered).toMatchObject({ success: false, status: 1 });
  expect(covered.error).toMatch(/covered by/);

  // Refs reach into the cross-origin iframe. Waits never see its text, even
  // after `frame`; get text does.
  snap = ab("snapshot", "-i");
  ab("fill", refFor(snap, "textbox", "Coupon"), "SAVE10");
  ab("click", refFor(snap, "button", "Apply"));
  expect(ab("frame", refFor(snap, "Iframe")).success).toBe(true);
  expect(ab("wait", "--text", "applied SAVE10", "--timeout", "1000").status).toBe(1);
  expect(ab("get", "text", "body").data.text).toMatch(/applied SAVE10/);
  ab("frame", "main");

  // `errors --clear` leaves page errors in place, so `wqa capture` diffs
  // against the count saved by `capture mark` instead of relying on it.
  ab("errors", "--clear");
  expect(ab("errors").data.errors.length).toBeGreaterThan(0);

  const shot = join(dir, "saved.png");
  ab("screenshot", shot);
  expect(readFileSync(shot).subarray(1, 4).toString()).toBe("PNG");
}, 180_000);
