# Suite coordination

## Contents

- Roles and scope
- Start and resume
- Case and fix loop
- Recovery limits
- Finish

## Roles and scope

Keep the coordinator small. It reads ledger summaries and short worker results,
then dispatches bounded work. Workers inspect the relevant cases, evidence, and
source. Share file paths and attempt identities rather than pasting whole logs
or reports into every prompt. No worker needs all previous case reports.

Run workers as the runtime's native subagents by default. For a long or
visible worker, create a background zellij session and run the agent CLI in it,
so the user can attach with `zellij attach <name>`:

```bash
zellij attach --create-background wqa-<run>-<case>-<attempt>
zellij --session wqa-<run>-<case>-<attempt> run --cwd <worktree> -- <agent cli> ...
```

Allocate code-writing worktrees off the tested source under
`.claude/worktrees/<slug>`, per the repo's worktree-first rule.

Repository rules govern worktree allocation. Never switch tools to bypass a
permission denial. Use the parent runtime and model configuration by default.
Do not hardcode model brands or effort changes in the QA workflow.

Run one case at a time against a shared fixture. Use distinct worktrees for
code-writing workers. A separate browser tab or run directory does not isolate
the store, backend, queue, or fixture. Inspect live ownership across runs before
claiming any shared resources. Do not run other cases while a fix changes the
same active application. Two workers must not drive the same browser session:
give each its own session (`--session`) and profile.

## Start and resume

1. Read the scope and case definitions. Confirm mode, fix order, test
   environment, source identity, and owned fixtures. Initialize the run using
   the run-files reference.
2. Confirm the stack with `wqa stack`. Only the coordinator builds it
   (`wqa up --repo <worktree>`, then `wqa stack --wait`); workers never build,
   restart, or take over a stack, and report a down or foreign-built service
   instead. Confirm authentication while the user is present when an
   unattended run depends on it. Do not test service restarts
   or change permissions as an automatic preflight step.
3. For resume, find the run with `wqa list --active` when it is not named, then
   call `wqa status --brief`. Inspect actual worker sessions, current
   source, and fixture state. Continue a live worker through its existing
   subagent ID or zellij session (`zellij ls`); do not claim its case again.
4. If a worker stopped without recording a result, inspect its evidence and
   side effects, then follow `recover` and `cleanup`. Never accept a stale
   triage, plan, result, or completion file from another attempt or pipeline step.

Each case claim identifies the runner. Within that attempt, give every diagnosis,
plan, and implementation step a new step ID and output path. Include run ID,
case ID, attempt, token, step ID, and source identity in those outputs. Check
all identities before consuming the result. The helper validates runner results;
the coordinator validates other pipeline outputs and actual worker completion.

## Case and fix loop

Choose the fix order at initialization. `immediate` (the default) fixes each
defect before the next case runs; use it when a defect can invalidate later
cases. `deferred` tests every pending case first, then fixes the open defects
one at a time; use it for unattended or overnight suites so one defect does not
stall the rest. Deferred order still runs one case at a time, and no case runs
while a fix changes the active application.

1. Check cleanup (`wqa cleanup-plan`) and fixture ownership
   (`wqa list --active`), then claim the case. Generate the brief with
   `wqa brief --role runner [--zellij]` and send its path. Send a fresh runner
   the skill path, case path, brief/environment paths, claim identity, output
   directory, and allowed actions. Runners exercise the feature and save evidence;
   they do not silently fix it before recording the original failure.
2. Wait with the runtime's completion notification or, for a zellij worker,
   a finite wait on the result file it writes last
   (`wqa wait file --path attempts/<case>/<n>/result.json`; the worker writes
   it with `wqa result --no-record`). Verify the worker result
   and record it through `wqa record`. A message saying “done” or a file left
   from a prior attempt is insufficient. Give users short progress updates.
   In deferred order, verify cleanup and return to step 1 while cases remain
   pending. Keep the findings for the fix phase; start steps 3–8 only after all
   pending cases have results. A shared blocker still stops affected testing.
3. For a product failure or a fix-required incidental finding, send a diagnosis
   worker the case report and relevant evidence. Require the violated contract,
   owning layer, root cause, finding ID, and a minimal reproduction. Reuse an
   existing finding ID only after checking that the cause matches.
4. Plan the fix under the repository's task-size rules. Keep a small local fix
   direct. A material product or architecture decision needs the user's decision.
   Record that blocker. In immediate order, a `fixing` case holds the run.
   Incomplete cleanup holds the run in both orders. Use a separate linked run
   for independent cases only after proving their fixtures and services are
   not affected.
