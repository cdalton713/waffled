import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { workspace } from "./helpers.mjs";

let ws, server, baseUrl, seen;
beforeEach(async () => {
  ws = workspace();
  seen = [];
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, body });
      const send = (status, value, type = "application/json") => {
        res.writeHead(status, { "content-type": type, "set-cookie": "sid=secret" });
        res.end(typeof value === "string" ? value : JSON.stringify(value));
      };
      if (req.url === "/api/auth/login")
        return send(200, { accessToken: "jwt-1", refreshToken: "r-1", expiresIn: 900, memberships: [{ householdId: "h1" }] });
      if (req.url === "/api/lists")
        return send(200, {
          lists: [{ id: 1 }, { id: 2 }],
          pagination: { nextCursor: "c2", hasMore: true },
        });
      if (req.url === "/html") return send(502, "<html>Bad gateway</html>", "text/html");
      if (req.url === "/api/thing") return send(200, { success: false, message: "not allowed" });
      if (req.url === "/nope") return send(404, { message: "not found" });
      send(404, { error: "not found" });
    });
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

async function ok(...args) {
  const out = await ws.invokeAsync("api", ...args);
  expect(out.stderr).toBe("");
  expect(out.status).toBe(0);
  expect(out.stdout.trim().split("\n")).toHaveLength(1);
  return JSON.parse(out.stdout);
}

test("adds the session token, saves the response, and summarizes its shape", async () => {
  ws.init();
  const attempt = ws.claim();
  const out = await ok("GET", "/api/lists", "--save", "list.json");
  expect(out).toMatchObject({
    status: 200,
    keys: ["lists", "pagination"],
    arrays: { lists: 2 },
    pagination: { "pagination.nextCursor": "c2", "pagination.hasMore": true },
    files: [`${attempt.directory}/list.json`, `${attempt.directory}/list.meta.json`],
  });
  expect(seen[0]).toMatchObject({ method: "POST", url: "/api/auth/login" });
  expect(JSON.parse(seen[0].body)).toEqual({ email: "jerry@seinfeld.demo", password: "seinfeld123" });
  expect(seen.at(-1).headers.authorization).toBe("Bearer jwt-1");
  expect(JSON.stringify(out)).not.toContain("jwt-1");
  const meta = readFileSync(join(ws.run, attempt.directory, "list.meta.json"), "utf8");
  expect(meta).not.toContain("jwt-1");
  expect(meta).not.toContain("sid=secret");
  expect(JSON.parse(readFileSync(join(ws.run, attempt.directory, "list.json"), "utf8")).lists).toHaveLength(2);
});

test("refuses to replace saved evidence", async () => {
  ws.init();
  ws.claim();
  await ok("GET", "/api/lists", "--save", "list.json");
  const again = await ws.invokeAsync("api", "GET", "/api/lists", "--save", "list.json");
  expect(again.status).toBe(1);
  expect(again.stderr).toMatch(/already exists/);
});

test("reuses the cached token until it nears expiry; errors and non-JSON are observations", async () => {
  const out = await ok("GET", "/api/thing");
  await ok("GET", "/api/thing");
  expect(seen.filter((r) => r.url === "/api/auth/login")).toHaveLength(1);
  expect(seen.at(-1).headers.authorization).toBe("Bearer jwt-1");
  expect(out.domainError).toBe("not allowed");
  expect((await ok("GET", "/nope", "--auth", "none")).domainError).toBe("not found");
  const html = await ok("GET", "/html", "--auth", "none");
  expect(html).toMatchObject({ status: 502, json: false, excerpt: "<html>Bad gateway</html>" });
});

test("refuses a non-local base URL and an absolute path", async () => {
  ws.env.WAFFLED_QA_BASE_URL = "https://waffled.example.com";
  const remote = await ws.invokeAsync("api", "GET", "/x", "--auth", "none");
  expect(remote.stderr).toMatch(/refusing non-local base URL/);
  const absolute = await ws.invokeAsync("api", "GET", "http://localhost/x", "--auth", "none");
  expect(absolute.stderr).toMatch(/path must start with/);
  expect(seen).toEqual([]);
});

test("the main stack needs credentials the user named", async () => {
  ws.env.WAFFLED_QA_STACK = "8080";
  const out = await ws.invokeAsync("api", "GET", "/api/lists");
  expect(out.stderr).toMatch(/real household; set WAFFLED_QA_EMAIL and WAFFLED_QA_PASSWORD/);
  ws.env.WAFFLED_QA_EMAIL = "kramer@example.test";
  ws.env.WAFFLED_QA_PASSWORD = "pw";
  await ok("GET", "/api/lists");
  expect(JSON.parse(seen[0].body).email).toBe("kramer@example.test");
});
