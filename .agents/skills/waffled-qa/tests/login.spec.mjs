import { spawn, spawnSync } from "node:child_process";
import { workspace } from "./helpers.mjs";

const BIN = process.env.AGENT_BROWSER_BIN || "agent-browser";
const hasAgentBrowser = spawnSync("sh", ["-c", `command -v "${BIN}"`]).status === 0;

// "/" accepts the demo user and stores a session as the web client does;
// "/broken" never logs in; "/setup" shows the first-run wizard.
const form = (accept) => `<!doctype html><title>Login</title><script>
  if (localStorage.getItem("waffled.access")) document.write("<p>Today</p>");
  else document.write('<form onsubmit="event.preventDefault();' +
    ${accept ? `'if (elements[0].value === \\'jerry@seinfeld.demo\\' && elements[1].value === \\'seinfeld123\\') { localStorage.setItem(\\'waffled.access\\', \\'t\\'); location.reload(); }'` : "''"} +
    '"><input id=login-email type=email><input id=login-password type=password><button type=submit>Sign in</button></form>');
</script>`;
const SETUP = `<!doctype html><title>Setup</title><form><input id=setup-email type=email></form>`;
const SERVER = `require("node:http").createServer((q, r) => r.writeHead(200, { "content-type": "text/html" })
  .end(q.url === "/broken" ? ${JSON.stringify(form(false))} : q.url === "/setup" ? ${JSON.stringify(SETUP)} : ${JSON.stringify(form(true))}))
  .listen(0, "127.0.0.1", function () { console.log(this.address().port) })`;

let ws, server, base;
const sessions = [`wqa-li-${process.pid}`, `wqa-lb-${process.pid}`, `wqa-ls-${process.pid}`];
beforeAll(async () => {
  if (!hasAgentBrowser) return;
  server = spawn(process.execPath, ["-e", SERVER], { stdio: ["ignore", "pipe", "inherit"] });
  base = `http://127.0.0.1:${await new Promise((r) => server.stdout.once("data", (d) => r(String(d).trim())))}/`;
});
afterAll(() => {
  if (hasAgentBrowser) for (const s of sessions) spawnSync(BIN, ["--session", s, "close"]);
  server?.kill();
});
beforeEach(() => {
  ws = workspace();
  // agent-browser keeps its socket under HOME; a temp HOME makes the path too long.
  ws.env.HOME = process.env.HOME;
  ws.env.WAFFLED_QA_STACK = "8081";
});
afterEach(() => ws.cleanup());

test.skipIf(!hasAgentBrowser)("logs in through the form, then reports an existing login", () => {
  const args = ["login", "--session", sessions[0], "--url", base, "--headless", "--timeout", "10s"];
  expect(ws.ok(...args)).toMatchObject({ status: "logged-in", session: sessions[0] });
  expect(ws.ok(...args).status).toBe("already-logged-in");
}, 120_000);

test.skipIf(!hasAgentBrowser)("exits 1 with the failed step when login does not complete", () => {
  const out = ws.invoke("login", "--session", sessions[1], "--url", `${base}broken`, "--headless", "--timeout", "2s");
  expect(out.status).toBe(1);
  expect(JSON.parse(out.stdout)).toMatchObject({ status: "failed", step: "submit", session: sessions[1] });
}, 120_000);

test.skipIf(!hasAgentBrowser)("stops at the first-run wizard instead of setting up a household", () => {
  const out = ws.invoke("login", "--session", sessions[2], "--url", `${base}setup`, "--headless", "--timeout", "5s");
  expect(out.status).toBe(1);
  expect(JSON.parse(out.stdout)).toMatchObject({ status: "failed", step: "setup" });
}, 120_000);

test("needs named credentials for the main stack", () => {
  ws.env.WAFFLED_QA_STACK = "8080";
  expect(ws.invoke("login", "--headless").stderr).toMatch(/real household; set WAFFLED_QA_EMAIL/);
});

test("refuses a timeout over 60 seconds", () => {
  expect(ws.invoke("login", "--timeout", "2m").stderr).toMatch(/at most 60s/);
});
