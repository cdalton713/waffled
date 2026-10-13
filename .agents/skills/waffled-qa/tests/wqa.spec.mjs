import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
  symlinkSync,
  mkdirSync,
  renameSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../scripts/wqa.mjs", import.meta.url));
let dir, run, spec;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "wqa-test-"));
  run = join(dir, "run");
  spec = join(dir, "spec.json");
  writeFileSync(
    spec,
    JSON.stringify({
      feature: "Settings save",
      repo: dir,
      stack: "8081",
      cases: [
        { id: "save", title: "Persist a changed setting", file: "save.md" },
      ],
    })
  );
  writeFileSync(
    join(dir, "save.md"),
    "Change the setting, save, then reopen. Expect the saved value."
  );
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));
function invoke(...args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
}
function ok(...args) {
  const result = invoke(...args);
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout);
}
function init(target = run) {
  return ok("init", "--run", target, "--spec", spec);
}

test("rejects an attempt directory redirected outside the run", () => {
  init();
  const attempt = claim();
  const moved = join(dir, "moved-attempt");
  renameSync(join(run, attempt.directory), moved);
  symlinkSync(moved, join(run, attempt.directory));
  const result = resultFile(attempt);
  expect(invoke("record", "--run", run, "--result", result).status).toBe(1);
  expect(ok("status", "--run", run).cases[0].status).toBe("running");
});
function claim(...args) {
  return ok(
    "claim",
    "--run",
    run,
    "--case",
    "save",
    "--worker",
    "worker-1",
    ...args
  );
}
function resultFile(attempt, changes = {}) {
  writeFileSync(
    join(run, attempt.directory, "report.md"),
    "Expected: saved value. Actual: saved value. Cleanup: no objects created."
  );
  writeFileSync(
    join(run, attempt.directory, "evidence.txt"),
    "Read after save: new-value"
  );
  const result = {
    runId: attempt.runId,
    caseId: "save",
    attempt: attempt.attempt,
    token: attempt.token,
    outcome: "pass",
    cause: null,
    summary: "Setting persists",
    report: `${attempt.directory}/report.md`,
    evidence: [`${attempt.directory}/evidence.txt`],
    findings: [],
    cleanup: { status: "not-needed", note: "No test objects" },
    ...changes,
  };
  const path = join(dir, "result.json");
  writeFileSync(path, JSON.stringify(result));
  return path;
}
function record(attempt, changes) {
  return ok("record", "--run", run, "--result", resultFile(attempt, changes));
}

test("initializes independent runs and refuses to overwrite saved progress", () => {
  const first = init();
  const second = init(join(dir, "other-run"));
  expect(first.runId).not.toBe(second.runId);
  const before = readFileSync(join(run, "run.json"), "utf8");
  expect(invoke("init", "--run", run, "--spec", spec).status).toBe(1);
  expect(readFileSync(join(run, "run.json"), "utf8")).toBe(before);
  expect(ok("status", "--run", run).next).toBe("save");
  expect(readFileSync(join(run, "cases", "save.md"), "utf8")).toContain(
    "Expect the saved value"
  );
});

test("rejects duplicate claims and results from another run or a stale worker", () => {
  init();
  const attempt = claim();
  expect(attempt.attempt).toBe(1);
  expect(
    invoke("claim", "--run", run, "--case", "save", "--worker", "worker-2")
      .status
  ).toBe(1);
  for (const changes of [
    { token: "wrong-worker" },
    { runId: "old-run" },
    { attempt: 2 },
  ]) {
    expect(
      invoke("record", "--run", run, "--result", resultFile(attempt, changes))
        .status
    ).toBe(1);
  }
  expect(ok("status", "--run", run).cases[0].status).toBe("running");
  expect(record(attempt).status).toBe("pass");
  expect(
    invoke("record", "--run", run, "--result", resultFile(attempt)).status
  ).toBe(1);
});

