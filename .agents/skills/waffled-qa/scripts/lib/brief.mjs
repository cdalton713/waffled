// `wqa brief`: writes a worker brief for the current attempt from a template
// in assets/briefs, and prints its path, so the coordinator passes a path
// instead of composing the identity, inputs, and limits by hand.
import * as fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fail, required } from "./cli.mjs";
import { describeSource } from "./ledger.mjs";
import { attemptContext } from "./attempt.mjs";
import { handleOf } from "./identity.mjs";

const SKILL = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEADLINES = { runner: "75m", diagnose: "20m", fix: "60m" };

export function brief(run, opts) {
  const role = required(opts["--role"], "--role");
  if (!DEADLINES[role]) fail(`--role must be one of ${Object.keys(DEADLINES).join(", ")}`);
  // Diagnosis and fixes follow a recorded result, so the attempt may be finished.
  const context = attemptContext(run, opts, { running: role === "runner" });
  const { attempt, item, state, directory } = context;
  if (role === "fix" && !(opts["--base"] && opts["--target"]))
    fail("a fix brief needs --base and --target");
  // Each pipeline step gets its own ID and output path.
  let n = 1;
  while (fs.existsSync(join(directory, `brief-${role}-${n}.md`))) n++;
  const step = `${role}-${n}`;
  const zellij = Boolean(opts["--zellij"]);
  const values = {
    role,
    step,
    run,
    runId: state.runId,
    mode: state.mode,
    repo: state.repo,
    source: describeSource(attempt.source ?? state.source),
    caseId: item.id,
    caseFile: join(run, item.file),
    attempt: attempt.attempt,
    token: attempt.token,
    handle: handleOf(state.runId, item.id, attempt.attempt, attempt.token),
    directory,
    skill: SKILL,
    session: `wqa-${state.runId}`,
    deadline: opts["--deadline"] ?? DEADLINES[role],
    output: join(directory, `${step}.md`),
    branch: opts["--branch"] ?? `qa-fix/${item.id}-${attempt.attempt}`,
    base: opts["--base"] ?? "",
    target: opts["--target"] ?? "",
    completion: zellij
      ? "Completion signal: finish with `wqa result --no-record …`; the coordinator waits for `result.json` and records it."
      : "Completion signal: record with `wqa result …`, then send the final message.",
  };
  const template = fs.readFileSync(join(SKILL, "assets", "briefs", `${role}.md`), "utf8");
  const text = template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    key in values ? String(values[key]) : fail(`template uses unknown field ${key}`)
  );
  const path = join(directory, `brief-${step}.md`);
  fs.writeFileSync(path, text, { flag: "wx", mode: 0o600 });
  return { role, step, brief: path, output: role === "runner" ? null : values.output };
}
