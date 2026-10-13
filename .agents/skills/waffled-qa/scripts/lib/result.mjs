// `wqa result`: builds the result JSON from flags, validates it against the
// ledger, writes it into the attempt, and records it.
import { join } from "node:path";
import { fail, list, required } from "./cli.mjs";
import { atomic, load, read, record, validateResult } from "./ledger.mjs";
import { attemptContext } from "./attempt.mjs";

// Bare file names belong to this attempt; paths with a slash are run-relative.
const inAttempt = (attempt, name) =>
  name.includes("/") ? name : `${attempt.directory}/${name}`;

export function result(run, opts) {
  const context = attemptContext(run, opts);
  const { attempt, state } = context;
  const outcome = required(opts["--outcome"], "--outcome");
  const findings = opts["--findings"] ? read(opts["--findings"]) : [];
  const resolutions = opts["--resolutions"] ? read(opts["--resolutions"]) : [];
  if (!Array.isArray(findings)) fail("--findings must hold a JSON array");
  if (!Array.isArray(resolutions)) fail("--resolutions must hold a JSON array");
  const value = {
    runId: state.runId,
    caseId: context.item.id,
    attempt: attempt.attempt,
    token: attempt.token,
    outcome,
    cause: opts["--cause"] ?? (outcome === "fail" ? "product" : null),
    summary: required(opts["--summary"], "--summary"),
    report: inAttempt(attempt, opts["--report"] ?? "report.md"),
    evidence: list(opts["--evidence"]).map((name) => inAttempt(attempt, name)),
    findings,
    resolutions: resolutions.map((item) => ({
      ...item,
      evidence: Array.isArray(item.evidence)
        ? item.evidence.map((name) => inAttempt(attempt, name))
        : item.evidence,
    })),
    cleanup: {
      status: required(opts["--cleanup"], "--cleanup"),
      note: required(opts["--cleanup-note"], "--cleanup-note"),
    },
  };
  validateResult(run, load(run), value);
  const target = `${attempt.directory}/result.json`;
  if (opts["--dry-run"]) return { valid: true, caseId: value.caseId, result: target };
  atomic(join(run, target), value);
  if (opts["--no-record"]) return { written: target, recorded: false };
  return { written: target, ...record(run, join(run, target)) };
}