test("keeps failed attempts and permits at most two fix cycles", () => {
  init();
  let attempt = claim();
  const failed = {
    outcome: "fail",
    cause: "product",
    summary: "Save does not persist",
  };
  expect(record(attempt, failed).status).toBe("fixing");
  for (let n = 1; n <= 2; n++) {
    attempt = claim("--retry", "fix");
    expect(attempt.attempt).toBe(n + 1);
    record(attempt, failed);
  }
  const state = ok("status", "--run", run).cases[0];
  expect(state.status).toBe("quarantined");
  expect(state.retries.fix).toBe(2);
  expect(
    invoke(
      "claim",
      "--run",
      run,
      "--case",
      "save",
      "--worker",
      "worker-1",
      "--retry",
      "fix"
    ).status
  ).toBe(1);
  expect(readFileSync(join(run, "run.json"), "utf8")).toContain(
    "Save does not persist"
  );
  expect(existsSync(join(run, "attempts", "save", "1", "report.md"))).toBe(
    true
  );
});

test("records failed cleanup without losing the verdict and blocks the next claim", () => {
  init();
  const attempt = claim();
  record(attempt, {
    outcome: "fail",
    cause: "product",
    cleanup: { status: "incomplete", note: "Delete button fails" },
  });
  expect(
    invoke(
      "claim",
      "--run",
      run,
      "--case",
      "save",
      "--worker",
      "worker-1",
      "--retry",
      "fix"
    ).status
  ).toBe(1);
  const report = ok("report", "--run", run);
  expect(report.complete).toBe(false);
  expect(readFileSync(report.path, "utf8")).toContain("incomplete");
  ok(
    "cleanup",
    "--run",
    run,
    "--case",
    "save",
    "--attempt",
    "1",
    "--token",
    attempt.token,
    "--status",
    "clean",
    "--report",
    `${attempt.directory}/report.md`
  );
  expect(claim("--retry", "fix").attempt).toBe(2);
});

test("recovers a stopped worker without accepting its late result", () => {
  init();
  const first = claim();
  expect(
    invoke(
      "recover",
      "--run",
      run,
      "--case",
      "save",
      "--attempt",
      "1",
      "--token",
      first.token,
      "--reason",
      "Worker exited"
    ).status
  ).toBe(1);
  ok(
    "recover",
    "--run",
    run,
    "--case",
    "save",
    "--attempt",
    "1",
    "--token",
    first.token,
    "--reason",
    "Worker exited; session confirmed stopped",
    "--worker-stopped",
    "yes"
  );
  resultFile(first);
  ok(
    "cleanup",
    "--run",
    run,
    "--case",
    "save",
    "--attempt",
    "1",
    "--token",
    first.token,
    "--status",
    "not-needed",
    "--report",
    `${first.directory}/report.md`
  );
  const second = claim("--retry", "interrupted");
  expect(
    invoke("record", "--run", run, "--result", resultFile(first)).status
  ).toBe(1);
  expect(record(second).status).toBe("pass");
  expect(ok("report", "--run", run).complete).toBe(true);
});

test("reports an expected empty result as a pass with execution evidence", () => {
  init();
  const attempt = claim();
  record(attempt, {
    summary: "Final page is empty, cursor ended, request was executed",
  });
  expect(ok("report", "--run", run).allPassed).toBe(true);
});

test("rejects a pass that also reports a blocking cause", () => {
  init();
  const attempt = claim();
  for (const cause of ["infra", "fixture", "product"]) {
    expect(
      invoke("record", "--run", run, "--result", resultFile(attempt, { cause }))
        .status
    ).toBe(1);
  }
  expect(ok("status", "--run", run).cases[0].status).toBe("running");
});

test("keeps an open product defect when its verification is blocked on infrastructure", () => {
  const input = JSON.parse(readFileSync(spec, "utf8"));
  input.cases.push({ id: "other", title: "Another case", file: "save.md" });
  writeFileSync(spec, JSON.stringify(input));
  init();
  record(claim(), { outcome: "fail", cause: "product" });
  record(claim("--retry", "fix"), { outcome: "blocked", cause: "infra" });
  expect(
    invoke("claim", "--run", run, "--case", "other", "--worker", "worker-2")
      .status
  ).toBe(1);
  expect(ok("status", "--run", run).next).toBe(null);
  expect(record(claim("--retry", "infra")).status).toBe("fixed");
  expect(
    ok("claim", "--run", run, "--case", "other", "--worker", "worker-2").attempt
  ).toBe(1);
});

