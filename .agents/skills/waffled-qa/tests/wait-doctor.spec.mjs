import { createServer } from "node:http";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { workspace } from "./helpers.mjs";
import { pick } from "../scripts/lib/wait.mjs";
import { classify } from "../scripts/lib/diagnose.mjs";

let ws, server, baseUrl, polls, job, requests, status;
beforeEach(async () => {
  ws = workspace();
  polls = 0;
  job = ["queued", "running", "published"];
  requests = [];
  status = { initialized: true, methods: ["password"] };
  server = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`);
    const send = (status, value) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(value));
    };
    if (req.url === "/api/auth/login") return send(200, { accessToken: "jwt", expiresIn: 900, memberships: [] });
    if (req.url === "/api/auth/status") return send(200, status);
    if (req.url === "/jobs/1") {
      const state = job[Math.min(polls++, job.length - 1)];
      return send(200, { job: { status: state } });
    }
    send(404, { message: "not found" });
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  ws.env.WAFFLED_QA_BASE_URL = baseUrl;
  ws.env.WAFFLED_QA_STACK = "8081";
});
afterEach(async () => {
  await new Promise((done) => server.close(done));
  ws.cleanup();
});

test("pick reads nested fields and array indexes", () => {
  expect(pick({ a: { b: [{ c: 3 }] } }, "a.b.0.c")).toBe(3);
  expect(pick({ a: null }, "a.b")).toBeUndefined();
});

test("wait http polls until the field matches and prints only the final state", async () => {
  const out = await ws.invokeAsync(
    "wait", "http", "--path", "/jobs/1", "--field", "job.status", "--until", "published",
    "--fail-on", "failed", "--interval", "50ms", "--timeout", "5s"
  );
  expect(out.status).toBe(0);
  expect(out.stdout.trim().split("\n")).toHaveLength(1);
  expect(JSON.parse(out.stdout)).toMatchObject({ outcome: "matched", value: "published", status: 200, polls: 3 });
});

test("wait http exits 1 on a failure value and on timeout", async () => {
  job = ["queued", "failed"];
  const failed = await ws.invokeAsync(
    "wait", "http", "--path", "/jobs/1", "--field", "job.status", "--until", "published",
    "--fail-on", "failed,cancelled", "--interval", "50ms", "--auth", "none"
  );
  expect(failed.status).toBe(1);
  expect(JSON.parse(failed.stdout)).toMatchObject({ outcome: "failed", value: "failed" });
  job = ["queued"];
  const late = await ws.invokeAsync(
    "wait", "http", "--url", `${baseUrl}/jobs/1`, "--field", "job.status", "--until", "published",
    "--interval", "100ms", "--timeout", "500ms"
  );
  expect(late.status).toBe(1);
  expect(JSON.parse(late.stdout)).toMatchObject({ outcome: "timeout", value: "queued" });
});

test("wait refuses a timeout over 60 seconds and a non-local URL", async () => {
  const long = await ws.invokeAsync("wait", "file", "--path", "/tmp/x", "--timeout", "2m");
  expect(long.stderr).toMatch(/at most 60s/);
  const remote = await ws.invokeAsync(
    "wait", "http", "--url", "https://waffled.example.com/x", "--field", "a", "--until", "b"
  );
  expect(remote.stderr).toMatch(/refusing non-local base URL/);
});

test("wait file succeeds once a run-relative file is nonempty", async () => {
  ws.init();
  const pending = ws.invokeAsync("wait", "file", "--run", ws.run, "--path", "done.json", "--interval", "50ms", "--timeout", "5s");
  setTimeout(() => writeFileSync(join(ws.run, "done.json"), "{}"), 200);
  const out = await pending;
  expect(out.status).toBe(0);
  expect(JSON.parse(out.stdout)).toMatchObject({ outcome: "exists", path: "done.json", bytes: 2 });
});

test("classify names the likely cause of a blank page", () => {
  const page = { url: "http://localhost:8081/", visibility: "visible", readyState: "complete", text: "Rules", serverUp: true, errors: 0 };
  expect(classify(page)).toBe("ok");
  expect(classify({ ...page, visibility: "hidden" })).toBe("hidden-tab");
  expect(classify({ ...page, serverUp: false })).toBe("server-down");
  expect(classify({ ...page, readyState: "interactive" })).toBe("loading");
  expect(classify({ ...page, errors: 2 })).toBe("app-error");
  expect(classify({ ...page, text: "" })).toBe("blank");
  expect(classify({ ...page, url: "about:blank" })).toBe("no-page");
});

test("doctor reports each check and fails on an unreachable api", async () => {
  const good = JSON.parse((await ws.invokeAsync("doctor")).stdout);
  const byName = Object.fromEntries(good.checks.map((c) => [c.name, c]));
  expect(byName.node.ok).toBe(true);
  expect(byName.api).toMatchObject({ ok: true, detail: `${baseUrl}/api/auth/status HTTP 200` });
  expect(byName.credentials).toMatchObject({ ok: true, detail: "jerry@seinfeld.demo (demo-seed) can log in" });
  expect(existsSync(join(ws.dir, ".waffled-qa", "tokens.json"))).toBe(false);
  expect(good.checks.map((c) => c.name)).toContain("containers");

  ws.env.WAFFLED_QA_BASE_URL = "http://127.0.0.1:1";
  const out = await ws.invokeAsync("doctor");
  const report = JSON.parse(out.stdout);
  expect(report.checks.find((c) => c.name === "api").ok).toBe(false);
  expect(report.ok).toBe(false);
  expect(out.status).toBe(1);
  expect(out.stdout).not.toContain('"jwt"');
});

test("doctor flags a stack without a household and a main stack without named credentials", async () => {
  status = { initialized: false, methods: ["password"] };
  const fresh = JSON.parse((await ws.invokeAsync("doctor")).stdout);
  expect(fresh.checks.find((c) => c.name === "household")).toMatchObject({ ok: false });
  status = { initialized: true, methods: ["password"] };
  ws.env.WAFFLED_QA_STACK = "8080";
  requests = [];
  const main = JSON.parse((await ws.invokeAsync("doctor")).stdout);
  expect(main.checks.find((c) => c.name === "credentials").detail).toMatch(/real household/);
  expect(requests.filter((r) => r === "POST /api/auth/login")).toEqual([]);
});

test("doctor checks only the run's own browser session", async () => {
  const unset = JSON.parse((await ws.invokeAsync("doctor", "--skip-login")).stdout);
  expect(unset.checks.find((c) => c.name === "login")).toMatchObject({ ok: true, warn: true });
  ws.env.AGENT_BROWSER_SESSION = `wqa-none-${process.pid}`;
  ws.env.WAFFLED_QA_RUN_DIR = "";
  const idle = JSON.parse((await ws.invokeAsync("doctor", "--skip-login")).stdout);
  const login = idle.checks.find((c) => c.name === "login");
  if (login.detail !== "agent-browser missing")
    expect(login.detail).toMatch(/is not running; open it: wqa login --session wqa-none-/);
});

test("inside a run, doctor's login hint is plain wqa login", async () => {
  ws.env.AGENT_BROWSER_SESSION = `wqa-none-${process.pid}`;
  ws.env.WAFFLED_QA_RUN_DIR = ws.run;
  const report = JSON.parse((await ws.invokeAsync("doctor", "--skip-login")).stdout);
  const login = report.checks.find((c) => c.name === "login");
  if (login.detail !== "agent-browser missing") expect(login.detail).toMatch(/open it: wqa login$/);
});
