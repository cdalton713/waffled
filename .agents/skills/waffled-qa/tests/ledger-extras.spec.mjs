import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { workspace } from "./helpers.mjs";

let ws;
afterEach(() => ws.cleanup());

const file = (attempt, name, text = "evidence") =>
  writeFileSync(join(ws.run, attempt.directory, name), text);
const pass = (extra = []) =>
  ws.invoke("result", "--outcome", "pass", "--summary", "ok", "--evidence", "e.txt",
    "--cleanup", "clean", "--cleanup-note", "restored", ...extra);

function gitRepo(dir) {
  mkdirSync(dir, { recursive: true });
  const git = (...args) => spawnSync("git", ["-C", dir, "-c", "user.email=a@b", "-c", "user.name=t", ...args]);
  git("init", "-q", "-b", "main");
  writeFileSync(join(dir, "app.js"), "v1\n");
  git("add", ".");
  git("commit", "-q", "-m", "init");
  return git;
}

describe("created and cleanup-plan", () => {
  beforeEach(() => {
    ws = workspace();
    ws.init();
  });

  test("a clean result needs every created object retired", () => {
    const attempt = ws.claim();
    file(attempt, "report.md");
    file(attempt, "e.txt");
    expect(ws.ok("created", "--kind", "rule", "--id", "r_1", "--restore", "archive in UI").outstanding).toEqual(["rule:r_1"]);
    ws.ok("created", "--kind", "setting", "--id", "shipping.threshold", "--restore", "set back to 50");
    expect(ws.invoke("created", "--kind", "rule", "--id", "r_1").stderr).toMatch(/already recorded/);

    const plan = ws.ok("cleanup-plan", "--run", ws.run);
    expect(plan.items.map((i) => i.id)).toEqual(["r_1", "shipping.threshold"]);

    const refused = pass();
    expect(refused.status).toBe(1);
    expect(refused.stderr).toMatch(/rule:r_1, setting:shipping.threshold not retired/);

    ws.ok("created", "--retired", "r_1");
    ws.ok("created", "--retired", "shipping.threshold", "--note", "read back 50");
    expect(ws.ok("cleanup-plan", "--run", ws.run).outstanding).toBe(0);
    expect(JSON.parse(pass().stdout).status).toBe("pass");
  });

  test("an incomplete result keeps the list, and cleanup verification needs it retired", () => {
    const attempt = ws.claim();
    file(attempt, "report.md");
    file(attempt, "cleanup.md", "Rule archived; read back archived.");
    ws.ok("created", "--kind", "rule", "--id", "r_2");
    ws.ok("result", "--outcome", "blocked", "--cause", "infra", "--summary", "worker down",
      "--cleanup", "incomplete", "--cleanup-note", "rule r_2 left");
    const args = ["cleanup", "--run", ws.run, "--case", "save", "--attempt", "1",
      "--token", attempt.token, "--status", "clean", "--report", `${attempt.directory}/cleanup.md`];
    expect(ws.invoke(...args).stderr).toMatch(/rule:r_2 not retired/);
    // Retiring works after the result is recorded.
    ws.ok("created", "--retired", "r_2");
    expect(ws.ok(...args).cleanup).toBe("clean");
  });

  test("recover names the objects still to retire", () => {
    const attempt = ws.claim();
    ws.ok("created", "--kind", "experience", "--id", "exp_9");
    ws.ok("recover", "--run", ws.run, "--case", "save", "--attempt", "1", "--token", attempt.token,
      "--reason", "worker crashed", "--worker-stopped", "yes");
    const note = ws.ok("status", "--run", ws.run).cases[0].attempt.result.cleanup.note;
    expect(note).toMatch(/experience:exp_9/);
  });
});

