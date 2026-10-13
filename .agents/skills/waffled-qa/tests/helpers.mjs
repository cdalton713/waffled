// Shared fixtures for specs that drive the real CLI against temporary runs.
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const cli = fileURLToPath(new URL("../scripts/wqa.mjs", import.meta.url));

// A temp directory with a one-case spec. `env` is added to every CLI call;
// HOME points into the directory so runs and token caches stay isolated.
export function workspace({ cases = ["save"], repo } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "wqa-spec-"));
  const spec = join(dir, "spec.json");
  writeFileSync(
    spec,
    JSON.stringify({
      feature: "Settings save",
      repo: repo ?? dir,
      stack: "8081",
      cases: cases.map((id) => ({ id, title: `Case ${id}`, file: `${id}.md` })),
    })
  );
  for (const id of cases) writeFileSync(join(dir, `${id}.md`), `Case ${id}: expect the saved value.`);
  const ws = {
    dir,
    spec,
    run: join(dir, "run"),
    env: { HOME: dir },
    invoke(...args) {
      return spawnSync(process.execPath, [cli, ...args], {
        encoding: "utf8",
        env: { ...process.env, WAFFLED_QA: "", WAFFLED_QA_RUN_DIR: "", WAFFLED_QA_CASE: "", WAFFLED_QA_TOKEN: "", ...ws.env },
      });
    },
    // Async variant for specs whose in-process server must keep answering.
    invokeAsync(...args) {
      return new Promise((done) => {
        const child = spawn(process.execPath, [cli, ...args], {
          env: { ...process.env, WAFFLED_QA: "", WAFFLED_QA_RUN_DIR: "", WAFFLED_QA_CASE: "", WAFFLED_QA_TOKEN: "", ...ws.env },
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (d) => (stdout += d));
        child.stderr.on("data", (d) => (stderr += d));
        child.on("close", (status) => done({ status, stdout, stderr }));
      });
    },
    ok(...args) {
      const result = ws.invoke(...args);
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      return JSON.parse(result.stdout);
    },
    init() {
      return ws.ok("init", "--run", ws.run, "--spec", spec);
    },
    // Claims a case and exports its identity the way a worker would.
    claim(caseId = cases[0], ...args) {
      const attempt = ws.ok("claim", "--run", ws.run, "--case", caseId, "--worker", "w1", ...args);
      Object.assign(ws.env, {
        WAFFLED_QA_RUN_DIR: ws.run,
        WAFFLED_QA_CASE: caseId,
        WAFFLED_QA_TOKEN: attempt.token,
      });
      return attempt;
    },
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
  return ws;
}
