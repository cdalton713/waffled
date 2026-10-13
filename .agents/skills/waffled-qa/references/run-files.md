# Run files and helper

## Contents

- Commands and run setup
- Case and attempt files
- Result contract
- Recovery and reports (HTML export, pruning old runs)
- Helper validation

## Commands and run setup

`wqa` is a Node.js helper with no runtime dependencies beyond Node 22+.
Run `wqa help` for command options. Every command prints JSON on success and
exits nonzero with a short error on failure; add `--compact` for one line.
`status` is read-only, and `status --brief` prints one line per case without
tokens. `report` writes `REPORT.md` from the saved run snapshot. The ledger
commands change run files only; `doctor`, `stack`, `capture`, `diagnose`,
`api`, `wait`, and `token` read Docker, the browser session, or the local
stack; `up`, `restart`, and `down` run the stack scripts (see
[UI tests](ui.md) and [API tests](api.md)).

A command finds its run from, in order: `--run`, the claim handle (`--as` or
`WAFFLED_QA`), `WAFFLED_QA_RUN_DIR`, and, for commands that need a run, the only open run
whose repo is the current checkout. With no open run there, or several, it
fails and names them rather than guessing. There is no global “current run.”
Without `--run`, `init` creates a directory under `~/.waffled-qa/runs/` named after
the feature and the local time, for example
`settings-persistence-20260928-203045`, and ignores `WAFFLED_QA_RUN_DIR`. That name
is also the `runId`.

Create the case files and a spec JSON file. Example shape:

```json
{
  "feature": "Settings persistence",
  "repo": "/absolute/path/to/the-tested-worktree",
  "stack": "8081",
  "mode": "fix",
  "fixOrder": "immediate",
  "cases": [
    {
      "id": "save-setting",
      "title": "Saved value survives navigation",
      "file": "save-setting.md"
    }
  ]
}
```

Replace the example repo path with the inspected worktree. Case paths are
relative to the spec file, or absolute. The helper copies their content into
the run. IDs use letters, digits, underscores, and hyphens, up to 64 characters.
Use `mode: "report"` for an explicitly non-fixing request. Omission means fix.
`fixOrder` is `immediate` (default) or `deferred`; the suite reference explains
the choice. In deferred order, other cases can be claimed while a case is
`fixing`, and `claim --retry fix` is refused until no case is pending.

```bash
wqa init --spec /path/to/spec.json
wqa status --run /path/returned/by/init
```

Use the returned path for later calls. Initialization refuses an existing run
directory. To change the scope or case definitions after initialization, create
a new linked run with `wqa regress`; do not rewrite the ledger or erase
earlier evidence.

`stack` is required: `"8080"` or `"8081"`, as the user chose. Commands in the
run use it unless `--stack` names another. The spec may also name the shared
fixture, `"fixture": {"household": "…"}`. `wqa list --active` warns when two
active runs use the same stack (one stack is one database) or fixture. `init`
stamps the repository's source (branch, HEAD, and a hash of uncommitted
changes), and each `claim` stamps the attempt's source; the report shows both.

## Case and attempt files

The run contains:

| File                      | Purpose                                                                         |
| ------------------------- | ------------------------------------------------------------------------------- |
| `run.json`                | Authoritative case states, attempts, tokens, results, and retry counts          |
| `BRIEF.md`                | Agent-written scope, source identity, accepted decisions, and final code checks |
| `ENV.md`                  | Agent-written local URLs, fixture ownership, initial values, and service checks |
| `cases/<id>.md`           | Copied case definition                                                          |
| `attempts/<id>/<number>/` | Evidence, case report, triage, fix plan, and fix completion record              |
| `REPORT.md`               | Generated summary and links to every attempt                                    |

Read `run.json` through `status` where possible. Do not source run files as shell
code. Do not edit the ledger by hand to bypass a blocked transition.

```bash
wqa claim --run /path/to/run --case save-setting --worker session-id
```

The response supplies `runId`, `caseId`, `attempt`, `token`, `directory`,
`caseFile`, and `handle`. The handle, `<runId>/<case>/<attempt>.<token>`, names
the run and attempt in one value; give it to the worker. The token identifies
this attempt; it is not an application credential. Duplicate claims are
rejected. Agent shells do not keep exported variables between commands, so the
worker passes the handle on each command that writes into the attempt:

```bash
wqa capture collect --as settings-persistence-20260928-203045/save-setting/1.<token> --label after-save
```

`WAFFLED_QA=<handle>` works the same in a shell that keeps its environment. For a
run outside `~/.waffled-qa/runs/`, `claim` records its location in
`~/.waffled-qa/run-index/` so the handle still finds it. `--run`, `--case`, and
`--token`, or `WAFFLED_QA_RUN_DIR`, `WAFFLED_QA_CASE`, and `WAFFLED_QA_TOKEN`, still work.
A command that has a run and no `AGENT_BROWSER_SESSION` uses the browser
session `wqa-<runId>`, the one `wqa login` opens.

