#!/usr/bin/env node
// The waffled-qa helper. The run ledger lives in lib/ledger.mjs; other commands read
// git, Docker, the local stack, and the agent-browser session. None of them
// deploys, pushes, or touches a non-local host.
import { resolve } from "node:path";
import { fail, parse, print } from "./lib/cli.mjs";
import {
  claim,
  cleanup,
  initialize,
  load,
  prune,
  record,
  recover,
  report,
  status,
  briefStatus,
  summarize,
} from "./lib/ledger.mjs";
import { token } from "./token.mjs";
import { exportHtml } from "./export.mjs";
import { result } from "./lib/result.mjs";
import { capture } from "./lib/capture.mjs";
import { api } from "./lib/api.mjs";
import { doctor } from "./lib/doctor.mjs";
import { diagnose } from "./lib/diagnose.mjs";
import { wait } from "./lib/wait.mjs";
import { cleanupPlan, created } from "./lib/created.mjs";
import { findings, listRuns, regress } from "./lib/runs.mjs";
import { brief } from "./lib/brief.mjs";
import { browserLogin } from "./lib/login.mjs";
import { down, restart, stackStatus, up } from "./lib/stack.mjs";
import { handleFrom, handleOf, inferRun, remember } from "./lib/identity.mjs";

const ATTEMPT = ["--case", "--token"];