5. Dispatch a fix worker to an isolated worktree. Supply the exact tested source,
   including any uncommitted feature changes, through a reviewed patch or snapshot
   when needed. Record its base and preserve the user's changes. If that source
   cannot be supplied safely, stop this dispatch and report the source mismatch.
6. Require a failing regression test, the owning-layer fix, clean diagnostics,
   and focused tests. Stage only the worker's changes. Commit one coherent fix
   using the repository's conventional messages and hook rules. Peer commits stay
   local. The coordinator reviews the commit, re-checks the delivery worktree's
   branch and status, then cherry-picks the commit there; the user must receive
   the changes in the delivery worktree.
7. Confirm the application uses the integrated source. Resolve cleanup, claim a
   fresh attempt with `--retry fix`, and rerun the original case. Retest incidental
   fixes even when the earlier main criterion passed. Record each verified
   finding ID in `resolutions` with evidence from this attempt, as defined in
   [Run files and helper](run-files.md#result-contract). A unit test pass alone
   does not close the QA finding.
8. Repeat only within the retry limits. For shared code changes, create a linked
   regression run for previously passed affected cases. Finish that run before
   claiming all results remain valid for the final source.

In deferred order, repeat steps 3–8 for each remaining case that needs a fix.
Keep implementation, integration, and retesting sequential in this phase.

In report mode, retain the findings and continue after cleanup; do not dispatch
fix workers. A fixture/test-design gap is not a product defect. Correct a
substitution only if it preserves the intended contract and record the change;
otherwise mark the case blocked and state the fixture needed.

A case blocked on its fixture can be replaced by a linked run
(`wqa regress --replace`) after the fixture or case definition changes. Preserve the earlier result and product findings.
Record the replacement relationship in both run briefs; a new passing result
supersedes only the stated case on the verified source.

## Worker brief contract

Every brief contains one role and one bounded task, allowed files and systems,
the identity fields above, input paths, expected deliverables, and verification.
For fixes, add peer branch, base, and integration target. Add the worker's
completion signal: the subagent's final message, or the result file a zellij
worker writes last. A brief grants no additional authority.

`wqa brief --role runner|diagnose|fix` writes such a brief into the attempt
from `assets/briefs/<role>.md` and prints its path and output path. Each call
gets a new step ID (`diagnose-1`, `diagnose-2`, …). A fix brief needs
`--base` and `--target`; `--deadline` overrides the role's default. Review the
brief and add case-specific limits before sending it.

Use a new result path for each pipeline step. A concise final message contains
status, output path, source identity or fix commit, and any blocker. Keep it at
most eight lines. Files carry full evidence. A worker should make routine
choices from the contract, record them, and continue. A required product choice,
credential, or permission must be surfaced, not guessed.

## Recovery limits

- Maximum two fix cycles and two environment retries per case.
- One retry after a confirmed worker interruption. A second interruption
  quarantines the case. Default runner deadline is 75 minutes; diagnosis,
  planning, and implementation deadlines are 20, 30, and 60 minutes. Set a
  justified different deadline in the brief when the case requires it.
- On a deadline, inspect the worker. Stop only that owned worker if it is stuck,
  confirm it stopped, preserve evidence, and reconcile cleanup before recovery.
  Do not automatically rerun an operation with an unknown write outcome.
- Three cases with the same unresolved product cause stop the suite for review.
  A persistent shared infrastructure or cleanup failure stops affected testing
  immediately. Missing authentication or permission is a blocker, not a retry
  opportunity through a different tool.

Quarantine means the allowed attempts ended with an unresolved problem. It is
not a pass. Continue independent cases only when the remaining fixture and
environment state still permit valid tests. Record why any case was skipped.

## Finish

Refresh the report after each case and fix. The coordinator writes
`SUMMARY.html` and runs `wqa export` at the end, including after a stop or
halt (see SKILL.md section 6). On interruption or a user stop,
preserve run state and report what remains. On normal completion, inspect every
terminal case, unresolved finding, cleanup record, and related regression run.

Run the repository's required final code verification after the last integrated
change. Complete peer integration. End only the worker zellij sessions this
suite created, by name (`zellij kill-session <name>`); leave the stack
running unless the user asks for `wqa down`. Close each worker's browser session and release
claimed worktrees. Follow repository restrictions on branch and worktree
cleanup; do not remove worktrees without the required explicit request.

The final response gives totals, verified fixes, unresolved or untested cases,
remaining cleanup, and the `REPORT.html` path. Distinguish “suite finished with blocked
cases” from “all cases passed.” Do not send a Slack message, email, or external
notification unless the user explicitly requested it.