`result`, `capture`, and `api --save` then write into this attempt, and refuse
when the token no longer matches the case's latest running attempt. Evidence
names they take are plain file names inside the attempt, and an existing file
is never replaced.
Only one case can run at a time in a run. Cross-run fixture ownership is the
agent's responsibility: check other live runs and workers before using a shared
store or fixture. Separate run directories do not isolate application state.

The helper uses a short `.write-lock` during ledger changes. It refuses to break
an existing lock. If a writer crashes, confirm that no helper process is writing
this run, inspect `run.json` and orphaned attempt files, then remove only that
confirmed stale lock. Preserve orphaned files; do not let them satisfy a new
attempt. The worker lifetime is tracked by the attempt, not this short file lock.

## Result contract

Write a concise Markdown report in the attempt directory. Include expectation,
actual result, source identity, execution proof, findings, test commands, fix
references, and cleanup. Record whether evidence is from a live test or a
simulation. Save complete relevant evidence beside the report, with secrets
removed. Do not replace files from an earlier attempt.

Create a result JSON file using the returned identity fields. Example shape:

```json
{
  "runId": "value-from-claim",
  "caseId": "save-setting",
  "attempt": 1,
  "token": "value-from-claim",
  "outcome": "pass",
  "cause": null,
  "summary": "The saved value remains after navigation and a new read.",
  "report": "attempts/save-setting/1/report.md",
  "evidence": ["attempts/save-setting/1/persisted-value.json"],
  "findings": [],
  "resolutions": [],
  "cleanup": {
    "status": "clean",
    "note": "Original value restored and read back."
  }
}
```

All report and evidence paths must be relative to the run and resolve to
nonempty files within this attempt's directory. A previous attempt's files,
outside files, and symlink escapes are rejected. A pass requires evidence.
The helper validates ownership and structure; it cannot judge whether the
evidence proves the expectation. The runner and reviewer must do that.

`pass` requires `cause: null`. `fail` requires `cause: "product"`. `blocked`
requires `product`, `infra`, or `fixture`. Use `fixture` for unsuitable data or
an invalid discriminator, and state any missing product decision in the report.
Each finding is `{"id":"short-slug","summary":"Observed defect","requiresFix":true}`.
Use `false` for observations that do not require a product fix.

Required findings stay open by ID across attempts. A passing main criterion,
an omitted finding, or a later `requiresFix: false` does not resolve them.
After retesting a finding, include a resolution in the result:

```json
{
  "resolutions": [
    {
      "id": "cancel-error",
      "summary": "Cancel closes the dialog without an error.",
      "evidence": ["attempts/save-setting/2/cancel-verification.json"]
    }
  ]
}
```

Each resolution names an open finding from an earlier attempt of this case,
gives a verification summary, and links to nonempty evidence files from the
current attempt. Use the actual paths returned by `claim`. Duplicate IDs,
unknown IDs, and reporting and resolving the same ID together are rejected.
Omitting `resolutions` means no findings were resolved. The helper checks
identity and file ownership; the runner must check what the evidence proves.
If the defect returns on a later attempt, report the same finding ID again.

In fix mode, open findings keep a case `fixing` even when its main criterion
passes. The existing retry limits still apply. Report mode retains the open
findings without requesting fixes. Both modes require no open findings for
`allPassed: true`.

Older runs remain readable. Historical findings without explicit resolutions
appear as open; an earlier pass alone supplies no resolution evidence. For a
terminal case, use a linked regression run and document the verified finding
IDs in both briefs. The earlier report retains its unverified findings.

Cleanup is `clean`, `not-needed`, or `incomplete`, always with a note. Record the
result even when cleanup is incomplete. The next claim is blocked until the
cleanup is verified. A passing main criterion with a fix-required finding enters
the fix workflow in fix mode. Report mode preserves findings without fixing.

`wqa result` builds this JSON from the worker environment, so identity fields
and paths need no copying. Bare file names resolve inside the attempt;
`--report` defaults to `report.md`, and `fail` defaults to cause `product`.
Findings and resolutions come from JSON files holding the arrays shown above,
and their evidence may also use bare names:

```bash
wqa result --outcome pass --summary "Saved value survives navigation." \
  --evidence persisted-value.json,after-save.png \
  --cleanup clean --cleanup-note "Original value restored and read back." \
  [--findings findings.json] [--resolutions resolutions.json] [--dry-run | --no-record]
wqa report --run /path/to/run
```

It writes `result.json` in the attempt, then records it. `--dry-run` only
validates. `--no-record` only writes, for a zellij worker whose coordinator
records the file with `wqa record --run <run> --result <path>`.

Finished attempts are immutable through `record`. Run, case, attempt, and token
must all match. A file's existence is never a worker completion signal by itself.

