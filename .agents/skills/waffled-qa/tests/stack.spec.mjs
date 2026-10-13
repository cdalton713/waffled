import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { workspace } from "./helpers.mjs";

// A fake `docker` answers `inspect -f <format> <name>` from containers.json:
// {name: [status, health, working_dir, GIT_SHA, image]}. A fake ./waffled-demo
// and ./waffled record their arguments, so no real stack is touched.
const DOCKER = `#!/usr/bin/env node
const fs = require("node:fs");
const name = process.argv.at(-1);
const table = JSON.parse(fs.readFileSync(process.env.FAKE_DOCKER, "utf8"));
if (!table[name]) { process.stderr.write("No such object"); process.exit(1); }
process.stdout.write(table[name].join("\\t") + "\\n");`;
const SCRIPT = `#!/bin/sh
echo "$(basename "$0") $*" >> "$FAKE_CALLS"`;

let ws, repo, head, table;
const writeTable = () => writeFileSync(join(ws.dir, "containers.json"), JSON.stringify(table));
const container = (checkout, sha = head.slice(0, 7)) => ["running", "healthy", `${checkout}/infra/compose`, sha, "img"];

beforeEach(() => {
  ws = workspace();
  repo = join(ws.dir, "repo");
  mkdirSync(join(ws.dir, "bin"));
  mkdirSync(repo);
  writeFileSync(join(ws.dir, "bin", "docker"), DOCKER);
  chmodSync(join(ws.dir, "bin", "docker"), 0o755);
  for (const name of ["waffled", "waffled-demo"]) {
    writeFileSync(join(repo, name), SCRIPT);
    chmodSync(join(repo, name), 0o755);
  }
  const git = (...args) => spawnSync("git", ["-C", repo, "-c", "user.email=a@b", "-c", "user.name=t", ...args], { encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("add", ".");
  git("commit", "-q", "-m", "init");
  head = git("rev-parse", "HEAD").stdout.trim();
  repo = realpathSync(repo);
  table = {
    "waffled-demo-api": container(repo),
    "waffled-demo-caddy": container(repo, ""),
    "waffled-api": container(repo),
    "waffled-caddy": container(repo, ""),
  };
  writeTable();
  Object.assign(ws.env, {
    PATH: `${join(ws.dir, "bin")}:${process.env.PATH}`,
    FAKE_DOCKER: join(ws.dir, "containers.json"),
    FAKE_CALLS: join(ws.dir, "calls.log"),
    WAFFLED_QA_BASE_URL: "http://127.0.0.1:1",
  });
});
afterEach(() => ws.cleanup());

const calls = () => {
  try {
    return readFileSync(join(ws.dir, "calls.log"), "utf8").trim().split("\n");
  } catch {
    return [];
  }
};

test("stack names the checkout that built each container and matches the api's GIT_SHA", () => {
  const out = ws.ok("stack", "--stack", "8081", "--expect-repo", repo);
  const api = out.services.find((s) => s.name === "api");
  expect(api).toMatchObject({ container: "waffled-demo-api", checkout: repo, ours: true, shaMatchesHead: true });
  expect(out.services.find((s) => s.name === "postgres")).toMatchObject({ status: "missing" });
  expect(out.mismatch).toEqual([]);
  expect(out.api.status).toBe("unreachable");
});

test("stack exits 1 when the web build comes from another checkout", () => {
  table["waffled-demo-caddy"] = container("/elsewhere/worktree", "");
  writeTable();
  const out = ws.invoke("stack", "--stack", "8081", "--expect-repo", repo);
  expect(out.status).toBe(1);
  expect(JSON.parse(out.stdout).mismatch).toEqual(["web built from /elsewhere/worktree"]);
});

test("up refuses the main stack without --confirm-main, then builds it from this checkout", async () => {
  const refused = ws.invoke("up", "--stack", "8080", "--repo", repo);
  expect(refused.stderr).toMatch(/real install; rebuilding it needs --confirm-main/);
  expect(calls()).toEqual([]);
  const out = ws.ok("up", "--stack", "8080", "--repo", repo, "--confirm-main");
  expect(out).toMatchObject({ stack: ":8080", started: "./waffled up --build", repo });
  const done = ws.ok("stack", "--stack", "8080", "--repo", repo, "--wait");
  expect(done.build).toMatchObject({ state: "done", exit: 0 });
  expect(calls()).toEqual(["waffled up --build"]);
});

test("up and restart refuse a demo stack built from another checkout until --take-over", () => {
  table["waffled-demo-api"] = container("/elsewhere/worktree");
  writeTable();
  expect(ws.invoke("up", "--stack", "8081", "--repo", repo).stderr).toMatch(/api runs a build from \/elsewhere\/worktree; .*--take-over/);
  expect(ws.invoke("restart", "api", "--stack", "8081", "--repo", repo).stderr).toMatch(/--take-over/);
  expect(calls()).toEqual([]);
  ws.ok("restart", "api", "web", "--stack", "8081", "--repo", repo, "--take-over");
  ws.ok("stack", "--stack", "8081", "--repo", repo, "--wait");
  expect(calls()).toEqual(["waffled-demo up api caddy"]);
});

test("restart maps services to compose names and rejects unknown ones", () => {
  expect(ws.invoke("restart", "frontend", "--stack", "8081", "--repo", repo).stderr).toMatch(/unknown service frontend/);
  ws.ok("restart", "web", "--stack", "8080", "--repo", repo, "--confirm-main");
  ws.ok("stack", "--stack", "8080", "--repo", repo, "--wait");
  expect(calls()).toEqual(["waffled rebuild caddy"]);
});

test("down stops only the demo stack", () => {
  expect(ws.invoke("down", "--stack", "8080", "--repo", repo).stderr).toMatch(/never stops the :8080 stack/);
  ws.ok("down", "--stack", "8081", "--repo", repo);
  ws.ok("stack", "--stack", "8081", "--repo", repo, "--wait");
  expect(calls()).toEqual(["waffled-demo down"]);
});

test("a run's spec names the stack, so commands need no --stack", () => {
  const spec = JSON.parse(readFileSync(ws.spec, "utf8"));
  writeFileSync(ws.spec, JSON.stringify({ ...spec, repo }));
  ws.init();
  const out = ws.ok("stack", "--run", ws.run);
  expect(out).toMatchObject({ stack: ":8081", repo, mismatch: [] });
});