test("keeps infrastructure work incomplete until retries are exhausted", () => {
  init();
  const blocked = {
    outcome: "blocked",
    cause: "infra",
    summary: "Worker unavailable",
  };
  record(claim(), blocked);
  expect(ok("report", "--run", run).complete).toBe(false);
  for (let n = 0; n < 2; n++) record(claim("--retry", "infra"), blocked);
  expect(
    invoke(
      "claim",
      "--run",
      run,
      "--case",
      "save",
      "--worker",
      "worker-1",
      "--retry",
      "infra"
    ).status
  ).toBe(1);
  const report = ok("report", "--run", run);
  expect(report.complete).toBe(true);
  expect(report.allPassed).toBe(false);
  expect(report.counts.blocked).toBe(1);
});

test("requires a retest for an incidental defect even when the main case passed", () => {
  init();
  record(claim(), {
    findings: [
      {
        id: "cancel-error",
        summary: "Cancel shows an error",
        requiresFix: true,
      },
    ],
  });
  expect(ok("report", "--run", run).allPassed).toBe(false);
  const retest = claim("--retry", "fix");
  expect(record(retest, {
    resolutions: [{
      id: "cancel-error",
      summary: "Cancel completes without an error",
      evidence: [`${retest.directory}/evidence.txt`],
    }],
  }).status).toBe("fixed");
  expect(ok("report", "--run", run).allPassed).toBe(true);
});

test("keeps omitted findings open until each has an explicit verified resolution", () => {
  init();
  const findings = [
    { id: "cancel-error", summary: "Cancel fails", requiresFix: true },
    { id: "delete-error", summary: "Delete fails", requiresFix: true },
  ];
  record(claim(), { findings });
  const partial = claim("--retry", "fix");
  expect(record(partial, {
    resolutions: [{
      id: "cancel-error",
      summary: "Cancel completes without an error",
      evidence: [`${partial.directory}/evidence.txt`],
    }],
  }).status).toBe("fixing");
  expect(ok("status", "--run", run).cases[0].openFindings).toEqual([findings[1]]);
  const unfinished = ok("report", "--run", run);
  expect(unfinished.allPassed).toBe(false);
  expect(unfinished.openFindings).toEqual([{ caseId: "save", ...findings[1] }]);
  const final = claim("--retry", "fix");
  expect(record(final, {
    resolutions: [{
      id: "delete-error",
      summary: "Delete removes only the selected object",
      evidence: [`${final.directory}/evidence.txt`],
    }],
  }).status).toBe("fixed");
  const report = ok("report", "--run", run);
  expect(report.allPassed).toBe(true);
  expect(report.openFindings).toEqual([]);
  expect(readFileSync(report.path, "utf8")).toContain("Resolved delete-error");
});

test("quarantines unresolved findings after two passing main-case retests", () => {
  init();
  const finding = { id: "cancel-error", summary: "Cancel fails", requiresFix: true };
  record(claim(), { findings: [finding] });
  expect(record(claim("--retry", "fix")).status).toBe("fixing");
  expect(record(claim("--retry", "fix"), {
    findings: [{ ...finding, requiresFix: false }],
  }).status).toBe("quarantined");
  const report = ok("report", "--run", run);
  expect(report.complete).toBe(true);
  expect(report.allPassed).toBe(false);
  expect(report.openFindings).toEqual([{ caseId: "save", ...finding }]);
});

test("rejects unknown, duplicate, contradictory, or unsupported resolutions without finishing the attempt", () => {
  init();
  const finding = { id: "cancel-error", summary: "Cancel fails", requiresFix: true };
  const first = claim();
  record(first, { findings: [finding] });
  const retest = claim("--retry", "fix");
  const resolution = {
    id: finding.id,
    summary: "Cancel closes the dialog without an error",
    evidence: [`${retest.directory}/evidence.txt`],
  };
  for (const changes of [
    { resolutions: {} },
    { resolutions: [{ ...resolution, id: "unknown" }] },
    { resolutions: [resolution, resolution] },
    { resolutions: [resolution], findings: [finding] },
    { resolutions: [{ ...resolution, summary: "" }] },
    { resolutions: [{ ...resolution, evidence: [] }] },
    { resolutions: [{ ...resolution, evidence: [`${first.directory}/evidence.txt`] }] },
    { resolutions: [{ ...resolution, evidence: [`${retest.directory}/missing.txt`] }] },
  ]) {
    expect(invoke("record", "--run", run, "--result", resultFile(retest, changes)).status).toBe(1);
    const current = ok("status", "--run", run).cases[0];
    expect(current.status).toBe("running");
    expect(current.openFindings).toEqual([finding]);
  }
  expect(record(retest, { resolutions: [resolution] }).status).toBe("fixed");
});

