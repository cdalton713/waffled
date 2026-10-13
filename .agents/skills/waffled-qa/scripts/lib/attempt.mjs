// Resolves the running attempt a worker command writes into. The case and
// token come from --case/--token, then the claim handle (--as or WAFFLED_QA), then
// WAFFLED_QA_CASE/WAFFLED_QA_TOKEN. The token check keeps a stale worker out of a newer
// attempt.
import * as fs from "node:fs";
import { basename, join } from "node:path";
import { fail } from "./cli.mjs";
import { handleFrom } from "./identity.mjs";
import { findCase, load } from "./ledger.mjs";

export function attemptContext(run, opts, { running = true } = {}) {
  if (!run) fail("--as, WAFFLED_QA, or --run is required");
  // Explicit --case and --token win; otherwise the handle names the attempt.
  const handle = opts["--case"] && opts["--token"] ? null : handleFrom(opts);
  if (handle && fs.realpathSync(handle.run) !== fs.realpathSync(run))
    fail(`the handle belongs to run ${handle.runId}, not ${run}`);
  const caseId =
    opts["--case"] ?? handle?.caseId ?? (process.env.WAFFLED_QA_CASE || undefined) ?? fail("--as, WAFFLED_QA, or --case is required");
  const token =
    opts["--token"] ?? handle?.token ?? (process.env.WAFFLED_QA_TOKEN || undefined) ?? fail("--as, WAFFLED_QA, or --token is required");
  const state = load(run);
  const item = findCase(state, caseId);
  const attempt = item.attempts.at(-1);
  if (!attempt || attempt.token !== token) fail("stale attempt or wrong worker token");
  if (handle && !opts["--token"] && attempt.attempt !== handle.attempt) fail("stale attempt or wrong worker token");
  if (running && attempt.state !== "running") fail("attempt is not running");
  return { run, state, item, attempt, directory: join(run, attempt.directory) };
}

// A new evidence file in the attempt: a plain file name that does not exist yet.
// Earlier evidence is never replaced.
export function evidenceFile(context, name) {
  if (typeof name !== "string" || !name || basename(name) !== name || name.startsWith("."))
    fail(`evidence name must be a plain file name: ${name}`);
  const path = join(context.directory, name);
  if (fs.existsSync(path)) fail(`evidence file already exists: ${context.attempt.directory}/${name}`);
  return { path, relative: `${context.attempt.directory}/${name}` };
}

export function writeEvidence(context, name, content) {
  const file = evidenceFile(context, name);
  fs.writeFileSync(
    file.path,
    typeof content === "string" || Buffer.isBuffer(content)
      ? content
      : JSON.stringify(content, null, 2) + "\n",
    { flag: "wx", mode: 0o600 }
  );
  return file.relative;
}
