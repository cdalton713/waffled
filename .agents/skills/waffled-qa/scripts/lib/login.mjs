// `wqa login`: logs the QA user into the stack's web app through AuthGate's own
// sign-in form, using agent-browser. Headed unless --headless. With a run, the
// session and profile default to wqa-<runId> and ~/.waffled-qa/browser/<runId>.
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { duration, fail } from "./cli.mjs";
import { BIN, LOGGED_IN, LOGIN_FORM } from "./browser.mjs";
import { load } from "./ledger.mjs";
import { credentials, resolveStack } from "./local.mjs";

// A failed step; reported as {"status":"failed", step, error} with exit 1.
class StepError extends Error {
  constructor(step, message, extra = {}) {
    super(message);
    Object.assign(this, { step, extra });
  }
}

export function browserLogin(run, opts) {
  const state = run ? load(run) : null;
  const session =
    opts["--session"] ??
    (process.env.AGENT_BROWSER_SESSION || undefined) ??
    (state ? `wqa-${state.runId}` : undefined);
  const profile =
    opts["--profile"] ?? (state ? join(homedir(), ".waffled-qa", "browser", state.runId) : undefined);
  const url = opts["--url"] ?? (process.env.WAFFLED_QA_APP_URL || `${resolveStack(opts).app}/`);
  const timeout = duration(opts["--timeout"] ?? "20s", "--timeout");
  if (timeout > 60_000) fail("--timeout is at most 60s");
  const { email, password } = credentials(opts);
  const env = { ...process.env, ...(session ? { AGENT_BROWSER_SESSION: session } : {}) };

  const ab = (step, ...args) => {
    const res = spawnSync(BIN, ["--json", ...args], { encoding: "utf8", env, timeout: 90_000 });
    if (res.error) throw new StepError(step, `${BIN}: ${res.error.message}`);
    try {
      return JSON.parse(res.stdout);
    } catch {
      throw new StepError(step, (res.stderr || res.stdout || "no output").trim());
    }
  };
  const must = (step, ...args) => {
    const out = ab(step, ...args);
    if (!out.success) throw new StepError(step, out.error);
    return out.data;
  };
  const wait = String(timeout);
  const identity = { session: session ?? "default", ...(profile ? { profile } : {}) };

  try {
    // Launch options apply only when the session's browser starts.
    const launch = ["--headed", String(!opts["--headless"])];
    if (profile) launch.push("--profile", profile);
    must("open", ...launch, "open", url);
    must("load", "wait", "--fn", `${LOGGED_IN} || !!document.querySelector(${JSON.stringify(LOGIN_FORM)})`, "--timeout", wait);

    const pageState = () =>
      ab("state", "eval", `(${LOGGED_IN}) ? "in" : document.querySelector("#login-password") ? "form" :
        document.querySelector("#setup-email") ? "setup" : "loading"`).data?.result;
    // The app can show the login form briefly while it checks a stored session.
    // Act only on a state that holds for three samples, or on being logged in.
    let last;
    let streak = 0;
    for (let i = 0; i < 12; i++) {
      const current = pageState();
      if (current === "in") {
        last = current;
        break;
      }
      streak = current === last ? streak + 1 : 1;
      last = current;
      if (streak >= 3 && current !== "loading") break;
      spawnSync("sleep", ["0.5"]);
    }
    if (last === "in")
      return { status: "already-logged-in", url: must("url", "get", "url").url, ...identity };

    // An uninitialized stack shows the first-run wizard; setting up a household
    // is a decision for the user, not a login step.
    if (last === "setup")
      throw new StepError("setup", "the stack shows the first-run setup wizard; it has no household yet");
    must("email", "fill", "#login-email", email);
    must("password", "fill", "#login-password", password);
    const typed = must("email", "get", "value", "#login-email").value;
    if (typed !== email) throw new StepError("email", `email field reads back ${JSON.stringify(typed)}`);
    must("submit", "click", "form:has(#login-password) button[type=submit]");

    const done = ab("submit", "wait", "--fn", LOGGED_IN, "--timeout", wait);
    if (!done.success) {
      const text = ab("submit", "get", "text", "body").data?.text;
      throw new StepError("submit", done.error, {
        pageText: text?.replace(/\s+/g, " ").trim().slice(0, 400),
      });
    }
    return { status: "logged-in", url: must("url", "get", "url").url, ...identity };
  } catch (error) {
    if (!(error instanceof StepError)) throw error;
    process.exitCode = 1;
    return { status: "failed", step: error.step, error: error.message, ...error.extra, ...identity };
  }
}