test("keeps findings open across interrupted and infrastructure-blocked retests", () => {
  init();
  const finding = { id: "cancel-error", summary: "Cancel fails", requiresFix: true };
  record(claim(), { findings: [finding] });
  const stopped = claim("--retry", "fix");
  ok("recover", "--run", run, "--case", "save", "--attempt", String(stopped.attempt),
    "--token", stopped.token, "--reason", "Worker stopped", "--worker-stopped", "yes");
  writeFileSync(join(run, stopped.directory, "cleanup.md"), "No state changed before interruption.");
  ok("cleanup", "--run", run, "--case", "save", "--attempt", String(stopped.attempt),
    "--token", stopped.token, "--status", "not-needed", "--report", `${stopped.directory}/cleanup.md`);
  record(claim("--retry", "interrupted"), { outcome: "blocked", cause: "infra" });
  expect(ok("status", "--run", run).cases[0].openFindings).toEqual([finding]);
  const retest = claim("--retry", "infra");
  expect(record(retest, {
    resolutions: [{ id: finding.id, summary: "Cancel verified", evidence: [`${retest.directory}/evidence.txt`] }],
  }).status).toBe("fixed");
  expect(ok("report", "--run", run).allPassed).toBe(true);
});

test("report mode exposes unresolved incidental findings without requesting a fix", () => {
  const input = JSON.parse(readFileSync(spec, "utf8"));
  writeFileSync(spec, JSON.stringify({ ...input, mode: "report" }));
  init();
  const finding = { id: "cancel-error", summary: "Cancel fails", requiresFix: true };
  expect(record(claim(), { findings: [finding] }).status).toBe("pass");
  const report = ok("report", "--run", run);
  expect(report.complete).toBe(true);
  expect(report.allPassed).toBe(false);
  expect(report.openFindings).toEqual([{ caseId: "save", ...finding }]);
});

test("report mode retains findings and prevents fix claims", () => {
  const input = JSON.parse(readFileSync(spec, "utf8"));
  writeFileSync(spec, JSON.stringify({ ...input, mode: "report" }));
  init();
  record(claim(), { outcome: "fail", cause: "product" });
  expect(
    invoke(
      "claim",
      "--run",
      run,
      "--case",
      "save",
      "--worker",
      "worker-1",
      "--retry",
      "fix"
    ).status
  ).toBe(1);
  expect(ok("report", "--run", run).counts.fail).toBe(1);
});

test("requires evidence from this attempt and rejects outside files and symlinks", () => {
  init();
  const attempt = claim();
  const outside = join(dir, "outside.txt");
  writeFileSync(outside, "Evidence from another run");
  symlinkSync(outside, join(run, attempt.directory, "outside-link"));
  for (const evidence of [
    [],
    ["../outside.txt"],
    [`${attempt.directory}/outside-link`],
    [`${attempt.directory}/missing.txt`],
  ]) {
    expect(
      invoke(
        "record",
        "--run",
        run,
        "--result",
        resultFile(attempt, { evidence })
      ).status
    ).toBe(1);
  }
  expect(record(attempt).status).toBe("pass");
});

test("does not change state when another writer holds the lock", () => {
  init();
  mkdirSync(join(run, ".write-lock"));
  const before = readFileSync(join(run, "run.json"), "utf8");
  expect(
    invoke("claim", "--run", run, "--case", "save", "--worker", "worker-1")
      .status
  ).toBe(1);
  expect(readFileSync(join(run, "run.json"), "utf8")).toBe(before);
  expect(ok("status", "--run", run).cases[0].status).toBe("pending");
});

test("rejects invalid case IDs and missing case files before creating the run", () => {
  for (const changes of [{ id: "../escape" }, { file: "missing.md" }]) {
    writeFileSync(
      spec,
      JSON.stringify({
        feature: "Settings",
        repo: dir,
        stack: "8081",
        cases: [{ id: "save", title: "Save", file: "save.md", ...changes }],
      })
    );
    expect(invoke("init", "--run", run, "--spec", spec).status).toBe(1);
    expect(existsSync(run)).toBe(false);
  }
});

