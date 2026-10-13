// The run ledger: run.json state, attempts, results, cleanup, and reports.
import * as fs from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { fail, required } from "./cli.mjs";
import { sameSource, source } from "./git.mjs";

export const read = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
export const now = () => new Date().toISOString();
export const runsRoot = () => join(homedir(), ".waffled-qa", "runs");
// "Settings persistence" at 20:30:45 -> "settings-persistence-20260928-203045".
export function runName(feature, date = new Date()) {
  const slug =
    String(feature)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 48)
      .replace(/^-+|-+$/g, "") || "run";
  const pad = (n) => String(n).padStart(2, "0");
  const stamp =
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `${slug}-${stamp}`;
}
export function freeRunDirectory(feature) {
  const base = join(runsRoot(), runName(feature));
  let path = base;
  for (let n = 2; fs.existsSync(path); n++) path = `${base}-${n}`;
  return path;
}
export const id = (value) => {
  if (
    typeof value !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value)
  )
    fail("invalid case id");
  return value;
};
export function atomic(path, value) {
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(value, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    fs.renameSync(temp, path);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}
export function initialize(runOption, specFile) {
  const specPath = resolve(required(specFile, "--spec"));
  const spec = read(specPath);
  if (!Array.isArray(spec.cases) || !spec.cases.length)
    fail("at least one case is required");
  const cases = spec.cases.map((item) => ({
    id: item.id,
    title: item.title,
    content: fs.readFileSync(
      resolve(dirname(specPath), required(item.file, "case file")),
      "utf8"
    ),
  }));
  return create(runOption, { ...spec, cases });
}
// Creates a run from a spec whose cases carry their content. Shared by `init`
// and `regress`; `extra` adds fields such as linkedFrom to run.json.
export function create(runOption, spec, extra = {}) {
  required(spec.feature, "feature");
  const generated = !runOption;
  const run = resolve(runOption ?? freeRunDirectory(spec.feature));
  if (
    !isAbsolute(required(spec.repo, "repo")) ||
    !fs.statSync(spec.repo).isDirectory()
  )
    fail("repo must be an existing absolute directory");
  if (!Array.isArray(spec.cases) || !spec.cases.length)
    fail("at least one case is required");
  if (spec.mode !== undefined && !["fix", "report"].includes(spec.mode))
    fail("mode must be fix or report");
  if (
    spec.fixOrder !== undefined &&
    !["immediate", "deferred"].includes(spec.fixOrder)
  )
    fail("fixOrder must be immediate or deferred");
  if (
    spec.fixture !== undefined &&
    (typeof spec.fixture !== "object" || spec.fixture === null || Array.isArray(spec.fixture))
  )
    fail("fixture must be an object such as {\"household\": \"…\"}");
  // :8080 is the main install, :8081 the demo; the user names it (see SKILL.md).
  if (!["8080", "8081"].includes(String(spec.stack ?? "")))
    fail("stack must be 8080 or 8081; ask the user which stack this run tests");
  const seen = new Set();
  const cases = spec.cases.map((item) => {
    id(item.id);
    if (seen.has(item.id)) fail(`duplicate case: ${item.id}`);
    seen.add(item.id);
    return { id: item.id, title: required(item.title, "case title"), content: item.content };
  });
  fs.mkdirSync(dirname(run), { recursive: true });
  // An existing run is never overwritten.
  if (fs.existsSync(run))
    fail("run directory already exists; create a new linked run instead");
  fs.mkdirSync(run, { mode: 0o700 });
  fs.mkdirSync(join(run, "cases"));
  fs.mkdirSync(join(run, "attempts"));
  for (const item of cases)
    fs.writeFileSync(join(run, "cases", `${item.id}.md`), item.content, {
      flag: "wx",
      mode: 0o600,
    });
  const repo = fs.realpathSync(spec.repo);
  const state = {
    version: 1,
    // A generated directory name is unique; an explicit --run directory is not,
    // so its ID gets a short random suffix.
    runId: generated ? basename(run) : `${runName(spec.feature)}-${randomUUID().slice(0, 4)}`,
    feature: spec.feature,
    repo,
    mode: spec.mode ?? "fix",
    fixOrder: spec.fixOrder ?? "immediate",
    stack: String(spec.stack),
    ...(spec.fixture ? { fixture: spec.fixture } : {}),
    source: source(repo),
    ...extra,
    created: now(),
    updated: now(),
    cases: cases.map(({ id, title }) => ({
      id,
      title,
      file: `cases/${id}.md`,
      status: "pending",
      retries: { fix: 0, infra: 0, interrupted: 0 },
      attempts: [],
    })),
  };
  atomic(join(run, "run.json"), state);
  return { runId: state.runId, run, cases: state.cases.length };
}
export function load(run) {
  const state = read(join(run, "run.json"));
  if (state.version !== 1) fail("unsupported run version");
  return state;
}
// Runs created before fixOrder existed keep the immediate order.
export const deferred = (state) => state.fixOrder === "deferred";
export function openFindings(item) {
  const findings = new Map();
  for (const attempt of item.attempts) {
    for (const finding of attempt.result?.findings ?? []) {
      if (finding.requiresFix) findings.set(finding.id, finding);
    }
    for (const resolution of attempt.result?.resolutions ?? [])
      findings.delete(resolution.id);
  }
  return [...findings.values()];
}
export function status(run) {
  const state = load(run);
  const holding = deferred(state) ? ["running"] : ["running", "fixing"];
  const blockedBy = state.cases
    .filter(
      (item) =>
        holding.includes(item.status) ||
        item.attempts.at(-1)?.result?.cleanup.status === "incomplete"
    )
    .map((item) => item.id);
  return {
    runId: state.runId,
    run,
    feature: state.feature,
    repo: state.repo,
    mode: state.mode,
    fixOrder: state.fixOrder ?? "immediate",
    blockedBy,
    next: blockedBy.length
      ? null
      : (state.cases.find((item) => item.status === "pending")?.id ?? null),
    cases: state.cases.map((item) => ({
      id: item.id,
      status: item.status,
      retries: item.retries,
      attempt: item.attempts.at(-1) ?? null,
      openFindings: openFindings(item),
    })),
  };
}
// "main@1a2b3c4d5e6f" or "main@1a2b3c4d5e6f+dirty:0f1e2d3c".
export const describeSource = (src) =>
  src
    ? `${src.branch}@${src.head?.slice(0, 12) ?? "no-commit"}${src.dirty ? `+dirty:${src.diffHash?.slice(0, 8)}` : ""}`
    : "unknown";
// The status a coordinator needs between steps, without tokens or results:
// "save: fixing, attempt 2, 1 open finding".
export function briefStatus(run) {
  const full = status(run);
  const state = load(run);
  // Only runs stamped at init compare sources; older runs have none.
  const live = state.source ? source(state.repo) : null;
  return {
    runId: full.runId,
    mode: full.mode,
    fixOrder: full.fixOrder,
    source: live && describeSource(live),
    next: full.next,
    blockedBy: full.blockedBy,
    cases: full.cases.map((item) => {
      const parts = [item.status, `attempt ${item.attempt?.attempt ?? 0}`];
      if (live && item.attempt?.source && !sameSource(item.attempt.source, live))
        parts.push(`tested ${describeSource(item.attempt.source)}, source changed since`);
      const open = item.openFindings.length;
      if (open) parts.push(`${open} open finding${open === 1 ? "" : "s"}`);
      if (item.attempt?.result?.cleanup?.status === "incomplete")
        parts.push("cleanup incomplete");
      return `${item.id}: ${parts.join(", ")}`;
    }),
  };
}
export function change(run, action) {
  const lock = join(run, ".write-lock");
  try {
    fs.mkdirSync(lock);
  } catch (error) {
    if (error.code === "EEXIST")
      fail("run is locked; check the writer before recovering .write-lock");
    throw error;
  }
  try {
    const state = load(run);
    const result = action(state);
    state.updated = now();
    atomic(join(run, "run.json"), state);
    return result;
  } finally {
    fs.rmdirSync(lock);
  }
}
export function findCase(state, caseId) {
  const item = state.cases.find((entry) => entry.id === id(caseId));
  if (!item) fail(`unknown case: ${caseId}`);
  return item;
}
export function current(item, number, token) {
  const attempt = item.attempts.at(-1);
  if (!attempt || attempt.attempt !== Number(number) || attempt.token !== token)
    fail("stale attempt or wrong worker token");
  return attempt;
}
export function claim(run, opts) {
  return change(run, (state) => {
    const item = findCase(state, required(opts["--case"], "--case"));
    required(opts["--worker"], "--worker");
    if (state.cases.some((entry) => entry.status === "running"))
      fail("a case is already running");
    if (
      state.cases.some(
        (entry) =>
          entry.attempts.at(-1)?.result?.cleanup.status === "incomplete"
      )
    )
      fail("cleanup is incomplete; reconcile it before claiming a case");
    if (
      !deferred(state) &&
      state.cases.some(
        (entry) => entry.id !== item.id && entry.status === "fixing"
      )
    )
      fail("fix the current product defect before advancing");
    if (
      deferred(state) &&
      opts["--retry"] === "fix" &&
      state.cases.some((entry) => entry.status === "pending")
    )
      fail("deferred fix order: test the pending cases before fixing");
    const retry = opts["--retry"];
    if (item.attempts.length) {
      const last = item.attempts.at(-1);
      if (!["fix", "infra", "interrupted"].includes(retry))
        fail("repeat claims require --retry fix|infra|interrupted");
      if (["pass", "fixed", "quarantined"].includes(item.status))
        fail("case is terminal; create a new regression case");
      if (
        retry === "fix" &&
        (state.mode !== "fix" ||
          item.status !== "fixing" ||
          last.result?.cause === "infra")
      )
        fail(
          "case does not require a fix, or infrastructure must be recovered first"
        );
      if (
        retry === "infra" &&
        (last.state === "interrupted" || last.result?.cause !== "infra")
      )
        fail("case is not blocked on infrastructure");
      if (retry === "interrupted" && last.state !== "interrupted")
        fail("case was not interrupted");
      const limit = retry === "interrupted" ? 1 : 2;
      if (item.retries[retry] >= limit) fail(`${retry} retry limit reached`);
      item.retries[retry]++;
    } else if (retry) fail("first claim cannot be a retry");
    const number = item.attempts.length + 1;
    const directory = `attempts/${item.id}/${number}`;
    fs.mkdirSync(join(run, directory), { recursive: true });
    // An orphaned directory from a crashed writer may contain evidence. Never reuse it.
    if (fs.readdirSync(join(run, directory)).length)
      fail(
        "attempt directory already contains data; preserve and reconcile it first"
      );
    const attempt = {
      attempt: number,
      token: randomUUID(),
      worker: opts["--worker"],
      directory,
      started: now(),
      state: "running",
      retry: retry ?? null,
      source: source(state.repo),
    };
    item.attempts.push(attempt);
    item.status = "running";
    return {
      runId: state.runId,
      caseId: item.id,
      caseFile: item.file,
      ...attempt,
    };
  });
}
export function artifact(run, attempt, path) {
  required(path, "artifact path");
  if (isAbsolute(path)) fail("artifact paths must be relative to the run");
  const target = fs.realpathSync(resolve(run, path));
  const root = fs.realpathSync(join(run, attempt.directory));
  if (root !== join(fs.realpathSync(run), attempt.directory))
    fail("attempt directory must not redirect to another directory");
  const child = relative(root, target);
  if (child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child))
    fail("artifact must belong to this attempt");
  if (!fs.statSync(target).isFile() || fs.statSync(target).size === 0)
    fail("artifact must be a nonempty file");
  return path;
}
export function record(run, resultPath) {
  const result = read(resolve(required(resultPath, "--result")));
  return change(run, (state) => applyResult(run, state, result));
}
// Checks a result against the ledger without changing it; returns the case
// and attempt it belongs to. Shared by `record` and `result --dry-run`.
// Objects an attempt created or values it changed that are not yet restored.
export const outstanding = (attempt) =>
  (attempt.created ?? []).filter((object) => !object.retired);
