// `wqa doctor`: one readiness check before QA starts. Reports each
// prerequisite instead of stopping at the first failure. It never starts a
// container, launches a browser, or writes the token cache; it logs in once
// through the API to prove the credentials (which issues a refresh token).
import { execFileSync } from "node:child_process";
import { BIN, LOGGED_IN, MIN_VERSION, ab, atLeast, sessionRunning, version } from "./browser.mjs";
import { credentials, login, resolveBaseUrl, resolveStack } from "./local.mjs";
import { inspect } from "./stack.mjs";

const which = (file) => {
  try {
    return execFileSync("sh", ["-c", `command -v "${file}"`], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
};

async function reachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000), redirect: "manual" });
    const body = await response.json().catch(() => null);
    return { ok: response.status < 500, status: response.status, body };
  } catch (error) {
    return { ok: false, status: error.cause?.code ?? error.name, body: null };
  }
}

export async function doctor(opts) {
  const checks = [];
  const add = (name, ok, detail, warn = false) => checks.push({ name, ok, detail, ...(warn ? { warn } : {}) });

  const node = Number(process.versions.node.split(".")[0]);
  add("node", node >= 22, `v${process.versions.node} (needs 22+)`);

  const found = version();
  add(
    "agent-browser",
    Boolean(found && atLeast(found, MIN_VERSION)),
    found
      ? `${found.join(".")} at ${which(BIN)} (needs ${MIN_VERSION.join(".")}+)`
      : `${BIN} not found; npm i -g agent-browser && agent-browser install`
  );
  add("docker", Boolean(which("docker")), which("docker") ?? "not installed");
  const zellij = which("zellij");
  add("zellij", true, zellij ? zellij : "not installed; suite workers must be subagents", !zellij);

  let stack = null;
  try {
    stack = resolveStack(opts);
  } catch (error) {
    add("stack", false, error.message);
  }
  if (stack) {
    const containers = ["api", "web"].map((name) => ({ name, ...inspect(stack.containers[name]) }));
    const down = containers.filter((c) => c.status !== "running");
    add(
      "containers",
      !down.length,
      containers.map((c) => `${c.name} ${c.status}${c.health && c.health !== "-" ? `/${c.health}` : ""}`).join(", ") +
        (down.length ? `; start with wqa up --stack ${stack.port}` : "")
    );
    const baseUrl = resolveBaseUrl(opts);
    const status = await reachable(`${baseUrl}/api/auth/status`);
    add("api", status.status === 200, `${baseUrl}/api/auth/status HTTP ${status.status}`);
    if (status.body && status.body.initialized === false)
      add("household", false, "the stack has no household yet (first-run wizard); seed it, see references/stack.md");

    if (opts["--skip-login"]) add("credentials", true, "skipped", true);
    else if (status.status === 200) {
      try {
        const creds = credentials(opts);
        await login(baseUrl, creds);
        add("credentials", true, `${creds.email} (${creds.source}) can log in`);
      } catch (error) {
        add("credentials", false, error.message);
      }
    }
  }

  // Only the run's own session matters; the default session is someone else's.
  const session = process.env.AGENT_BROWSER_SESSION;
  const loginCommand = (name) =>
    process.env.WAFFLED_QA_RUN_DIR || process.env.WAFFLED_QA ? "wqa login" : `wqa login --session ${name}`;
  if (!found) add("login", false, "agent-browser missing");
  else if (!session)
    add("login", true, "AGENT_BROWSER_SESSION is not set; set it to the run's session (wqa-<run-id>) to check its login", true);
  else if (!sessionRunning(session))
    add("login", true, `session ${session} is not running; open it: ${loginCommand(session)}`, true);
  else {
    const out = ab(["eval", `(${LOGGED_IN}) ? "in" : "out"`]);
    const loggedIn = out.data?.result === "in";
    add("login", loggedIn, loggedIn ? `session ${session}: logged in` : `session ${session}: not logged in; run ${loginCommand(session)}`);
  }

  const ok = checks.every((check) => check.ok);
  if (!ok) process.exitCode = 1;
  return { ok, checks };
}