test("preserves a product finding when its verification needs a different fixture", () => {
  init();
  record(claim(), { outcome: "fail", cause: "product" });
  record(claim("--retry", "fix"), {
    outcome: "blocked",
    cause: "fixture",
    summary: "Fixture cannot exercise the boundary",
  });
  const current = ok("status", "--run", run).cases[0];
  expect(current.status).toBe("blocked");
  expect(current.retries.fix).toBe(1);
  expect(
    invoke(
      "claim",
      "--run",
      run,
      "--case",
      "save",
      "--worker",
      "worker-1",
      "--retry",
      "fix"
    ).status
  ).toBe(1);
  expect(
    JSON.parse(readFileSync(join(run, "run.json"), "utf8")).cases[0].needsFix
  ).toBe(true);
  expect(ok("report", "--run", run).allPassed).toBe(false);
});

function twoCaseSpec(extra = {}) {
  writeFileSync(join(dir, "other.md"), "Open the list. Expect the saved row.");
  const base = JSON.parse(readFileSync(spec, "utf8"));
  base.cases.push({
    id: "other",
    title: "List shows the row",
    file: "other.md",
  });
  writeFileSync(spec, JSON.stringify({ ...base, ...extra }));
}
function claimCase(caseId, ...args) {
  return invoke(
    "claim",
    "--run",
    run,
    "--case",
    caseId,
    "--worker",
    "worker-2",
    ...args
  );
}
const productFailure = {
  outcome: "fail",
  cause: "product",
  summary: "Save does not persist",
};

test("immediate fix order holds other cases until the open defect is fixed", () => {
  twoCaseSpec();
  init();
  record(claim(), productFailure);
  expect(ok("status", "--run", run).next).toBeNull();
  expect(claimCase("other").status).toBe(1);
});

test("deferred fix order tests every case before the fix phase starts", () => {
  twoCaseSpec({ fixOrder: "deferred" });
  init();
  expect(ok("status", "--run", run).fixOrder).toBe("deferred");
  record(claim(), productFailure);
  expect(ok("status", "--run", run).next).toBe("other");
  expect(claimCase("save", "--retry", "fix").stderr).toContain("pending");
  const other = JSON.parse(claimCase("other").stdout);
  writeFileSync(join(run, other.directory, "report.md"), "Row visible.");
  writeFileSync(join(run, other.directory, "evidence.txt"), "row: new-value");
  const result = join(dir, "other-result.json");
  writeFileSync(
    result,
    JSON.stringify({
      runId: other.runId,
      caseId: "other",
      attempt: other.attempt,
      token: other.token,
      outcome: "pass",
      cause: null,
      summary: "Row visible",
      report: `${other.directory}/report.md`,
      evidence: [`${other.directory}/evidence.txt`],
      findings: [],
      cleanup: { status: "not-needed", note: "Read only" },
    })
  );
  ok("record", "--run", run, "--result", result);
  expect(claim("--retry", "fix").attempt).toBe(2);
});

test("rejects an unknown fix order", () => {
  twoCaseSpec({ fixOrder: "later" });
  expect(invoke("init", "--run", run, "--spec", spec).status).toBe(1);
  expect(existsSync(run)).toBe(false);
});

test("reports cleanup as complete until an attempt leaves work to clean", () => {
  init();
  expect(ok("report", "--run", run).cleanupComplete).toBe(true);
  const attempt = claim();
  expect(ok("report", "--run", run).cleanupComplete).toBe(false);
  record(attempt);
  expect(ok("report", "--run", run).cleanupComplete).toBe(true);
});

test("init creates a fresh run even when WAFFLED_QA_RUN_DIR names an existing one", () => {
  init();
  const result = spawnSync(process.execPath, [cli, "init", "--spec", spec], {
    encoding: "utf8",
    env: { ...process.env, WAFFLED_QA_RUN_DIR: run, HOME: dir },
  });
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout).run).not.toBe(run);
  const again = invoke("init", "--run", run, "--spec", spec);
  expect(again.stderr).toContain("already exists");
});
