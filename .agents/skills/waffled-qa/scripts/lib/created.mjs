// `wqa created` and `wqa cleanup-plan`: the per-attempt list of objects a
// test created and existing values it changed, so cleanup is checked against
// a record instead of memory. A result cannot claim clean cleanup while an
// entry is not retired.
import { fail, required } from "./cli.mjs";
import { change, current, findCase, load, now, outstanding } from "./ledger.mjs";
import { attemptContext } from "./attempt.mjs";

const label = (object) => `${object.kind}:${object.id}`;

export function created(run, opts) {
  // Cleanup can finish after the result is recorded, so the attempt need not be running.
  const context = attemptContext(run, opts, { running: false });
  return change(run, (state) => {
    const item = findCase(state, context.item.id);
    const attempt = current(item, context.attempt.attempt, context.attempt.token);
    attempt.created ??= [];
    const retired = opts["--retired"];
    if (retired) {
      const object =
        attempt.created.find((entry) => entry.id === retired) ??
        fail(`${retired} is not recorded in this attempt`);
      if (object.retired) fail(`${label(object)} is already retired`);
      object.retired = now();
      if (opts["--note"]) object.retiredNote = opts["--note"];
    } else {
      const id = required(opts["--id"], "--id or --retired");
      if (attempt.created.some((entry) => entry.id === id))
        fail(`${id} is already recorded in this attempt`);
      attempt.created.push({
        kind: required(opts["--kind"], "--kind"),
        id,
        restore: opts["--restore"] ?? null,
        ...(opts["--note"] ? { note: opts["--note"] } : {}),
        created: now(),
        retired: null,
      });
    }
    return {
      caseId: item.id,
      attempt: attempt.attempt,
      outstanding: outstanding(attempt).map(label),
    };
  });
}

// Everything in the run that still needs retiring or restoring.
export function cleanupPlan(run) {
  const state = load(run);
  const items = state.cases.flatMap((item) =>
    item.attempts.flatMap((attempt) =>
      outstanding(attempt).map((object) => ({
        caseId: item.id,
        attempt: attempt.attempt,
        kind: object.kind,
        id: object.id,
        restore: object.restore,
      }))
    )
  );
  return { runId: state.runId, outstanding: items.length, items };
}
