// Local Waffled stack access: which stack a run targets (:8080 or :8081), its
// base URL (local hosts only), the QA login, and a cached session token.
import * as fs from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { fail } from "./cli.mjs";

// The web SPA is baked into the caddy image and the api into its own, so a
// rebuild of `web` means the caddy service. Caddy proxies /api/* to the api.
export const STACKS = {
  8080: {
    name: "main",
    app: "http://localhost:8080",
    script: "waffled",
    project: "waffled",
    containers: { api: "waffled-api", web: "waffled-caddy", postgres: "waffled-postgres", powersync: "waffled-powersync" },
    demo: false,
  },
  8081: {
    name: "demo",
    app: "http://localhost:8081",
    script: "waffled-demo",
    project: "waffled-demo",
    containers: { api: "waffled-demo-api", web: "waffled-demo-caddy", postgres: "waffled-demo-postgres", powersync: "waffled-demo-powersync" },
    demo: true,
  },
};
export const SERVICE_OF = { api: "api", web: "caddy", powersync: "powersync", postgres: "postgres" };

// Seeded by apps/api/scripts/seed-demo.ts; valid only on the :8081 demo stack.
export const DEMO_EMAIL = "jerry@seinfeld.demo";
export const DEMO_PASSWORD = "seinfeld123";

export const cachePath = () => join(homedir(), ".waffled-qa", "tokens.json");

export function gitRoot() {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

// --stack, then WAFFLED_QA_STACK (set from the run's spec by wqa.mjs). There is
// no default: :8080 is the household's real data, so the user picks.
export function resolveStack(opts = {}, { required: must = true } = {}) {
  const raw = opts["--stack"] ?? (process.env.WAFFLED_QA_STACK || undefined);
  if (raw === undefined) {
    if (!must) return null;
    fail("name the stack: --stack 8080|8081, or set \"stack\" in the run spec (ask the user which)");
  }
  const key = String(raw).replace(/^:/, "");
  return STACKS[key] ? { port: Number(key), ...STACKS[key] } : fail(`unknown stack ${raw}; use 8080 or 8081`);
}

export function assertLocal(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail(`invalid base URL: ${raw}`);
  }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    fail(`refusing non-local base URL: ${url.origin}`);
  return url.origin;
}

export function resolveBaseUrl(opts = {}) {
  const raw = opts["--base-url"] ?? (process.env.WAFFLED_QA_BASE_URL || undefined) ?? resolveStack(opts).app;
  return assertLocal(raw);
}

export function credentials(opts = {}) {
  const email = process.env.WAFFLED_QA_EMAIL;
  const password = process.env.WAFFLED_QA_PASSWORD;
  if (email && password) return { email, password, source: "env" };
  const stack = resolveStack(opts, { required: false });
  if (stack?.demo) return { email: DEMO_EMAIL, password: DEMO_PASSWORD, source: "demo-seed" };
  fail(
    stack
      ? `the :${stack.port} stack holds a real household; set WAFFLED_QA_EMAIL and WAFFLED_QA_PASSWORD to the account the user named`
      : "no credentials: pass --stack 8081 for the demo login, or set WAFFLED_QA_EMAIL and WAFFLED_QA_PASSWORD"
  );
}

export function readCache() {
  try {
    return JSON.parse(fs.readFileSync(cachePath(), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    fail(`unreadable token cache ${cachePath()}: ${error.message}`);
  }
}

export function writeCache(cache) {
  const path = cachePath();
  fs.mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(cache, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    fs.renameSync(temp, path);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

export async function request(baseUrl, method, path, { token, body } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  let response;
  try {
    response = await fetch(baseUrl + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    fail(`${method} ${path} failed: ${error.cause?.message ?? error.message}`);
  }
  const text = await response.text();
  if (!response.ok) fail(`${method} ${path} returned ${response.status}: ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text);
  } catch {
    fail(`${method} ${path} returned non-JSON: ${text.slice(0, 200)}`);
  }
}

export async function login(baseUrl, { email, password }) {
  const result = await request(baseUrl, "POST", "/api/auth/login", { body: { email, password } });
  if (!result.accessToken) fail("login returned no access token");
  return result;
}

// Refresh a cached token this long before it expires.
const SLACK_MS = 60_000;

// A session access token for this base URL and user, from the cache while it
// is fresh. The refresh token is never stored; a new login replaces it.
export async function sessionToken(opts = {}) {
  const baseUrl = resolveBaseUrl(opts);
  const creds = credentials(opts);
  const key = `${baseUrl} ${creds.email}`;
  const cache = readCache();
  const cached = cache[key];
  if (cached && !opts["--refresh"] && Date.parse(cached.expiresAt) - SLACK_MS > Date.now())
    return { baseUrl, entry: cached, cached: true };
  const result = await login(baseUrl, creds);
  const entry = {
    token: result.accessToken,
    email: creds.email,
    credentialSource: creds.source,
    households: (result.memberships ?? []).map((m) => m.householdId).filter(Boolean),
    obtainedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + (result.expiresIn ?? 900) * 1000).toISOString(),
  };
  cache[key] = entry;
  writeCache(cache);
  return { baseUrl, entry, cached: false };
}
