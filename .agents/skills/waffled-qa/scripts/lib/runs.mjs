// Commands across runs: `list`, `findings`, and `regress` (a linked run for
// regression or replacement cases).
import * as fs from "node:fs";
import { join, resolve } from "node:path";
import { fail, list as split, required } from "./cli.mjs";
import {
  change,
  create,
  eachRun,
  findCase,
  load,
  now,
  openFindings,
  runsRoot,
  summarize,
} from "./ledger.mjs";
import { inferRun } from "./identity.mjs";

const DAY = 86_400_000;

// A run needs attention while an attempt runs, a case awaits a fix, cleanup is
// incomplete, or it changed within the last day.
function activity(state) {
  const reasons = [];
  if (state.cases.some((item) => item.status === "running")) reasons.push("running");
  if (state.cases.some((item) => item.status === "fixing")) reasons.push("fixing");
  if (!summarize(state).clean) reasons.push("cleanup incomplete");
  if (Date.now() - Date.parse(state.updated) < DAY) reasons.push("updated in the last day");
  return reasons;
}

// One stack is one database, so active runs on the same stack always share it.
const fixtureKey = (stack, fixture) =>
  [`stack=:${stack}`, ...Object.entries(fixture ?? {}).sort().map(([k, v]) => `${k}=${v}`)].join(" ");

export function listRuns(opts) {
  const root = resolve(opts["--root"] ?? runsRoot());
  const runs = [];
  const unreadable = [];
  for (const { run, state, error } of eachRun(root)) {
    if (error) {
      unreadable.push({ run, error });
      continue;
    }
    const active = activity(state);
    if (opts["--active"] && !active.length) continue;
    const { counts, unresolved } = summarize(state);
    runs.push({
      run,
      runId: state.runId,
      feature: state.feature,
      repo: state.repo,
      updated: state.updated,
      counts,
      openFindings: unresolved.length,
      ...(active.length ? { active } : {}),
      ...(state.stack ? { stack: state.stack } : {}),
      ...(state.fixture ? { fixture: state.fixture } : {}),
      ...(state.linkedFrom ? { linkedFrom: state.linkedFrom.runId } : {}),
    });
  }
  runs.sort((a, b) => b.updated.localeCompare(a.updated));
  // Separate run directories do not isolate a shared stack or household.
  const warnings = [];
  const byFixture = new Map();
  for (const item of runs.filter((r) => r.active && (r.stack || r.fixture))) {
    const key = fixtureKey(item.stack, item.fixture);
    byFixture.set(key, [...(byFixture.get(key) ?? []), item.runId]);
  }
  for (const [key, ids] of byFixture)
    if (ids.length > 1) warnings.push(`active runs share fixture ${key}: ${ids.join(", ")}`);
  return { root, runs, ...(warnings.length ? { warnings } : {}), ...(unreadable.length ? { unreadable } : {}) };
}

// Findings with their state: open, or resolved with the resolving attempt.
function findingsOf(run, state) {
  return state.cases.flatMap((item) => {
    const open = new Set(openFindings(item).map((f) => f.id));
    const seen = new Map();
    for (const attempt of item.attempts) {
      for (const finding of attempt.result?.findings ?? [])
        seen.set(finding.id, {
          runId: state.runId,
          caseId: item.id,
          id: finding.id,
          summary: finding.summary,
          requiresFix: finding.requiresFix,
          firstAttempt: seen.get(finding.id)?.firstAttempt ?? attempt.attempt,
        });
      for (const resolution of attempt.result?.resolutions ?? []) {
        const entry = seen.get(resolution.id);
        if (entry) entry.resolvedIn = attempt.attempt;
      }
    }
    return [...seen.values()].map((entry) => ({
      ...entry,
      state: open.has(entry.id) ? "open" : entry.requiresFix ? "resolved" : "observation",
      ...(run ? { run } : {}),
    }));
  });
}

export function findings(runDir, opts) {
  let found;
  if (opts["--all-runs"]) {
    const root = resolve(opts["--root"] ?? runsRoot());
    found = [...eachRun(root)].filter((r) => r.state).flatMap((r) => findingsOf(r.run, r.state));
  } else {
    found = findingsOf(null, load(runDir ?? inferRun()));
  }
  const match = opts["--id"];
  if (match) found = found.filter((f) => f.id.includes(match));
  if (opts["--open"]) found = found.filter((f) => f.state === "open");
  return { count: found.length, findings: found };
}

// A new run for some cases of an earlier one: a regression run after later code
// changes, or a replacement run with a corrected case (--replace id=file.md).
// Both runs record the link.
export function regress(opts) {
  const from = resolve(required(opts["--from"], "--from"));
  const reason = required(opts["--reason"], "--reason");
  const source = load(from);
  const ids = split(required(opts["--cases"], "--cases"));
  const replacements = Object.fromEntries(
    split(opts["--replace"]).map((pair) => {
      const at = pair.indexOf("=");
      if (at < 1) fail("--replace takes id=file.md pairs separated by commas");
      return [pair.slice(0, at), resolve(pair.slice(at + 1))];
    })
  );
  for (const id of Object.keys(replacements))
    if (!ids.includes(id)) fail(`--replace names ${id}, which is not in --cases`);
  const cases = ids.map((id) => {
    const item = findCase(source, id);
    const pending = item.attempts.at(-1);
    if (pending && pending.state === "running") fail(`${id} has a running attempt in the source run`);
    return {
      id,
      title: item.title,
      content: fs.readFileSync(replacements[id] ?? join(from, item.file), "utf8"),
    };
  });
  const created = create(
    opts["--run"],
    {
      feature: source.feature,
      repo: source.repo,
      mode: source.mode,
      fixOrder: source.fixOrder,
      stack: source.stack,
      fixture: source.fixture,
      cases,
    },
    {
      linkedFrom: {
        run: from,
        runId: source.runId,
        cases: ids,
        reason,
        ...(Object.keys(replacements).length ? { replaced: Object.keys(replacements) } : {}),
      },
    }
  );
  change(from, (state) => {
    state.linkedRuns = [
      ...(state.linkedRuns ?? []),
      { run: created.run, runId: created.runId, cases: ids, reason, created: now() },
    ];
  });
  return { ...created, linkedFrom: source.runId };
}
