// Shared agent-browser access. Commands run with --json in the session named
// by AGENT_BROWSER_SESSION; AGENT_BROWSER_BIN pins the binary.
import { spawnSync } from "node:child_process";
import { fail } from "./cli.mjs";

export const BIN = process.env.AGENT_BROWSER_BIN || "agent-browser";
// Keep in step with references/ui.md. Older versions click through covering elements.
export const MIN_VERSION = [0, 37];
// AuthGate's sign-in and first-run setup forms (apps/web/src/kiosk/AuthGate.tsx);
// the web client keeps its session in localStorage under waffled.access.
export const LOGIN_FORM = "#login-email, #login-password, #setup-email";
export const LOGGED_IN = `!document.querySelector(${JSON.stringify(LOGIN_FORM)}) &&
  !!localStorage.getItem("waffled.access")`;

// Runs one command and returns agent-browser's JSON envelope
// ({success, data, error}). Throws only when the binary cannot run or its
// output is not JSON.
export function ab(args, { env = process.env, timeout = 90_000 } = {}) {
  const res = spawnSync(BIN, ["--json", ...args], { encoding: "utf8", env, timeout });
  if (res.error) fail(`${BIN}: ${res.error.message}`);
  try {
    return JSON.parse(res.stdout);
  } catch {
    fail(`${BIN} ${args[0]}: ${(res.stderr || res.stdout || "no output").trim()}`);
  }
}

// Like `ab`, but fails unless the command succeeded, and returns its data.
export function must(args, options) {
  const out = ab(args, options);
  if (!out.success) fail(`${BIN} ${args.join(" ")}: ${out.error}`);
  return out.data;
}

export const sessionName = (env = process.env) => env.AGENT_BROWSER_SESSION || "default";

// Any command on a session that is not running launches a new blank browser,
// so read-only helpers check the session list first.
export function sessionRunning(name = sessionName()) {
  const out = ab(["session", "list"]);
  return Boolean(out.success && out.data?.sessions?.includes(name));
}

export function requireSession() {
  const name = sessionName();
  if (!sessionRunning(name))
    fail(`agent-browser session ${name} is not running; open it with wqa login first`);
  return name;
}

// "agent-browser 0.38.1" -> [0, 38, 1]; null when the binary is missing.
export function version() {
  const res = spawnSync(BIN, ["--version"], { encoding: "utf8", timeout: 10_000 });
  if (res.error || res.status !== 0) return null;
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(res.stdout);
  return match ? match.slice(1).map(Number) : null;
}

export const atLeast = (found, [major, minor]) =>
  found[0] > major || (found[0] === major && found[1] >= minor);