// run: "required" takes --run, the handle's run (--as or WAFFLED_QA), WAFFLED_QA_RUN_DIR,
// or else the only open run for this checkout; "optional" passes the first
// three if given; "none" refuses them. `compact` prints one JSON line by default.
const COMMANDS = {
  init: {
    usage: "--spec <JSON file>; --run is optional and WAFFLED_QA_RUN_DIR is ignored for init",
    values: ["--spec"],
    run: "none-env",
    handler: ({ opts }) => initialize(opts["--run"], opts["--spec"]),
  },
  status: {
    usage: "[--brief]; --brief prints one line per case",
    flags: ["--brief"],
    handler: ({ run, opts }) => (opts["--brief"] ? briefStatus(run) : status(run)),
  },
  claim: {
    usage: "--case <id> --worker <session id> [--retry fix|infra|interrupted]",
    values: ["--case", "--worker", "--retry"],
    handler: ({ run, opts }) => {
      const attempt = claim(run, opts);
      remember(run);
      return { ...attempt, handle: handleOf(attempt.runId, attempt.caseId, attempt.attempt, attempt.token) };
    },
  },
  result: {
    usage:
      "--outcome pass|fail|blocked [--cause product|infra|fixture] --summary <text> [--evidence a.png,b.json] [--report report.md] --cleanup clean|not-needed|incomplete --cleanup-note <text> [--findings <JSON file>] [--resolutions <JSON file>] [--no-record] [--dry-run]; file names are inside the attempt; --as or WAFFLED_QA names the attempt",
    values: [
      ...ATTEMPT,
      "--outcome",
      "--cause",
      "--summary",
      "--evidence",
      "--report",
      "--cleanup",
      "--cleanup-note",
      "--findings",
      "--resolutions",
    ],
    flags: ["--no-record", "--dry-run"],
    compact: true,
    handler: ({ run, opts }) => result(run, opts),
  },
  record: {
    usage: "--result <JSON file>",
    values: ["--result"],
    handler: ({ run, opts }) => record(run, opts["--result"]),
  },
  recover: {
    usage:
      "--case <id> --attempt <number> --token <token> --reason <text> --worker-stopped yes",
    values: ["--case", "--attempt", "--token", "--reason", "--worker-stopped"],
    handler: ({ run, opts }) => recover(run, opts),
  },
  cleanup: {
    usage:
      "--case <id> --attempt <number> --token <token> --status clean|not-needed --report <relative path>",
    values: ["--case", "--attempt", "--token", "--status", "--report"],
    handler: ({ run, opts }) => cleanup(run, opts),
  },
  report: { usage: "writes REPORT.md", handler: ({ run }) => report(run) },
  export: {
    usage: "[--out <file>]; writes a self-contained REPORT.html",
    values: ["--out"],
    handler: ({ run, opts }) => {
      const state = load(run);
      return exportHtml(run, state, summarize(state), opts["--out"]);
    },
  },
  prune: {
    usage:
      "[--older-than 30d] [--root <runs directory>] [--dry-run]; no --run; keeps runs with open findings, incomplete cleanup, or a running attempt",
    values: ["--older-than", "--root"],
    flags: ["--dry-run"],
    run: "none",
    handler: ({ opts }) => prune(opts),
  },
  stack: {
    usage:
      "[--stack 8080|8081] [--expect-repo <dir>] [--wait]; containers, the checkout that built each one, the api's GIT_SHA against HEAD, /api/auth/status, and the last wqa build; with a run or --expect-repo exits 1 when api or web was built from another checkout; --wait polls up to 55s for a running build to settle",
    values: ["--stack", "--repo", "--expect-repo"],
    flags: ["--wait"],
    run: "optional",
    compact: true,
    handler: ({ run, opts }) => stackStatus(run, opts),
  },
  up: {
    usage:
      "[--stack 8080|8081] [--repo <worktree>] [--take-over] [--confirm-main]; builds and starts the stack from the tested checkout, detached, logging to ~/.waffled-qa/stack/ (:8081 ./waffled-demo up, :8080 ./waffled up --build); refuses :8080 without --confirm-main and a stack built from another checkout without --take-over",
    values: ["--stack", "--repo"],
    flags: ["--take-over", "--confirm-main"],
    run: "optional",
    compact: true,
    handler: ({ run, opts }) => up(run, opts),
  },
  restart: {
    usage:
      "<api|web|powersync> [… ] [--stack 8080|8081] [--repo <worktree>] [--take-over] [--confirm-main]; rebuilds and recreates those services from the tested checkout, detached (web is the caddy image that bakes the SPA); then wqa stack --wait",
    positionals: 3,
    values: ["--stack", "--repo"],
    flags: ["--take-over", "--confirm-main"],
    run: "optional",
    compact: true,
    handler: ({ run, opts, positional }) => restart(run, positional, opts),
  },
  down: {
    usage: "[--stack 8081] [--repo <worktree>]; stops the demo stack and keeps its volumes; refuses :8080",
    values: ["--stack", "--repo"],
    run: "optional",
    compact: true,
    handler: ({ run, opts }) => down(run, opts),
  },
  login: {
    usage:
      "[--stack 8080|8081] [--url <app url>] [--session <name>] [--profile <dir>] [--headless] [--timeout 20s]; logs the QA user into the web app through its sign-in form; with --run, session and profile default to wqa-<runId> and ~/.waffled-qa/browser/<runId>; exits 1 with the failed step",
    values: ["--stack", "--url", "--session", "--profile", "--timeout"],
    flags: ["--headless"],
    run: "optional",
    compact: true,
    handler: ({ run, opts }) => browserLogin(run, opts),
  },
  capture: {
    usage:
      "mark | collect --label <name> [--no-screenshot]; mark sets the baseline, collect saves the screenshot, console, errors, failed requests, and page state since the mark into the attempt",
    positionals: 1,
    values: [...ATTEMPT, "--label"],
    flags: ["--no-screenshot"],
    compact: true,
    handler: ({ run, opts, positional }) => capture(run, positional[0], opts),
  },
  api: {
    usage:
      "<METHOD> <path> [--body <JSON file>] [--save <name.json>] [--auth session|none] [--stack 8080|8081] [--base-url <url>]; --save writes into the attempt; a non-2xx status is printed, not an error",
    positionals: 2,
    values: [...ATTEMPT, "--body", "--save", "--auth", "--stack", "--base-url"],
    run: "optional",
    compact: true,
    handler: ({ run, opts, positional }) => api(run, positional, opts),
  },
  doctor: {
    usage:
      "[--stack 8080|8081] [--base-url <url>] [--skip-login]; checks Node, agent-browser, Docker, zellij, the api and web containers, /api/auth/status, the QA credentials, and the login of the run's browser session (AGENT_BROWSER_SESSION, else wqa-<runId>); exits 1 when a required check fails",
    values: ["--stack", "--base-url"],
    flags: ["--skip-login"],
    // A run only picks the browser session to check.
    run: "optional",
    handler: ({ opts }) => doctor(opts),
  },
  diagnose: {
    usage:
      "[--label <name>]; classifies the current tab as ok, hidden-tab, server-down, loading, app-error, blank, or no-page; --label saves the full dump into the attempt",
    values: [...ATTEMPT, "--label"],
    run: "optional",
    compact: true,
    handler: ({ run, opts }) => diagnose(run, opts),
  },
  wait: {
    usage:
      "http --path <api path>|--url <local url> --field a.b --until <value> [--fail-on v1,v2] [--auth session|none] | file --path <run-relative or absolute>; [--timeout 55s] [--interval 2s]; at most 60s; exits 1 on a failure value or timeout",
    positionals: 1,
    values: ["--path", "--url", "--field", "--until", "--fail-on", "--auth", "--stack", "--base-url", "--timeout", "--interval"],
    run: "optional",
    compact: true,
    handler: ({ run, opts, positional }) => wait(run, positional[0], opts),
  },
  created: {
    usage:
      "--kind <type> --id <id> [--restore <how>] [--note <text>] | --retired <id> [--note <text>]; records objects created or values changed by this attempt; a clean result requires all retired",
    values: [...ATTEMPT, "--kind", "--id", "--restore", "--retired", "--note"],
    compact: true,
    handler: ({ run, opts }) => created(run, opts),
  },
  "cleanup-plan": {
    usage: "lists every created object or changed value in the run that is not retired",
    handler: ({ run }) => cleanupPlan(run),
  },
  regress: {
    usage:
      "--from <run> --cases a,b --reason <text> [--replace a=new-case.md] [--run <new directory>]; creates a linked run for regression or replacement cases",
    values: ["--from", "--cases", "--reason", "--replace"],
    run: "none-env",
    handler: ({ opts }) => regress(opts),
  },
  list: {
    usage:
      "[--active] [--root <runs directory>]; runs newest first; --active keeps running, fixing, cleanup-incomplete, or recently updated runs and warns about shared fixtures",
    values: ["--root"],
    flags: ["--active"],
    run: "none",
    handler: ({ opts }) => listRuns(opts),
  },
  findings: {
    usage: "[--all-runs [--root <dir>]] [--id <text>] [--open]; findings with open, resolved, or observation state",
    values: ["--root", "--id"],
    flags: ["--all-runs", "--open"],
    run: "optional",
    handler: ({ run, opts }) => findings(run, opts),
  },
  brief: {
    usage:
      "--role runner|diagnose|fix [--deadline 75m] [--zellij] [--base <ref> --target <branch> [--branch <name>]]; writes a worker brief into the attempt and prints its path",
    values: [...ATTEMPT, "--role", "--deadline", "--base", "--target", "--branch"],
    flags: ["--zellij"],
    compact: true,
    handler: ({ run, opts }) => brief(run, opts),
  },
};

