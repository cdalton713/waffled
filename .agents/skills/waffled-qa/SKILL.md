---
name: waffled-qa
description: End-to-end QA of Waffled features on a local Docker stack (:8080 main or :8081 demo) through the real web UI (agent-browser), API, sync, or background jobs, with evidence, local TDD fixes, and retests. Not for production audits, code review, or iOS/Mac UI.
---

# Waffled local QA

The bundled helper `wqa` requires Node.js 22 or later and Docker. Run it as
`node .agents/skills/waffled-qa/scripts/wqa.mjs` from the checkout (or alias it
to `wqa`). Drive browsers with `agent-browser` (see [UI tests](references/ui.md)).
Suite workers run as native subagents or zellij sessions (see
[Suite coordination](references/suites.md)).

Test what a household member can do and what the system actually does. Define
the expected result before observing the actual result. Keep enough evidence to
reproduce each finding and verify each fix. Every run ends with an HTML report
that shows the result visually (section 6).

## Choose the run

- **Focused case:** run one bounded check in the current session.
- **Suite:** use a small coordinator and separate workers. Read
  [Suite coordination](references/suites.md). A suite can use supplied cases or
  cases derived from the feature requirements; it needs no fixed test corpus.
- **Fix mode is the default:** reproduce, diagnose, fix locally, and retest.
  An explicit request to report, audit without changes, or diagnose only selects
  report mode. Do not change code in report mode.
- **Resume:** inspect the named run and its live workers before taking action.
  `wqa list --active` finds runs when no directory is named.
- **Report:** summarize saved evidence and export the HTML report without
  starting tests or changing code.

Examples:

- "Use waffled-qa to test the AnyList grocery sync on this branch and fix defects."
- "Run an overnight waffled-qa suite for the weekly-planning spec on the demo stack."
- "QA the chores API in report-only mode."
- "Resume waffled-qa from this run directory."

The user's request and repository instructions control scope and authority.
Local QA does not authorize a push, PR, release, or message to another person.
Keep earlier user decisions in effect.

## 1. Establish the contract and environment

Read the repo-root `CLAUDE.md` and the folder `CLAUDE.md` for every app you will
touch (`apps/api`, `apps/web`). They are binding: worktree-first, TDD,
integration tests over unit tests, design-system reuse, lean comments, and the
changelog/docs rules. Use Graphify for broad relationships when available and
Serena for symbol work. Read only the source needed for the current case.

**Ask which stack the run uses before anything else: `:8080` or `:8081`.**
Read [Stack](references/stack.md) for what each one is.

- `:8081` is the throwaway demo stack (`./waffled-demo`, "The Seinfelds"). It
  is the default choice for QA: its data is fake, and `wqa` logs in as the
  seeded demo user.
- `:8080` is the household's real install (`./waffled`). Test writes there
  change real family data. Use it only when the user names it, with an account
  the user names (`WAFFLED_QA_EMAIL` / `WAFFLED_QA_PASSWORD`), and prefer
  read-only cases. `wqa` refuses to rebuild it without `--confirm-main`.

Record the stack in the run spec (`"stack": "8081"`); every `wqa` command in
the run then targets it.

Derive from the request, specification (`docs/product/*-plan.md`), branch diff,
and source:

- Feature goal, user (adult, kid, kiosk device), expected behavior, and
  excluded behavior.
- The actual worktree, branch, commit, and existing uncommitted changes.
- The route or entrypoint under test and the relevant dependencies (API module,
  PowerSync stream, scheduler, third-party integration).
- Credentials source, household, and fixtures.

Discover facts before asking. Ask for an unresolved product decision or a
missing target when choosing one would change the result. Record routine
assumptions and keep working. A worker that needs a decision reports it to the
coordinator; it must not invent permission.

**Container names are fixed per stack**, so a build from any checkout replaces
what is running, and another worktree's session may own the stack right now.
`wqa stack` shows, for each container, the checkout that built it (the compose
`working_dir` label) and the api's baked `GIT_SHA` against your HEAD; with a run
it exits 1 when `api` or `web` came from another checkout. Before the first
test write, run it and record the result in `ENV.md`. A stack built from
another checkout is a blocker: ask the user before taking it over
(`--take-over`). Never stop or rebuild a stack another session is using to make
your case pass.

Build and start services only with `wqa up` (whole stack) and
`wqa restart api|web|powersync` (one service; `web` is the caddy image that bakes
the SPA). They run `./waffled-demo up …` or `./waffled up --build` /
`./waffled rebuild …` from the tested checkout, detached, logging under
`~/.waffled-qa/stack/`. Builds take minutes: follow with `wqa stack --wait`
(55 s per call; repeat). Never start them as a background process of the
agent's shell. `wqa down` stops only the demo stack and keeps its volumes.

An uncommitted change is in the container only after a rebuild from this
checkout. The api's `GIT_SHA` names the commit, not the working tree, so record
"HEAD + uncommitted diff" in the brief and rebuild after every fix.

