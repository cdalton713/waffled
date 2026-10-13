import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { workspace } from "./helpers.mjs";

let ws;
beforeEach(() => {
  ws = workspace({ cases: ["save", "reload"] });
  ws.init();
});
afterEach(() => ws.cleanup());

const evidence = (attempt, name, text = "Read after save: new-value") =>
  writeFileSync(join(ws.run, attempt.directory, name), text);

test("status --brief prints one line per case without tokens", () => {
  const attempt = ws.claim("save");
  const brief = ws.ok("status", "--run", ws.run, "--brief");
  expect(brief.cases).toEqual(["save: running, attempt 1", "reload: pending, attempt 0"]);
  expect(brief.next).toBeNull();
  expect(JSON.stringify(brief)).not.toContain(attempt.token);
});

test("--compact prints a single JSON line", () => {
  const out = ws.invoke("status", "--run", ws.run, "--brief", "--compact");
  expect(out.stdout.trim().split("\n")).toHaveLength(1);
});

test("result builds, writes, and records the result from the worker environment", () => {
  const attempt = ws.claim("save");
  evidence(attempt, "report.md", "Expected saved value; saw it.");
  evidence(attempt, "after-save.json");
  const out = ws.ok(
    "result",
    "--outcome", "pass",
    "--summary", "Setting persists",
    "--evidence", "after-save.json",
    "--cleanup", "not-needed",
    "--cleanup-note", "No objects created"
  );
  expect(out).toMatchObject({ caseId: "save", status: "pass", written: `${attempt.directory}/result.json` });
  const saved = JSON.parse(readFileSync(join(ws.run, attempt.directory, "result.json"), "utf8"));
  expect(saved).toMatchObject({
    token: attempt.token,
    report: `${attempt.directory}/report.md`,
    evidence: [`${attempt.directory}/after-save.json`],
    cause: null,
  });
});

test("result --dry-run validates without writing or recording", () => {
  const attempt = ws.claim("save");
  evidence(attempt, "report.md");
  const args = ["--outcome", "pass", "--summary", "s", "--cleanup", "clean", "--cleanup-note", "n"];
  // A pass without evidence is invalid, and --dry-run reports it.
  const bad = ws.invoke("result", ...args, "--dry-run");
  expect(bad.status).toBe(1);
  expect(bad.stderr).toMatch(/pass requires evidence/);
  evidence(attempt, "e.txt");
  expect(ws.ok("result", ...args, "--evidence", "e.txt", "--dry-run")).toMatchObject({ valid: true });
  expect(ws.ok("status", "--run", ws.run).cases[0].status).toBe("running");
});

test("result --no-record writes the file for a coordinator to record", () => {
  const attempt = ws.claim("save");
  evidence(attempt, "report.md");
  evidence(attempt, "e.txt");
  const out = ws.ok(
    "result", "--outcome", "fail", "--summary", "Value lost after reload",
    "--evidence", "e.txt", "--cleanup", "clean", "--cleanup-note", "Restored",
    "--no-record"
  );
  expect(out).toEqual({ written: `${attempt.directory}/result.json`, recorded: false });
  expect(ws.ok("status", "--run", ws.run).cases[0].status).toBe("running");
  const recorded = ws.ok("record", "--run", ws.run, "--result", join(ws.run, out.written));
  expect(recorded.status).toBe("fixing");
});

test("result takes findings and resolutions from JSON files with bare evidence names", () => {
  let attempt = ws.claim("save");
  evidence(attempt, "report.md");
  evidence(attempt, "e.txt");
  const findings = join(ws.dir, "findings.json");
  writeFileSync(findings, JSON.stringify([{ id: "toast-typo", summary: "Typo", requiresFix: true }]));
  ws.ok(
    "result", "--outcome", "pass", "--summary", "Saved", "--evidence", "e.txt",
    "--findings", findings, "--cleanup", "clean", "--cleanup-note", "n"
  );
  attempt = ws.claim("save", "--retry", "fix");
  evidence(attempt, "report.md");
  evidence(attempt, "toast.txt", "Toast reads correctly");
  const resolutions = join(ws.dir, "resolutions.json");
  writeFileSync(
    resolutions,
    JSON.stringify([{ id: "toast-typo", summary: "Fixed", evidence: ["toast.txt"] }])
  );
  const out = ws.ok(
    "result", "--outcome", "pass", "--summary", "Saved", "--evidence", "toast.txt",
    "--resolutions", resolutions, "--cleanup", "clean", "--cleanup-note", "n"
  );
  expect(out.status).toBe("fixed");
});

test("result refuses a stale token", () => {
  const attempt = ws.claim("save");
  evidence(attempt, "report.md");
  ws.env.WAFFLED_QA_TOKEN = "stale";
  const out = ws.invoke("result", "--outcome", "blocked", "--cause", "infra", "--summary", "s",
    "--cleanup", "clean", "--cleanup-note", "n");
  expect(out.status).toBe(1);
  expect(out.stderr).toMatch(/stale attempt/);
});