function help() {
  const commands = Object.fromEntries(
    Object.entries(COMMANDS).map(([name, { usage }]) => [name, usage])
  );
  return {
    usage: "wqa <command> [--run <directory>] [options] [--compact]",
    run: "--as <handle> or WAFFLED_QA=<handle> (from claim) names the run and attempt; --run selects a run; without either, commands that need a run use the only open run for this checkout",
    token:
      "wqa token [--stack 8080|8081] [--refresh|--info]: session access token for the QA user; see wqa token --help",
    ...commands,
  };
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  // token prints a bare token, so it keeps its own parser and output.
  if (command === "token") return token(args);
  if (!command || command === "help" || command === "--help") return print(help());
  const spec = COMMANDS[command] ?? fail(`unknown command: ${command}`);
  const mode = spec.run ?? "required";
  const values = [
    ...(spec.values ?? []),
    ...(mode === "none" ? [] : ["--run"]),
    ...(mode === "required" || mode === "optional" ? ["--as"] : []),
  ];
  const { opts, positional } = parse(command, args, {
    values,
    flags: [...(spec.flags ?? []), "--compact"],
    positionals: spec.positionals ?? 0,
  });
  let run = null;
  if (mode === "required" || mode === "optional") {
    const given = opts["--run"] || handleFrom(opts)?.run || process.env.WAFFLED_QA_RUN_DIR;
    run = given ? resolve(given) : mode === "required" ? inferRun() : null;
  }
  // A run's browser session is wqa-<runId>, the one wqa login opens, and its
  // stack is the spec's, unless --stack or the environment names another.
  if (run) {
    try {
      const state = load(run);
      if (!process.env.AGENT_BROWSER_SESSION) process.env.AGENT_BROWSER_SESSION = `wqa-${state.runId}`;
      if (!process.env.WAFFLED_QA_STACK && state.stack) process.env.WAFFLED_QA_STACK = String(state.stack);
    } catch {} // the command reports a missing or unreadable run itself
  }
  const output = await spec.handler({ run, opts, positional });
  print(output, Boolean(opts["--compact"] || spec.compact));
}

main().catch((error) => {
  process.stderr.write(`wqa: ${error.message}\n`);
  process.exitCode = 1;
});