function requireRetired(attempt, status) {
  const left = outstanding(attempt);
  if (status !== "incomplete" && left.length)
    fail(
      `cleanup is ${status} but ${left.map((o) => `${o.kind}:${o.id}`).join(", ")} ` +
        "not retired; run wqa created --retired <id> or record cleanup incomplete"
    );
}
export function validateResult(run, state, result) {
  if (result.runId !== state.runId) fail("result belongs to another run");
  const item = findCase(state, result.caseId);
  const attempt = current(item, result.attempt, result.token);
  if (attempt.state !== "running") fail("attempt has already finished");
  if (!["pass", "fail", "blocked"].includes(result.outcome))
    fail("outcome must be pass, fail, or blocked");
  if (!["product", "infra", "fixture", null].includes(result.cause))
    fail("invalid cause");
  if (result.outcome === "pass" && result.cause !== null)
    fail("pass must have a null cause; use findings for incidental defects");
  if (result.outcome === "fail" && result.cause !== "product")
    fail("a failure must identify a product defect");
  if (result.outcome === "blocked" && !result.cause)
    fail("blocked results require a cause");
  required(result.summary, "summary");
  artifact(run, attempt, result.report);
  if (
    !Array.isArray(result.evidence) ||
    (result.outcome === "pass" && !result.evidence.length)
  )
    fail("pass requires evidence");
  result.evidence.forEach((path) => artifact(run, attempt, path));
  if (!Array.isArray(result.findings)) fail("findings must be an array");
  for (const finding of result.findings) {
    id(finding.id);
    required(finding.summary, "finding summary");
    if (typeof finding.requiresFix !== "boolean")
      fail("finding requiresFix must be boolean");
  }
  const resolutions = result.resolutions ?? [];
  if (!Array.isArray(resolutions)) fail("resolutions must be an array");
  const unresolved = new Set(openFindings(item).map((finding) => finding.id));
  for (const resolution of resolutions) {
    id(resolution.id);
    if (!unresolved.delete(resolution.id))
      fail("resolution must identify an open finding exactly once");
    if (result.findings.some((finding) => finding.id === resolution.id))
      fail("a finding cannot be reported and resolved in the same attempt");
    required(resolution.summary, "resolution summary");
    if (!Array.isArray(resolution.evidence) || !resolution.evidence.length)
      fail("resolution requires verification evidence");
    resolution.evidence.forEach((path) => artifact(run, attempt, path));
  }
  if (!["clean", "incomplete", "not-needed"].includes(result.cleanup?.status))
    fail("cleanup status is required");
  required(result.cleanup.note, "cleanup note");
  requireRetired(attempt, result.cleanup.status);
  return { item, attempt, resolutions };
}
function applyResult(run, state, result) {
  const { item, attempt, resolutions } = validateResult(run, state, result);
  attempt.state = "finished";
  attempt.finished = now();
  attempt.result = {
    outcome: result.outcome,
    cause: result.cause,
    summary: result.summary,
    report: result.report,
    evidence: result.evidence,
    findings: result.findings,
    resolutions,
    cleanup: result.cleanup,
  };
  const needsFix =
    result.cause === "product" ||
    openFindings(item).length > 0;
  if (needsFix) item.needsFix = true;
  else if (result.outcome === "pass") item.needsFix = false;
  const exhausted =
    (needsFix && item.retries.fix >= 2) ||
    (result.cause === "infra" && item.retries.infra >= 2);
  item.status =
    result.cause === "fixture"
      ? "blocked"
      : item.needsFix && state.mode === "fix"
        ? exhausted
          ? "quarantined"
          : "fixing"
        : result.outcome === "pass"
          ? item.retries.fix
            ? "fixed"
            : "pass"
          : result.outcome;
  return {
    runId: state.runId,
    caseId: item.id,
    status: item.status,
    cleanup: result.cleanup.status,
  };
}
export function recover(run, opts) {
  if (opts["--worker-stopped"] !== "yes")
    fail("confirm the worker stopped before using --worker-stopped yes");
  required(opts["--reason"], "--reason");
  return change(run, (state) => {
    const item = findCase(state, opts["--case"]);
    const attempt = current(item, opts["--attempt"], opts["--token"]);
    if (attempt.state !== "running")
      fail("only a running attempt can be recovered");
    attempt.state = "interrupted";
    attempt.finished = now();
    attempt.result = {
      outcome: "blocked",
      cause: "infra",
      summary: opts["--reason"],
      report: null,
      evidence: [],
      findings: [],
      cleanup: {
        status: "incomplete",
        note: outstanding(attempt).length
          ? `Retire or restore ${outstanding(attempt).map((o) => `${o.kind}:${o.id}`).join(", ")}; then inspect other run-owned changes`
          : "Inspect run-owned changes after interruption",
      },
    };
    item.status =
      item.retries.interrupted >= 1
        ? "quarantined"
        : item.needsFix && state.mode === "fix"
          ? "fixing"
          : "blocked";
    return { caseId: item.id, status: item.status, cleanup: "incomplete" };
  });
}
export function cleanup(run, opts) {
  if (!["clean", "not-needed"].includes(opts["--status"]))
    fail("--status must be clean or not-needed");
  return change(run, (state) => {
    const item = findCase(state, opts["--case"]);
    const attempt = current(item, opts["--attempt"], opts["--token"]);
    if (attempt.result?.cleanup.status !== "incomplete")
      fail("attempt has no incomplete cleanup");
    requireRetired(attempt, opts["--status"]);
    const report = artifact(run, attempt, opts["--report"]);
    attempt.cleanupResolution = {
      status: opts["--status"],
      report,
      recorded: now(),
      previous: attempt.result.cleanup,
    };
    attempt.result.cleanup = {
      status: opts["--status"],
      note: `Verified in ${report}`,
    };
    return { caseId: item.id, cleanup: opts["--status"] };
  });
}
export function summarize(state) {
  const unresolved = state.cases.flatMap((item) =>
    openFindings(item).map((finding) => ({ caseId: item.id, ...finding }))
  );
  // A case without attempts has nothing to clean; a running attempt is unknown.
  const clean = state.cases.every((item) => {
    const attempt = item.attempts.at(-1);
    return (
      !attempt ||
      ["clean", "not-needed"].includes(attempt.result?.cleanup.status)
    );
  });
  const retryable = state.cases
    .filter((item) => {
      const attempt = item.attempts.at(-1);
      if (item.status !== "blocked" || attempt?.result?.cause !== "infra")
        return false;
      return attempt.state === "interrupted"
        ? item.retries.interrupted < 1
        : item.retries.infra < 2;
    })
    .map((item) => item.id);
  const complete =
    clean &&
    !retryable.length &&
    state.cases.every((item) =>
      ["pass", "fixed", "fail", "blocked", "quarantined"].includes(item.status)
    );
  const allPassed =
    complete &&
    !unresolved.length &&
    state.cases.every((item) => ["pass", "fixed"].includes(item.status));
  const counts = {};
  for (const item of state.cases)
    counts[item.status] = (counts[item.status] ?? 0) + 1;
  return { unresolved, clean, retryable, complete, allPassed, counts };
}
export function report(run) {
  const state = load(run);
  const { unresolved, clean, retryable, complete, allPassed, counts } =
    summarize(state);
  const escape = (text) =>
    String(text ?? "-")
      .replaceAll("|", "\\|")
      .replaceAll("\n", " ");
  const lines = [
    `# ${escape(state.feature)} — QA report`,
    "",
    `Run: ${state.runId}`,
    `Repository: ${state.repo}`,
    `Mode: ${state.mode}. Recorded: ${state.updated}.`,
    ...(state.source ? [`Source at init: ${describeSource(state.source)}.`] : []),
    ...(state.linkedFrom
      ? [`Linked from: ${state.linkedFrom.runId} (${state.linkedFrom.cases.join(", ")}): ${escape(state.linkedFrom.reason)}.`]
      : []),
    ...(state.linkedRuns ?? []).map(
      (link) => `Linked run: ${link.runId} (${link.cases.join(", ")}): ${escape(link.reason)}.`
    ),
    "",
    `Complete: ${complete}. All passed: ${allPassed}. Cleanup complete: ${clean}.`,
    "",
    "| Case | Status | Attempt | Cause | Cleanup | Result |",
    "|---|---|---|---|---|---|",
  ];
  for (const item of state.cases) {
    const attempt = item.attempts.at(-1);
    const result = attempt?.result;
    lines.push(
      `| ${item.id} | ${item.status} | ${attempt?.attempt ?? 0} | ${result?.cause ?? "-"} | ${result?.cleanup.status ?? "-"} | ${escape(result?.summary)} |`
    );
  }
  lines.push("", "## Open findings", "");
  if (!unresolved.length) lines.push("None.");
  for (const finding of unresolved)
    lines.push(`- ${finding.caseId} / ${finding.id}: ${escape(finding.summary)}.`);
  lines.push("", "## Evidence and attempt history", "");
  for (const item of state.cases) {
    for (const attempt of item.attempts) {
      const result = attempt.result;
      lines.push(
        `- ${item.id} attempt ${attempt.attempt}: ${attempt.state}; ${escape(result?.summary)}.` +
          (attempt.source ? ` Source: ${describeSource(attempt.source)}.` : "")
      );
      if (result?.report) lines.push(`  - [Case report](<${result.report}>)`);
      for (const path of result?.evidence ?? [])
        lines.push(`  - [Evidence](<${path}>)`);
      for (const finding of result?.findings ?? [])
        lines.push(
          `  - Finding ${finding.id}: ${escape(finding.summary)} (requires fix: ${finding.requiresFix}).`
        );
      for (const resolution of result?.resolutions ?? []) {
        lines.push(`  - Resolved ${resolution.id}: ${escape(resolution.summary)}.`);
        for (const path of resolution.evidence)
          lines.push(`    - [Verification](<${path}>)`);
      }
      if (attempt.cleanupResolution)
        lines.push(
          `  - [Cleanup verification](<${attempt.cleanupResolution.report}>)`
        );
    }
  }
  const path = join(run, "REPORT.md");
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, lines.join("\n") + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    fs.renameSync(temp, path);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
  return {
    runId: state.runId,
    path,
    complete,
    allPassed,
    cleanupComplete: clean,
    retryable,
    openFindings: unresolved,
    counts,
  };
}
// Every run directory under root, with its state or the error reading it.
export function* eachRun(root = runsRoot()) {
  const entries = fs.existsSync(root)
    ? fs.readdirSync(root, { withFileTypes: true })
    : [];
  for (const entry of entries) {
    const run = join(root, entry.name);
    if (!entry.isDirectory() || !fs.existsSync(join(run, "run.json"))) continue;
    try {
      yield { run, state: load(run) };
    } catch (error) {
      yield { run, error: error.message };
    }
  }
}
export const DURATION = { h: 3_600_000, d: 86_400_000, w: 604_800_000 };
// Deletes old runs, but never one that still needs attention.
export function prune(opts) {
  const root = resolve(opts["--root"] ?? runsRoot());
  const match = /^(\d+)([hdw])$/.exec(opts["--older-than"] ?? "30d");
  if (!match) fail("--older-than must look like 12h, 30d, or 4w");
  const cutoff = Date.now() - Number(match[1]) * DURATION[match[2]];
  const dryRun = Boolean(opts["--dry-run"]);
  const deleted = [];
  const kept = [];
  let recent = 0;
  for (const { run, state, error } of eachRun(root)) {
    if (error) {
      kept.push({ run, reason: `unreadable run.json: ${error}` });
      continue;
    }
    const updated = Date.parse(state.updated ?? state.created);
    if (!(updated < cutoff)) {
      recent++;
      continue;
    }
    const { unresolved, clean } = summarize(state);
    const reason = fs.existsSync(join(run, ".write-lock"))
      ? "locked by a writer"
      : state.cases.some((item) => item.status === "running")
        ? "an attempt is running"
        : unresolved.length
          ? `${unresolved.length} open finding(s)`
          : !clean
            ? "cleanup is incomplete"
            : null;
    if (reason) {
      kept.push({ run, reason });
      continue;
    }
    if (!dryRun) fs.rmSync(run, { recursive: true });
    deleted.push({ run, feature: state.feature, updated: state.updated });
  }
  return {
    root,
    olderThan: match[0],
    dryRun,
    [dryRun ? "wouldDelete" : "deleted"]: deleted,
    kept,
    recent,
  };
}