Use the Vite dev server (`cd apps/web && npm run dev`, :5173) only when the
case needs HMR; it proxies `/api` to `localhost:3000`, which is the **main**
stack's api (and may be another project's dev server on this machine). Start it
in a zellij tab the user can attach to, and record which api it reached.

Before the first test write, confirm the effective target: `wqa stack` for
ownership, then browser network evidence from a read-only page load that
`/api/*` requests go to the intended origin. Repeat after a rebuild or target
change. If any target differs from the authorized stack, stop test writes and
report the mismatch. Treat earlier affected attempts as invalid and record any
objects changed there for cleanup.

Do not copy worktree paths, household or person IDs, passwords, or old service
facts from another run. Resolve live IDs. Inspect existing test data before
changing it.

## 2. Define the cases and save the run

Use [Case template](assets/case.md) for each case. A case needs:

1. One behavior and its independent expected result.
2. Preconditions, fixture ownership, and the supported setup path.
3. Exact actions and a result that distinguishes correct from broken behavior.
4. Evidence of execution, persistence, and downstream effects (another member's
   view, the kiosk, a PowerSync update, a job's last run).
5. Cleanup actions and the initial state to restore.

Select cases by risk: normal use, meaningful boundaries, invalid input, state
changes, role permissions (adult/kid/kiosk), and likely regressions in direct
consumers. Add offline, sync, retry, or reload checks when the feature contract
depends on them. Do not expand a focused request into a full application audit.

Read [Run files and helper](references/run-files.md), then initialize a run.
Each run has its own directory under `~/.waffled-qa/runs/`. Cases and attempts
are isolated. The skill directory holds reusable instructions only.

Keep `BRIEF.md` for scope, source identity, and decisions, and `ENV.md` for
the stack, container ownership, URLs, household and fixture IDs, and health
checks. Store credential references only; never store passwords, tokens, or
refresh tokens in run files. Log in with `wqa login`.

Agent shells do not keep exported variables between commands, so name the run
and attempt on each command instead. `claim` returns a `handle`; pass
`--as <handle>` to worker commands, which then need no other identity flags and
use the run's browser session `wqa-<runId>`. Each command prints one short JSON
line and saves full output in the attempt directory:

| Step | Command |
| --- | --- |
| Readiness in one call | `wqa doctor` |
| Who built the running stack | `wqa stack [--wait]` |
| Build and start the stack | `wqa up [--take-over] [--confirm-main]` |
| Rebuild one or more services | `wqa restart api [web …]`, then `wqa stack --wait` |
| Log in the run's browser | `wqa login` |
| Browser evidence at a checkpoint | `wqa capture mark`, act, `wqa capture collect --label <name>` |
| Blank or stuck page | `wqa diagnose` |
| API call with saved response | `wqa api GET <path> --save <name>.json` |
| Bounded wait on a field or file | `wqa wait http …`, `wqa wait file …` |
| Record the result | `wqa result --outcome … --summary … --evidence … --cleanup …` |
| Coordinator view | `wqa status --brief` |
| Final HTML report | `wqa export` (inlines the run's `SUMMARY.html`) |

## 3. Check readiness and exercise the feature

Read only the references required by the case:

| Surface         | Read when                                                         | Reference                          |
| --------------- | ----------------------------------------------------------------- | ---------------------------------- |
| Stack           | Always, before the first test write                               | [Stack](references/stack.md)       |
| Web UI          | A person uses the web app or kiosk: forms, lists, dialogs, drag   | [UI tests](references/ui.md)       |
| API             | The behavior is an `/api/*` route, or to verify a UI write         | [API tests](references/api.md)     |
| Background work | A scheduler, sync, ingest, or third-party integration is involved | [Job tests](references/jobs.md)    |

`wqa doctor` checks Node, `agent-browser`, Docker, the stack's api and web
containers, `/api/auth/status`, the QA credentials, and the run's browser
login. It never starts a container or opens a browser. A 401 or a running
container alone does not prove the business path is available.

Use the intended interface for the behavior under test. For a UI feature, make
its state changes through actual controls. For an API feature, exercise the
route. Observe state with read-only API calls, `./waffled[-demo] logs api`, and
`./waffled[-demo] psql` queries as needed.

A broken UI control is a product finding. Do not replace its action with a
direct API or database write to obtain a pass. Setup through another supported
interface is valid only when setup is outside the tested behavior; record that
boundary. Do not use database writes to fabricate application-derived state.

Use finite waits with a positive success condition and a failure condition.
Poll an API field with `wqa wait http` and a worker's result file with
`wqa wait file`. Keep each blocking tool call at 60 seconds or less. A stable
empty page is not proof of readiness.

## 4. Grade the evidence

Ask: could a broken implementation pass this case with these inputs? If so,
improve the discriminator or mark the case blocked on the fixture or test design.
Do not change the product to satisfy a test that cannot exercise its contract.

Use the case's expectation as the primary reference. A success toast, an
optimistic UI update, or the API's own response can corroborate a result; none
proves persistence. Waffled renders many views from PowerSync's local copy, so
reload or open a second session to prove the write reached the server and
synced back. Account for documented transformations (time zones, recurrence
expansion, unit conversion, role-based capability gates) before comparing.

An empty result can pass when the case expects emptiness and evidence proves
the path ran. Include a positive control when an unavailable service or skipped
request could produce the same observation. Do not infer execution from absence.

Prefer visual evidence. For a visible state change, capture the same view
before and after with labels `before-<name>` and `after-<name>`; the report
shows the pair side by side. For a fixed defect, keep the failing attempt's
screenshot and capture the same view in the retest.

Capture complete evidence to disk; inspect short excerpts in context. Check for
pagination, truncation, and missing fields. Separate visible UI behavior from
DOM presence. Correlate logs to this attempt and request.

Record one outcome:

- `pass`: the stated expectation is met, with execution evidence.
- `fail` with cause `product`: execution proves a contract violation.
- `blocked` with cause `infra`, `fixture`, or `product`: name the obstacle and
  the untested behavior.

Record incidental defects as findings even if the main behavior passed. State
which layers were exercised; a partial check must not read as end-to-end proof.
Do not discard a cold-run or intermittent failure because a retry passed.

## 5. Fix and retest

In fix mode, the fix follows the repo's rules:

1. Work in the run's worktree (never `main`). A fix worker gets its own
   worktree off the tested source; the coordinator integrates its commit.
2. **TDD:** write the failing test first and watch it fail for the observed
   defect. Prefer an API integration test (`apps/api/test/*.integration.test.ts`,
   Testcontainers + `app.run(...)`); a unit test only for a pure helper; a web
   component test under `apps/web` for UI logic. Then the minimum fix, then
   refactor.
3. Reuse the design system for any UI change (`apps/web/CLAUDE.md`).
4. Add a `### Fixed` entry under `## [Unreleased]` in `CHANGELOG.md` for a
   user-facing defect, and fix any docs the defect made wrong.
5. Commit one coherent fix per finding with a conventional message (`fix: …`).
   Do not push.

Run IDE diagnostics on changed files when available; report unavailable
diagnostics rather than claiming they ran. Iterate with focused tests
(`npx vitest run <file>` in the app). After the last change, run the required
final verification for every app you touched: `npm test` and `npm run typecheck`
in `apps/api`; `npm test` and `npm run build` in `apps/web`. Red means not done.

Then rebuild the changed services from this checkout (`wqa restart api web`,
`wqa stack --wait`), confirm `ours: true` and the new `GIT_SHA`, and rerun the
original case fresh with `claim --retry fix`. Retest incidental fixes too. Run
relevant neighboring cases for shared code changes; use
`wqa regress --from <run> --cases … --reason …` for cases already passed.
`wqa findings --all-runs --id …` checks earlier runs before reusing a finding ID.

Reuse a finding ID for the same root cause; a repeated defect needs an
explanation of why the previous fix was insufficient. Close each required
finding with an explicit resolution and evidence from its retest (see
[Run files and helper](references/run-files.md#result-contract)). Default to two
fix cycles per case, then quarantine it and report the remaining defect.

Recover an environment failure only after evidence identifies its cause. Use at
most two environment retries per case. Rebuild or restart only through `wqa`;
a stack built from another checkout is someone else's until the user says
otherwise. Missing authentication requires the user.

## 6. Clean up and finish

Maintain a per-attempt list of created objects and changed existing values
with `wqa created --kind … --id … --restore …`, and mark each one
`wqa created --retired <id>` once restored; a clean result is refused while any
remains, and `wqa cleanup-plan` lists them. Restore through the supported
interface. On `:8080`, cleanup is mandatory and verified by a read; on `:8081`
it still matters, because later cases share the household.

Always record the verdict, even if cleanup fails. Mark cleanup `incomplete`
with remaining object IDs; the helper blocks new claims in that run until
cleanup is verified.

Check pending work, open findings, incomplete cleanup, retry limits, and the
required final verification before declaring completion. For suites, also
finish worker integration and session cleanup per the suite reference.

Always finish with the HTML report, in every mode and also when the run halts:
`wqa report`, then `wqa export`. The page leads with a visual summary of each
case's latest screenshots, with before/after pairs side by side, followed by the
case table, findings, notes, and evidence. Every embedded image opens in a
zoomed modal when selected; preserve this when customizing a report.

Shape the report to the task. Write `SUMMARY.html` in the run directory, an HTML
fragment the export inlines at the top: the verdict in a sentence or two, then
whatever tells this run's story best (a fix as failing screenshot beside the
retest, a table of expected and actual values, open risks). Reference run images
by relative path (`attempts/<case>/<n>/after-save.png`); for a side-by-side pair,
wrap two `<figure>` elements in `<div class="compare">`. Look at the page before
handing it off.

The report stays local. Redact secrets and household personal data before
sharing it anywhere; publish it only when the user asks.

Return totals, verified fixes (with commits), unresolved findings, untested
behavior, cleanup status, and the `REPORT.html` path. Close the run's browser
session with `agent-browser close` unless the user wants it kept. Leave the
stack running unless the user asks for `wqa down`. Keep the final answer short;
the report and evidence carry the detail.
