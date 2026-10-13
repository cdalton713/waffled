# Skill evaluation scenarios

Use these cases to evaluate future changes. Give a fresh reviewer the skill and
scenario inputs without the expected decisions below. These are simulations;
live app execution needs the user's local test environment and feature scope.

## Scenarios and acceptance criteria

| Scenario                                                                 | Required decisions                                                                                                                                                                    |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Settings Save fails; branch includes uncommitted feature work            | Reproduce through Save, verify persistence, preserve the feature changes, fix the owner, add a failing regression test, and retest the user path on the updated source.               |
| API pagination has an empty final page                                   | Grade the API contract with request and cursor evidence; accept expected emptiness with a positive control; require no unrelated UI.                                                 |
| API returns the new chore but the kiosk never shows it                   | Check readiness and visibility, distinguish DOM presence from user-visible output, reload or use a second session to separate PowerSync lag from a render bug, and never treat the API response alone as a visible pass. |
| User asks for QA without naming a stack                                  | Ask :8080 or :8081 before any test write; suggest :8081; on :8080 require named credentials and --confirm-main for rebuilds.                                                      |
| Background worker is unavailable during verification of a fix            | Preserve the product finding, record blocked/infra, recover only scoped services, spend an infrastructure retry, and require the original behavior to pass before closing the defect. |
| Suite resumes after a worker crash with stale PASS and unrelated objects | Verify worker and attempt identities, reject stale evidence, record interruption, inspect owned side effects, preserve unrelated objects, and retry only after cleanup.               |
| Cleanup fails after a valid case result                                  | Record both the verdict and incomplete cleanup. Block new claims in that run; independent fixtures require a separate linked run.                                                     |
| Fixture cannot exercise a defect after a fix                             | Preserve the unverified finding, record blocked/fixture, and create a linked replacement run when the fixture changes. Do not spend another fix cycle just to change the case.        |
| Same UI case on a Mac, then over SSH on a Linux host without a display   | Use `agent-browser` on both with a per-run session and profile; watch through the dashboard on Linux; run long suite workers in zellij on both.                                       |
| Screenshot shows a blank canvas while the tab is hidden behind another   | Read `visible: false` from `capture collect`, bring the tab forward or use a separate session, recapture, and report no product defect unless the visible tab reproduces it. |
| The demo stack's api was built from another worktree                     | `wqa stack` exits 1 with the mismatch; record blocked/infra or ask the user before `wqa up --take-over`; do not grade the case against the other checkout's build. |

## Additional scenarios

For a deferred suite, record a product failure in the first case while another
case remains pending. Complete cleanup and run the pending case before starting
diagnosis, implementation, or integration. Then fix and retest cases one at a
time. In immediate order, fix the first case before testing the next one.

For a case with two required findings, submit a passing retry that resolves only
one finding with current evidence. The other finding must remain open in status
and report output. Resolve it explicitly after a retest before claiming all
cases passed. Invalid or stale resolution evidence must leave the attempt open.

## Coverage boundary

`agent-browser.spec.mjs` drives a fixture page in real Chrome to confirm the
tool behavior that `references/ui.md` relies on: covered clicks are refused,
disabled clicks are not, fill and `get value` agree, snapshot refs reach a
cross-origin iframe while waits do not, and `errors --json`,
`console --json`, and `network requests` capture this attempt's failures. A
failure there means the UI reference needs updating for the installed version.

`wqa.spec.mjs` executes the real CLI with real temporary files. A scenario
review is a simulation; it is not evidence of live Waffled QA.