## Recovery and reports

After a verified local fix and cleanup, use `claim --retry fix` with the same
case ID and new worker identity. It allocates a fresh attempt and increments
the fix cycle. Two failed fix cycles quarantine the case. An infrastructure
failure during verification does not clear an open product defect.

Use `--retry infra` after an infrastructure recovery, at most twice per case.
Do not spend another fix cycle to recover infrastructure. Once the limit is
reached, record the unresolved issue and stop or continue independent cases as
the suite reference directs. A passed case stays terminal; use a new regression
run when later code changes require it to be tested again.

A `blocked/fixture` result is terminal for that case definition. It does not
consume another fix cycle or erase a prior product finding. When suitable data
or a corrected discriminator becomes available, create a linked replacement run
with the revised case: `wqa regress --from <run> --cases <id> --replace
<id>=<new-case.md> --reason "<why>"`. Both runs record the link. State in the
brief which earlier case it supersedes and why. Do not
claim a fix retry to change the expected contract.

For a crashed worker, first confirm the actual worker stopped. Then:

```bash
wqa recover --run /path/to/run --case save-setting --attempt 1 --token claim-token --reason "Worker exited; session checked" --worker-stopped yes
```

This records an interruption, preserves evidence, and marks cleanup incomplete.
It does not stop processes. Inspect run-owned changes, perform cleanup, and
write its evidence in that attempt before recording:

```bash
wqa cleanup --run /path/to/run --case save-setting --attempt 1 --token claim-token --status clean --report attempts/save-setting/1/cleanup.md
wqa claim --run /path/to/run --case save-setting --worker new-session --retry interrupted
```

Use `--status not-needed` only when inspection proves that no cleanup is needed.
The same cleanup command resolves incomplete cleanup after a finished attempt.
One interrupted retry is allowed. Repeated interruption quarantines the case.

`status` lists the fix order, latest attempts, each case's `openFindings`,
blocking cases, and the next pending case.
`next: null` can mean work is in flight or blocked, not that the suite passed.
`report` returns `complete`, `allPassed`, cleanup state, retryable cases, counts,
`openFindings` with case IDs, and its path. Its Markdown lists open findings
and the resolution evidence in attempt history.
An infrastructure or interrupted case with retries available keeps
`complete` false. A halt can still have a useful report; do not exhaust retries
just to make this flag true when authentication or a user decision is missing.
Blocked and quarantined cases remain visible. Completion of recorded cases
does not prove code checks or peer integration passed: record and verify those
separately in the run brief before the final handoff.

### HTML export

`wqa export --run <dir> [--out <file>]` writes `REPORT.html` (or `--out`): one
self-contained page. Every run ends with it. In order, the page has the summary
tiles; `SUMMARY.html` from the run directory, when present, inlined as written;
a visual summary with the images from each case's latest attempt; the case
table; open findings; `BRIEF.md` and `ENV.md`; and every attempt's report and
evidence. Within one evidence list, an image whose name contains the word
`before` (`before-save.png`, `save_before.png`) is shown beside the image named
with `after` in its place. Each image is embedded once; later mentions link to
it. In `SUMMARY.html`, an `<img src="…">` with a run-relative path is embedded;
other sources are left as written. Images up to 5 MB and text files are
embedded; larger or binary files are listed only. It reads only files inside
the run. Evidence must already be redacted, because the page carries it.
Publishing or sending the page is outward-facing; do it only when the user asks.

### Pruning old runs

`wqa prune [--older-than 30d] [--root <dir>] [--dry-run]` deletes run
directories under `~/.waffled-qa/runs/` whose last update is older than the limit
(`12h`, `30d`, `4w`). It keeps any run that is locked, has a running attempt,
has open findings, or has incomplete cleanup, and reports why. It ignores
directories without `run.json`. Always run `--dry-run` first and read the plan.
Prune only when the user asks; export a run first if its evidence matters.

## Helper validation

The bundled tests use Vitest and real temporary files and CLI processes. Run the
installed repository's Vitest against this skill; do not install a second copy:

```bash
(cd apps/api && npx vitest run --root /absolute/path/to/waffled-qa --config /absolute/path/to/waffled-qa/vitest.config.mjs)
for f in /absolute/path/to/waffled-qa/scripts/*.mjs /absolute/path/to/waffled-qa/scripts/lib/*.mjs; do node --check "$f"; done
```

Run Vitest from a directory that resolves it, such as `apps/api` or `apps/web`
after `npm install`. `tests/agent-browser.spec.mjs` checks the `agent-browser`
behavior that [UI tests](ui.md) relies on, against a local fixture page; it is
skipped when `agent-browser` is not installed. `npx` and `pnpm exec` can put a
different install first on PATH; set `AGENT_BROWSER_BIN` to the binary the
agent's shell resolves. These checks validate the helper and the browser
assumptions. They do not exercise the Waffled app.