describe("source stamping", () => {
  test("status --brief flags attempts tested on a source that has changed", () => {
    const repoDir = join(tmpdir(), `wqa-src-${process.pid}-${Date.now()}`);
    const git = gitRepo(repoDir);
    ws = workspace({ repo: repoDir });
    ws.init();
    const state = JSON.parse(readFileSync(join(ws.run, "run.json"), "utf8"));
    expect(state.source).toMatchObject({ branch: "main", dirty: false });
    const attempt = ws.claim();
    expect(attempt.source.head).toBe(state.source.head);

    file(attempt, "report.md");
    file(attempt, "e.txt");
    ws.ok("result", "--outcome", "fail", "--summary", "lost", "--evidence", "e.txt",
      "--cleanup", "not-needed", "--cleanup-note", "none");
    expect(ws.ok("status", "--run", ws.run, "--brief").cases[0]).toBe("save: fixing, attempt 1");

    writeFileSync(join(repoDir, "app.js"), "v2\n");
    const brief = ws.ok("status", "--run", ws.run, "--brief");
    expect(brief.source).toMatch(/^main@[0-9a-f]{12}\+dirty:/);
    expect(brief.cases[0]).toMatch(/source changed since/);
    git("commit", "-qam", "fix");
    const report = ws.ok("report", "--run", ws.run);
    expect(readFileSync(report.path, "utf8")).toMatch(/Source: main@[0-9a-f]{12}\./);
    rmSync(repoDir, { recursive: true, force: true });
  });
});

describe("regress, list, and findings", () => {
  beforeEach(() => {
    ws = workspace({ cases: ["save", "reload"] });
    ws.init();
  });

  test("regress creates a linked run with copied or replaced cases", () => {
    const replacement = join(ws.dir, "save-v2.md");
    writeFileSync(replacement, "Corrected discriminator.");
    const linked = ws.ok("regress", "--from", ws.run, "--cases", "save,reload", "--reason", "fixture replaced",
      "--replace", `save=${replacement}`, "--run", join(ws.dir, "run-2"));
    expect(linked.linkedFrom).toBe(ws.ok("status", "--run", ws.run).runId);
    expect(readFileSync(join(linked.run, "cases", "save.md"), "utf8")).toBe("Corrected discriminator.");
    expect(readFileSync(join(linked.run, "cases", "reload.md"), "utf8")).toMatch(/Case reload/);
    const source = JSON.parse(readFileSync(join(ws.run, "run.json"), "utf8"));
    expect(source.linkedRuns[0]).toMatchObject({ runId: linked.runId, cases: ["save", "reload"] });
    const report = readFileSync(ws.ok("report", "--run", linked.run).path, "utf8");
    expect(report).toMatch(/Linked from: .*\(save, reload\): fixture replaced\./);
    const html = readFileSync(ws.ok("export", "--run", linked.run).path, "utf8");
    expect(html).toMatch(/Linked from .*\(save, reload\): fixture replaced/);
    expect(ws.invoke("regress", "--from", ws.run, "--cases", "missing", "--reason", "x").stderr).toMatch(/unknown case/);
  });

  test("list shows runs under the root and warns when active runs share a stack and household", () => {
    const root = join(ws.dir, "runs");
    const spec = JSON.parse(readFileSync(ws.spec, "utf8"));
    writeFileSync(ws.spec, JSON.stringify({ ...spec, fixture: { household: "h1" } }));
    const a = ws.ok("init", "--run", join(root, "a"), "--spec", ws.spec);
    const b = ws.ok("init", "--run", join(root, "b"), "--spec", ws.spec);
    const out = ws.ok("list", "--root", root, "--active");
    expect(out.runs.map((r) => r.runId).sort()).toEqual([a.runId, b.runId].sort());
    expect(out.warnings[0]).toMatch(/active runs share fixture stack=:8081 household=h1/);
  });

  test("active runs on the same stack warn even without a named fixture", () => {
    const root = join(ws.dir, "runs");
    ws.ok("init", "--run", join(root, "a"), "--spec", ws.spec);
    ws.ok("init", "--run", join(root, "b"), "--spec", ws.spec);
    expect(ws.ok("list", "--root", root, "--active").warnings[0]).toMatch(/share fixture stack=:8081:/);
  });

  test("init requires the stack to be 8080 or 8081", () => {
    const spec = JSON.parse(readFileSync(ws.spec, "utf8"));
    for (const stack of [undefined, "3000"]) {
      writeFileSync(ws.spec, JSON.stringify({ ...spec, stack }));
      expect(ws.invoke("init", "--run", join(ws.dir, `bad-${stack}`), "--spec", ws.spec).stderr).toMatch(/stack must be 8080 or 8081/);
    }
  });

  test("findings reports open, resolved, and observation states, within a run or across runs", () => {
    let attempt = ws.claim("save");
    file(attempt, "report.md");
    file(attempt, "e.txt");
    const findings = join(ws.dir, "f.json");
    writeFileSync(findings, JSON.stringify([
      { id: "toast-typo", summary: "Typo", requiresFix: true },
      { id: "slow-load", summary: "Slow first load", requiresFix: false },
    ]));
    pass(["--findings", findings]);
    expect(ws.ok("findings", "--run", ws.run, "--open").findings.map((f) => f.id)).toEqual(["toast-typo"]);

    attempt = ws.claim("save", "--retry", "fix");
    file(attempt, "report.md");
    file(attempt, "e.txt");
    const resolutions = join(ws.dir, "r.json");
    writeFileSync(resolutions, JSON.stringify([{ id: "toast-typo", summary: "Fixed", evidence: ["e.txt"] }]));
    pass(["--resolutions", resolutions]);
    const all = ws.ok("findings", "--run", ws.run).findings;
    expect(all.map((f) => [f.id, f.state])).toEqual([["toast-typo", "resolved"], ["slow-load", "observation"]]);
    expect(all[0]).toMatchObject({ firstAttempt: 1, resolvedIn: 2 });

    const across = ws.ok("findings", "--all-runs", "--root", ws.dir, "--id", "toast");
    expect(across.findings).toHaveLength(1);
    expect(across.findings[0].run).toBe(ws.run);
  });
});

