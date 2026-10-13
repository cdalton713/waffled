import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../scripts/wqa.mjs", import.meta.url));
// 1x1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);
let home, dir, spec;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "wqa-home-"));
  dir = mkdtempSync(join(tmpdir(), "wqa-spec-"));
  spec = join(dir, "spec.json");
  writeFileSync(
    spec,
    JSON.stringify({
      feature: "Settings Persistence: <save> & reload",
      repo: dir,
      stack: "8081",
      cases: [{ id: "save", title: "Saved value persists", file: "save.md" }],
    })
  );
  writeFileSync(join(dir, "save.md"), "Save, reopen, expect the value.");
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(dir, { recursive: true, force: true });
});
function ok(...args) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, HOME: home },
  });
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout);
}
const runsDir = () => join(home, ".waffled-qa", "runs");
function finish(run, { finding = false, cleanup = "not-needed" } = {}) {
  const attempt = ok("claim", "--run", run, "--case", "save", "--worker", "w1");
  const at = join(run, attempt.directory);
  writeFileSync(join(at, "report.md"), "Expected value; saw value.");
  writeFileSync(join(at, "shot.png"), PNG);
  writeFileSync(join(at, "read.json"), '{"value":"<new>"}');
  const result = join(dir, "result.json");
  writeFileSync(
    result,
    JSON.stringify({
      runId: attempt.runId,
      caseId: "save",
      attempt: attempt.attempt,
      token: attempt.token,
      outcome: "pass",
      cause: null,
      summary: "Value persists",
      report: `${attempt.directory}/report.md`,
      evidence: [`${attempt.directory}/shot.png`, `${attempt.directory}/read.json`],
      findings: finding
        ? [{ id: "toast-typo", summary: "Toast misspells saved", requiresFix: true }]
        : [],
      cleanup: { status: cleanup, note: "checked" },
    })
  );
  ok("record", "--run", run, "--result", result);
}
function age(run, days) {
  const path = join(run, "run.json");
  const state = JSON.parse(readFileSync(path, "utf8"));
  state.updated = new Date(Date.now() - days * 86_400_000).toISOString();
  writeFileSync(path, JSON.stringify(state));
}

test("names a generated run after the feature and the time", () => {
  const first = ok("init", "--spec", spec);
  const second = ok("init", "--spec", spec);
  expect(basename(first.run)).toMatch(
    /^settings-persistence-save-reload-\d{8}-\d{6}$/
  );
  expect(first.runId).toBe(basename(first.run));
  // Within the same second the name gets a -2 suffix; either way it is unique.
  expect(second.run).not.toBe(first.run);
  expect(basename(second.run)).toMatch(/^settings-persistence-save-reload-\d{8}-\d{6}(-2)?$/);
  expect(second.runId).toBe(basename(second.run));
});

test("prune deletes old finished runs and keeps runs that need attention", () => {
  const runs = {};
  for (const name of ["old", "finding", "dirty", "running", "recent"]) {
    runs[name] = ok("init", "--spec", spec).run;
  }
  finish(runs.old);
  finish(runs.finding, { finding: true });
  finish(runs.dirty, { cleanup: "incomplete" });
  ok("claim", "--run", runs.running, "--case", "save", "--worker", "w1");
  finish(runs.recent);
  for (const name of ["old", "finding", "dirty", "running"]) age(runs[name], 40);
  mkdirSync(join(runsDir(), "not-a-run"));

  const plan = ok("prune", "--dry-run");
  expect(plan.wouldDelete.map((r) => r.run)).toEqual([runs.old]);
  expect(existsSync(runs.old)).toBe(true);
  expect(Object.fromEntries(plan.kept.map((k) => [k.run, k.reason]))).toEqual({
    [runs.finding]: expect.stringContaining("open finding"),
    [runs.dirty]: "cleanup is incomplete",
    [runs.running]: "an attempt is running",
  });

  const done = ok("prune", "--older-than", "30d");
  expect(done.deleted.map((r) => r.run)).toEqual([runs.old]);
  expect(existsSync(runs.old)).toBe(false);
  for (const name of ["finding", "dirty", "running", "recent"])
    expect(existsSync(runs[name])).toBe(true);
  expect(existsSync(join(runsDir(), "not-a-run"))).toBe(true);
});

