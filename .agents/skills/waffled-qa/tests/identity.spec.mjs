// The claim handle and run inference: a worker names its attempt with one
// value, and a coordinator in the tested checkout can omit --run.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cli, workspace } from "./helpers.mjs";

let ws;
beforeEach(() => {
  ws = workspace({ cases: ["save", "reload"] });
  ws.init();
});
afterEach(() => ws.cleanup());

const claim = (caseId = "save", ...args) =>
  ws.ok("claim", "--run", ws.run, "--case", caseId, "--worker", "w1", ...args);

// A blocked infrastructure result: it needs no evidence and allows a retry.
const block = (...args) =>
  ws.invoke("result", ...args, "--outcome", "blocked", "--cause", "infra", "--summary", "Backend down",
    "--cleanup", "not-needed", "--cleanup-note", "n");

// Runs the CLI from `cwd` with only HOME and `env` set, so no identity leaks in.
const from = (cwd, env, ...args) =>
  spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, WAFFLED_QA: "", WAFFLED_QA_RUN_DIR: "", WAFFLED_QA_CASE: "", WAFFLED_QA_TOKEN: "", HOME: ws.dir, ...env },
  });

test("claim returns a handle that names the run, case, and attempt", () => {
  const attempt = claim();
  expect(attempt.handle).toBe(`${attempt.runId}/save/1.${attempt.token}`);
});

test("--as alone records a worker result for a run outside the runs root", () => {
  const attempt = claim();
  writeFileSync(join(ws.run, attempt.directory, "report.md"), "saw it");
  const out = block("--as", attempt.handle);
  expect(out.stderr).toBe("");
  expect(JSON.parse(out.stdout)).toMatchObject({ caseId: "save", status: "blocked" });
});

test("WAFFLED_QA works like --as", () => {
  const attempt = claim();
  writeFileSync(join(ws.run, attempt.directory, "report.md"), "saw it");
  ws.env.WAFFLED_QA = attempt.handle;
  expect(JSON.parse(block().stdout)).toMatchObject({ caseId: "save", status: "blocked" });
});

test("a handle for an earlier attempt is refused", () => {
  const first = claim();
  writeFileSync(join(ws.run, first.directory, "report.md"), "backend down");
  expect(block("--as", first.handle).status).toBe(0);
  const second = claim("save", "--retry", "infra");
  writeFileSync(join(ws.run, second.directory, "report.md"), "backend down");
  const out = block("--as", first.handle);
  expect(out.status).toBe(1);
  expect(out.stderr).toMatch(/stale attempt/);
});

test("a handle from another run is refused with --run", () => {
  const attempt = claim();
  const other = workspace();
  other.init();
  try {
    const out = block("--as", attempt.handle, "--run", other.run);
    expect(out.status).toBe(1);
    expect(out.stderr).toMatch(/belongs to run/);
  } finally {
    other.cleanup();
  }
});

test("a malformed or unknown handle fails with a clear message", () => {
  expect(block("--as", "nope").stderr).toMatch(/invalid handle/);
  const out = block("--as", `gone-20260101-000000/save/1.${"0".repeat(8)}-0000-0000-0000-${"0".repeat(12)}`);
  expect(out.stderr).toMatch(/run gone-20260101-000000 not found/);
});

describe("without --run", () => {
  // Runs created under ~/.waffled-qa/runs for a Git checkout, as `init` does by default.
  let repo;
  const initIn = (feature) => {
    const spec = join(ws.dir, `${feature}.json`);
    writeFileSync(spec, JSON.stringify({ feature, repo, stack: "8081", cases: [{ id: "save", title: "Save", file: "save.md" }] }));
    return JSON.parse(from(ws.dir, {}, "init", "--spec", spec).stdout);
  };
  beforeEach(() => {
    repo = join(ws.dir, "repo");
    mkdirSync(repo);
    spawnSync("git", ["init", "-q", repo]);
  });

  test("status uses the only open run for the checkout", () => {
    const { runId } = initIn("One feature");
    const out = from(repo, {}, "status");
    expect(out.stderr).toBe("");
    expect(JSON.parse(out.stdout).runId).toBe(runId);
  });

  test("several open runs fail and name them", () => {
    const a = initIn("First feature");
    const b = initIn("Second feature");
    const out = from(repo, {}, "status");
    expect(out.status).toBe(1);
    expect(out.stderr).toContain(a.runId);
    expect(out.stderr).toContain(b.runId);
  });

  test("a run for another checkout is not used", () => {
    initIn("One feature");
    const elsewhere = join(ws.dir, "other");
    mkdirSync(elsewhere);
    spawnSync("git", ["init", "-q", elsewhere]);
    const out = from(elsewhere, {}, "status");
    expect(out.status).toBe(1);
    expect(out.stderr).toMatch(/no open run/);
  });
});