describe("brief", () => {
  beforeEach(() => {
    ws = workspace();
    ws.init();
  });

  test("writes a runner brief with the claim identity and a numbered step", () => {
    const attempt = ws.claim();
    const first = ws.ok("brief", "--role", "runner", "--zellij");
    expect(first).toMatchObject({ role: "runner", step: "runner-1" });
    const text = readFileSync(first.brief, "utf8");
    expect(text).toContain(`--as ${attempt.handle}`);
    expect(text).toContain(join(ws.run, "cases", "save.md"));
    expect(text).toContain("wqa result --no-record");
    expect(text).not.toMatch(/\{\{/);
    expect(ws.ok("brief", "--role", "runner").step).toBe("runner-2");
  });

  test("diagnose works after the result; fix requires base and target", () => {
    const attempt = ws.claim();
    file(attempt, "report.md");
    file(attempt, "e.txt");
    ws.ok("result", "--outcome", "fail", "--summary", "lost", "--evidence", "e.txt",
      "--cleanup", "not-needed", "--cleanup-note", "none");
    const diagnosis = ws.ok("brief", "--role", "diagnose");
    expect(diagnosis.output).toBe(join(ws.run, attempt.directory, "diagnose-1.md"));
    expect(ws.invoke("brief", "--role", "fix").stderr).toMatch(/needs --base and --target/);
    const fix = ws.ok("brief", "--role", "fix", "--base", "abc123", "--target", "feature/x");
    expect(readFileSync(fix.brief, "utf8")).toMatch(/based on `abc123`; the coordinator integrates into `feature\/x`/);
    expect(ws.invoke("brief", "--role", "runner").stderr).toMatch(/not running/);
  });
});
