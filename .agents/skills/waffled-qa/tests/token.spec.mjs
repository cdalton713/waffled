import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../scripts/wqa.mjs", import.meta.url));
let home, server, baseUrl, requests, issued;

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), "wqa-token-test-"));
  requests = [];
  issued = 0;
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      requests.push(`${req.method} ${req.url}`);
      const send = (status, value) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(value));
      };
      if (req.method === "POST" && req.url === "/api/auth/login") {
        const { email, password } = JSON.parse(body);
        if (password !== "seinfeld123" && password !== "pw") return send(401, { message: "Invalid email or password." });
        issued += 1;
        return send(200, {
          accessToken: `jwt-${issued}`,
          refreshToken: "refresh-secret",
          expiresIn: 900,
          memberships: [{ householdId: "h1", personId: "p1" }],
          email,
        });
      }
      send(404, {});
    });
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
afterEach(async () => {
  await new Promise((done) => server.close(done));
  rmSync(home, { recursive: true, force: true });
});

function spawnCli(args, env = {}) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [cli, "token", ...args], {
      env: { PATH: process.env.PATH, HOME: home, ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (status) => done({ status, stdout, stderr }));
  });
}
const cachePath = () => join(home, ".waffled-qa", "tokens.json");
const run = (...args) => spawnCli(["--base-url", baseUrl, "--stack", "8081", ...args]);
async function ok(...args) {
  const result = await run(...args);
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  return result.stdout.trim();
}

test("logs in as the demo user, then serves the token from the cache", async () => {
  expect(await ok()).toBe("jwt-1");
  expect(await ok()).toBe("jwt-1");
  expect(requests).toEqual(["POST /api/auth/login"]);
  const cache = readFileSync(cachePath(), "utf8");
  expect(cache).not.toContain("refresh-secret");
  expect(JSON.parse(cache)[`${baseUrl} jerry@seinfeld.demo`]).toMatchObject({ households: ["h1"], credentialSource: "demo-seed" });
  expect(statSync(cachePath()).mode & 0o777).toBe(0o600);
});

test("logs in again when the cached token is about to expire or --refresh is passed", async () => {
  await ok();
  const cache = JSON.parse(readFileSync(cachePath(), "utf8"));
  cache[`${baseUrl} jerry@seinfeld.demo`].expiresAt = new Date(Date.now() + 30_000).toISOString();
  writeFileSync(cachePath(), JSON.stringify(cache));
  expect(await ok()).toBe("jwt-2");
  expect(await ok("--refresh")).toBe("jwt-3");
});

test("--info redacts the token", async () => {
  const info = JSON.parse(await ok("--info"));
  expect(info).toMatchObject({ baseUrl, email: "jerry@seinfeld.demo", cached: false, token: "jwt-1…" });
  expect(JSON.stringify(info)).not.toMatch(/"jwt-1"/);
});

test("reports a failed login without caching", async () => {
  const result = await spawnCli(["--base-url", baseUrl], {
    WAFFLED_QA_STACK: "8080",
    WAFFLED_QA_EMAIL: "x@example.test",
    WAFFLED_QA_PASSWORD: "wrong",
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toMatch(/returned 401/);
  expect(existsSync(cachePath())).toBe(false);
});

test("the main stack refuses the demo login and needs named credentials", async () => {
  const refused = await spawnCli(["--base-url", baseUrl, "--stack", "8080"]);
  expect(refused.stderr).toMatch(/real household/);
  expect(requests).toEqual([]);
  const named = await spawnCli(["--base-url", baseUrl, "--stack", "8080"], {
    WAFFLED_QA_EMAIL: "kramer@example.test",
    WAFFLED_QA_PASSWORD: "pw",
  });
  expect(named.stdout.trim()).toBe("jwt-1");
});

test("refuses a non-local base URL and an unknown stack", async () => {
  const remote = await spawnCli(["--base-url", "https://waffled.example.com", "--stack", "8081"]);
  expect(remote.stderr).toMatch(/refusing non-local base URL/);
  const unknown = await spawnCli(["--stack", "3000"]);
  expect(unknown.stderr).toMatch(/unknown stack 3000/);
  const missing = await spawnCli([]);
  expect(missing.stderr).toMatch(/name the stack/);
});
