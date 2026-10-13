// `wqa wait http|file`: bounded polling with a positive success condition and
// an explicit failure condition. Prints only the final state.
import * as fs from "node:fs";
import { isAbsolute, join } from "node:path";
import { duration, fail, list, required } from "./cli.mjs";
import { resolveBaseUrl, sessionToken } from "./local.mjs";

// The skill keeps each blocking call at 60 seconds or less.
const MAX_WAIT = 60_000;

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// "items.0.status" -> body.items[0].status
export const pick = (value, path) =>
  path.split(".").reduce((node, key) => (node == null ? undefined : node[key]), value);

function limits(opts) {
  const timeout = duration(opts["--timeout"] ?? "55s", "--timeout");
  if (timeout > MAX_WAIT) fail("--timeout is at most 60s; continue longer waits with another call");
  const interval = duration(opts["--interval"] ?? "2s", "--interval");
  return { timeout, interval };
}

export async function wait(run, kind, opts) {
  if (kind === "http") return waitHttp(opts);
  if (kind === "file") return waitFile(run, opts);
  fail("wait needs http or file");
}

async function waitHttp(opts) {
  const { timeout, interval } = limits(opts);
  const field = required(opts["--field"], "--field");
  const until = required(opts["--until"], "--until");
  const failOn = list(opts["--fail-on"]);
  let url;
  const headers = { accept: "application/json" };
  if (opts["--url"]) {
    const parsed = new URL(opts["--url"]);
    url = resolveBaseUrl({ "--base-url": parsed.origin }) + parsed.pathname + parsed.search;
  } else {
    const path = required(opts["--path"], "--path or --url");
    if (!path.startsWith("/")) fail("--path must start with /");
    const auth = opts["--auth"] ?? "session";
    let baseUrl;
    if (auth === "session") {
      const found = await sessionToken(opts);
      baseUrl = found.baseUrl;
      headers.authorization = `Bearer ${found.entry.token}`;
    } else if (auth === "none") baseUrl = resolveBaseUrl(opts);
    else fail("--auth must be session or none");
    url = baseUrl + path;
  }

  const started = Date.now();
  let polls = 0;
  let last = { status: null, value: undefined };
  while (true) {
    polls++;
    try {
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(Math.max(1000, timeout - (Date.now() - started))),
      });
      const text = await response.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {}
      last = { status: response.status, value: body === undefined ? undefined : pick(body, field) };
    } catch (error) {
      last = { status: error.name === "TimeoutError" ? "timeout" : "unreachable", value: undefined };
    }
    const value = last.value === undefined ? null : last.value;
    const done = (outcome) => {
      if (outcome !== "matched") process.exitCode = 1;
      return { outcome, field, value, status: last.status, polls, ms: Date.now() - started };
    };
    if (value !== null && String(value) === until) return done("matched");
    if (value !== null && failOn.includes(String(value))) return done("failed");
    if (Date.now() - started + interval > timeout) return done("timeout");
    await sleep(interval);
  }
}

async function waitFile(run, opts) {
  const { timeout, interval } = limits(opts);
  const given = required(opts["--path"], "--path");
  const path = isAbsolute(given)
    ? given
    : run
      ? join(run, given)
      : fail("a relative --path needs --as, WAFFLED_QA, or --run");
  const started = Date.now();
  let polls = 0;
  while (true) {
    polls++;
    const size = fs.existsSync(path) ? fs.statSync(path).size : 0;
    if (size > 0) return { outcome: "exists", path: given, bytes: size, polls, ms: Date.now() - started };
    if (Date.now() - started + interval > timeout) {
      process.exitCode = 1;
      return { outcome: "timeout", path: given, polls, ms: Date.now() - started };
    }
    await sleep(interval);
  }
}
