// `wqa stack`, `wqa up`, `wqa restart`, `wqa down`: the Docker stack a run
// targets. Container names are fixed per stack, so a build from any checkout
// replaces what is running; the compose working_dir label on each container
// names the checkout that built it, and that is the ownership proof.
//
// Builds take minutes, so up/restart start the stack script detached, log to
// ~/.waffled-qa/stack/, and return. `wqa stack --wait` polls for the result.
import * as fs from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { fail } from "./cli.mjs";
import { load } from "./ledger.mjs";
import { source } from "./git.mjs";
import { SERVICE_OF, resolveStack } from "./local.mjs";

const stateRoot = () => join(homedir(), ".waffled-qa", "stack");
const jobFile = (port) => join(stateRoot(), `${port}.json`);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

function docker(args) {
  try {
    return execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15_000 });
  } catch (error) {
    if (error.code === "ENOENT") fail("docker is not installed or not on PATH");
    return null;
  }
}

const FORMAT = [
  "{{.State.Status}}",
  "{{if .State.Health}}{{.State.Health.Status}}{{else}}-{{end}}",
  '{{index .Config.Labels "com.docker.compose.project.working_dir"}}',
  '{{range .Config.Env}}{{if eq (index (split . "=") 0) "GIT_SHA"}}{{index (split . "=") 1}}{{end}}{{end}}',
  "{{.Config.Image}}",
].join("\t");

export function inspect(container) {
  const out = docker(["inspect", "-f", FORMAT, container]);
  if (!out) return { container, status: "missing" };
  const [status, health, workingDir, sha, image] = out.trim().split("\t");
  return {
    container,
    status,
    health,
    checkout: workingDir ? workingDir.replace(/\/infra\/compose\/?$/, "") : null,
    ...(sha ? { sha } : {}),
    image,
  };
}

function repoOf(runDir, opts) {
  const given = opts["--repo"] ?? opts["--expect-repo"] ?? (runDir ? load(runDir).repo : process.cwd());
  const repo = source(given, { diff: false });
  if (!repo) fail(`not a git checkout: ${given}`);
  return repo;
}

function realpath(path) {
  try {
    return fs.realpathSync(path);
  } catch {
    return path;
  }
}

function readJob(port) {
  try {
    const job = JSON.parse(fs.readFileSync(jobFile(port), "utf8"));
    const exit = fs.existsSync(job.exitFile) ? Number(fs.readFileSync(job.exitFile, "utf8").trim()) : null;
    const state = exit !== null ? (exit === 0 ? "done" : "failed") : alive(job.pid) ? "running" : "lost";
    return { state, exit, command: job.command, repo: job.repo, log: job.log, startedAt: job.startedAt };
  } catch {
    return null;
  }
}

async function probe(app) {
  try {
    const response = await fetch(`${app}/api/auth/status`, { signal: AbortSignal.timeout(3000) });
    const body = await response.json().catch(() => null);
    return { status: response.status, ...(body && "initialized" in body ? { initialized: body.initialized } : {}) };
  } catch (error) {
    return { status: "unreachable", detail: error.cause?.code ?? error.name };
  }
}

async function snapshot(runDir, opts) {
  const stack = resolveStack(opts);
  const repo = repoOf(runDir, opts);
  const root = realpath(repo.root);
  const services = Object.entries(stack.containers).map(([name, container]) => {
    const found = inspect(container);
    const ours = found.checkout ? realpath(found.checkout) === root : null;
    const entry = { name, ...found, ours };
    if (found.sha && found.sha !== "dev") entry.shaMatchesHead = repo.head.startsWith(found.sha) || found.sha.startsWith(repo.head.slice(0, 7));
    return entry;
  });
  return {
    stack: `:${stack.port}`,
    kind: stack.name,
    app: stack.app,
    repo: root,
    head: repo.head.slice(0, 12),
    api: await probe(stack.app),
    build: readJob(stack.port),
    services,
  };
}

const healthy = (s) => s.status === "running" && (s.health === "healthy" || s.health === "-");

