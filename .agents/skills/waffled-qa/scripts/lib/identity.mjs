// Which run and attempt a command acts on. `claim` returns a handle,
// <runId>/<case>/<attempt>.<token>, that names one attempt in one string, so a
// worker passes `--as <handle>` (or sets WAFFLED_QA) instead of the run directory,
// case, and token. A command that needs a run and gets none uses the only open
// run for the current checkout, and fails when there is none or several.
import * as fs from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fail } from "./cli.mjs";
import { eachRun, load, runsRoot, summarize } from "./ledger.mjs";
import { source } from "./git.mjs";

const HANDLE = /^([a-zA-Z0-9][a-zA-Z0-9._-]*)\/([a-zA-Z0-9][a-zA-Z0-9_-]{0,63})\/([1-9]\d*)\.([0-9a-f-]{36})$/;

// Runs outside the runs root are found through this index, one file per run ID.
const indexRoot = () => join(homedir(), ".waffled-qa", "run-index");

export const handleOf = (runId, caseId, attempt, token) => `${runId}/${caseId}/${attempt}.${token}`;

export function parseHandle(text) {
  const match = HANDLE.exec(text);
  if (!match) fail("invalid handle; expected <runId>/<case>/<attempt>.<token> from wqa claim");
  const [, runId, caseId, attempt, token] = match;
  return { runId, caseId, attempt: Number(attempt), token, run: runOf(runId) };
}

const sameRun = (run, runId) => {
  try {
    return load(run).runId === runId;
  } catch {
    return false;
  }
};

// The directory of a run ID: under the runs root, or where the index points.
export function runOf(runId) {
  const direct = join(runsRoot(), runId);
  if (fs.existsSync(join(direct, "run.json")) && sameRun(direct, runId)) return direct;
  const entry = join(indexRoot(), runId);
  if (fs.existsSync(entry)) {
    const run = fs.readFileSync(entry, "utf8").trim();
    if (sameRun(run, runId)) return run;
  }
  fail(`run ${runId} not found; pass --run <directory>`);
}

// Records where a run lives when its ID alone does not find it.
export function remember(run) {
  const { runId } = load(run);
  if (resolve(run) === join(runsRoot(), runId)) return;
  fs.mkdirSync(indexRoot(), { recursive: true, mode: 0o700 });
  fs.writeFileSync(join(indexRoot(), runId), resolve(run) + "\n", { mode: 0o600 });
}

// The handle from --as, else from WAFFLED_QA.
export function handleFrom(opts) {
  const text = opts["--as"] || process.env.WAFFLED_QA || undefined;
  return text ? parseHandle(text) : null;
}

const real = (path) => {
  try {
    return fs.realpathSync(path);
  } catch {
    return null;
  }
};

// The only unfinished run for the current checkout (any checkout outside Git).
export function inferRun() {
  const here = source(process.cwd(), { diff: false })?.root;
  const root = here ? real(here) : null;
  const open = [...eachRun()].filter(
    ({ state }) =>
      state && !summarize(state).complete && (!root || real(state.repo) === root)
  );
  if (open.length === 1) return open[0].run;
  const where = root ? ` for ${root}` : "";
  if (!open.length) fail(`no open run${where}; pass --run, --as, or WAFFLED_QA`);
  fail(`${open.length} open runs${where} (${open.map((r) => r.state.runId).join(", ")}); pass --run, --as, or WAFFLED_QA`);
}