test("export writes a self-contained, escaped HTML report", () => {
  const { run } = ok("init", "--spec", spec);
  writeFileSync(join(run, "ENV.md"), "Base URL: http://localhost:3000");
  finish(run, { finding: true });
  const result = ok("export", "--run", run);
  expect(result.path).toBe(join(run, "REPORT.html"));
  expect(result.openFindings).toBe(1);
  const html = readFileSync(result.path, "utf8");
  expect(html).toContain("<title>Settings Persistence: &lt;save&gt; &amp; reload QA</title>");
  expect(html).toContain("data:image/png;base64,");
  expect(html).toContain("{&quot;value&quot;:&quot;&lt;new&gt;&quot;}");
  expect(html).toContain("toast-typo");
  expect(html).toContain("Base URL: http://localhost:3000");
  expect(html).toContain('class="image-modal"');
  expect(html).toContain('document.querySelectorAll("main img")');
  expect(html).toContain('image.addEventListener("click"');
  expect(html).not.toContain("<save>");
});

test("export leads with the agent summary and pairs before/after screenshots", () => {
  const { run } = ok("init", "--spec", spec);
  const attempt = ok("claim", "--run", run, "--case", "save", "--worker", "w1");
  const at = join(run, attempt.directory);
  writeFileSync(join(at, "report.md"), "Expected value; saw value.");
  for (const name of ["before-save.png", "after-save.png", "toast.png"])
    writeFileSync(join(at, name), PNG);
  writeFileSync(
    join(run, "SUMMARY.html"),
    `<p>Fix verified.</p><img alt="hero" src="${attempt.directory}/toast.png"><img alt="outside" src="../escape.png">`
  );
  const result = join(dir, "result.json");
  writeFileSync(
    result,
    JSON.stringify({
      runId: attempt.runId,
      caseId: "save",
      attempt: attempt.attempt,
      token: attempt.token,
      outcome: "pass",
      cause: null,
      summary: "Value persists",
      report: `${attempt.directory}/report.md`,
      evidence: ["before-save.png", "toast.png", "after-save.png"].map(
        (name) => `${attempt.directory}/${name}`
      ),
      findings: [],
      cleanup: { status: "not-needed", note: "read only" },
    })
  );
  ok("record", "--run", run, "--result", result);

  const html = readFileSync(ok("export", "--run", run).path, "utf8");
  const order = ["<h2>Summary</h2>", "Fix verified.", "<h2>Visual summary</h2>", "<h2>Cases</h2>"];
  const at0 = order.map((text) => html.indexOf(text));
  expect(at0.every((index) => index >= 0)).toBe(true);
  expect(at0).toEqual([...at0].sort((a, b) => a - b));
  // The summary's in-run image is embedded; a path outside the run is left alone.
  expect(html).toMatch(/<img alt="hero" src="data:image\/png;base64,/);
  expect(html).toContain('src="../escape.png"');
  // One side-by-side pair in the visual summary; the attempt section links to it.
  const visual = html.slice(html.indexOf("<h2>Visual summary</h2>"), html.indexOf("<h2>Cases</h2>"));
  expect(visual.match(/class="compare"/g)).toHaveLength(1);
  expect(visual).toMatch(/Before<\/div><figure id="img-\d+"><img[^>]*alt="[^"]*before-save\.png"/);
  expect(visual).toMatch(/After<\/div><figure id="img-\d+"><img[^>]*alt="[^"]*after-save\.png"/);
  const attempts = html.slice(html.indexOf("<h2>Attempts and evidence</h2>"));
  expect(attempts).not.toContain("data:image/png");
  expect(attempts.match(/\(shown above\)/g)).toHaveLength(3);
});