// Read-only: containers, the checkout that built each one, the api's baked
// GIT_SHA, the app's /api/auth/status, and the last build started by wqa.
export async function stackStatus(runDir, opts) {
  const deadline = Date.now() + (opts["--wait"] ? 55_000 : 0);
  let snap = await snapshot(runDir, opts);
  while (opts["--wait"] && Date.now() < deadline) {
    const settled = snap.build?.state !== "running" && ["api", "web"].every((n) => healthy(snap.services.find((s) => s.name === n)));
    if (settled || snap.build?.state === "failed") break;
    await sleep(3000);
    snap = await snapshot(runDir, opts);
  }
  const key = snap.services.filter((s) => ["api", "web"].includes(s.name));
  snap.ready = key.every(healthy) && snap.api.status === 200;
  if (opts["--expect-repo"] || runDir) {
    snap.mismatch = key.filter((s) => s.ours === false).map((s) => `${s.name} built from ${s.checkout}`);
    if (snap.mismatch.length) process.exitCode = 1;
  }
  return snap;
}

function guard(stack, opts, current) {
  if (stack.port === 8080 && !opts["--confirm-main"])
    fail("the :8080 stack is the household's real install; rebuilding it needs --confirm-main and the user's go-ahead");
  const others = current.services.filter((s) => s.ours === false && ["api", "web"].includes(s.name));
  if (others.length && !opts["--take-over"])
    fail(
      `${others.map((s) => `${s.name} runs a build from ${s.checkout}`).join("; ")}; another session may own it. ` +
        "Ask the user, then pass --take-over"
    );
}

function launch(stack, repoRoot, args) {
  const prior = readJob(stack.port);
  if (prior?.state === "running") fail(`a build is already running: ${prior.command} (log ${prior.log})`);
  fs.mkdirSync(stateRoot(), { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const log = join(stateRoot(), `${stack.port}-${stamp}.log`);
  const exitFile = `${log}.exit`;
  const script = join(repoRoot, stack.script);
  if (!fs.existsSync(script)) fail(`missing ${script}`);
  const command = `./${stack.script} ${args.join(" ")}`;
  const out = fs.openSync(log, "a");
  const child = spawn("/bin/sh", ["-c", `"$0" "$@"; echo $? > ${JSON.stringify(exitFile)}`, script, ...args], {
    cwd: repoRoot,
    detached: true,
    stdio: ["ignore", out, out],
  });
  child.unref();
  fs.writeFileSync(
    jobFile(stack.port),
    JSON.stringify({ pid: child.pid, command, repo: repoRoot, log, exitFile, startedAt: new Date().toISOString() }, null, 2)
  );
  return { started: command, repo: repoRoot, log, watch: `tail -f ${log}`, next: `wqa stack --stack ${stack.port} --wait` };
}

// Builds and starts the whole stack from the tested checkout.
export async function up(runDir, opts) {
  const stack = resolveStack(opts);
  const current = await snapshot(runDir, opts);
  guard(stack, opts, current);
  const args = stack.port === 8080 ? ["up", "--build"] : ["up"];
  return { stack: `:${stack.port}`, ...launch(stack, current.repo, args) };
}

// Rebuilds and recreates named services (api, web, powersync) from the tested checkout.
export async function restart(runDir, names, opts) {
  if (!names.length) fail("name the services to rebuild, for example wqa restart api web");
  const stack = resolveStack(opts);
  const services = names.map((n) => SERVICE_OF[n] ?? fail(`unknown service ${n}; known: ${Object.keys(SERVICE_OF).join(", ")}`));
  const current = await snapshot(runDir, opts);
  guard(stack, opts, current);
  const args = stack.port === 8080 ? ["rebuild", ...services] : ["up", ...services];
  return { stack: `:${stack.port}`, ...launch(stack, current.repo, args) };
}

// Stops the demo stack and keeps its volumes. The main stack is never stopped here.
export async function down(runDir, opts) {
  const stack = resolveStack(opts);
  if (stack.port === 8080) fail("wqa never stops the :8080 stack; the user runs ./waffled down");
  const current = await snapshot(runDir, opts);
  return { stack: `:${stack.port}`, ...launch(stack, current.repo, ["down"]) };
}
