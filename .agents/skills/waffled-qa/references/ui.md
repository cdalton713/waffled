# UI tests

Use this reference when the tested behavior has a user interface.

## Contents

- Browser and session
- Login and watching
- Target controls
- Exercise the user path
- Evidence
- Limits

## Browser and session

Drive the browser with `agent-browser` on macOS and Linux. Before the first
browser command in a session, run `agent-browser skills get core` and follow
it for command syntax; it always matches the installed version. This file adds
the QA rules that the tool does not enforce.

Require version 0.37 or later; older versions click through covering elements.
Several installs can shadow each other, so check `agent-browser --version` in
the shell that runs the commands. If it is missing or older, ask the user to
install or upgrade it (`npm i -g agent-browser` or `agent-browser upgrade`, then
`agent-browser install`; on Linux, `agent-browser install --with-deps`). Do not
substitute another browser tool.

Run the browser headed by default, so the user can watch it. Each run has its
own session, `wqa-<run-id>`, and profile:

```bash
wqa login --as <handle>   # headed; session wqa-<run-id>, profile ~/.waffled-qa/browser/<run-id>
agent-browser --session wqa-<run-id> snapshot -i
```

With a run (`--as`, `--run`, or `WAFFLED_QA`), `wqa` commands default the session
to `wqa-<run-id>` unless `AGENT_BROWSER_SESSION` or `--session` names one, and
`wqa login` defaults the profile to `~/.waffled-qa/browser/<run-id>`; `--profile`
overrides it. Pass `--session` to every `agent-browser` command, because agent
shells do not keep an exported `AGENT_BROWSER_SESSION`.

Headed mode, the profile, and headless mode are fixed when the session's browser
launches. If a session is already running headless, `agent-browser close` it
first. Run headless (`wqa login --headless`, or `--headed false` for
agent-browser) only when the user asks, or on a host with no display where
headed launch fails; record that choice in `ENV.md`.

The profile keeps a login across restarts. Never copy profile contents or saved
state files into run files; they hold cookies. Record the session name,
profile path, tab ID, and URL in `ENV.md`. Close the session with
`agent-browser close` when the run finishes unless the user wants it kept.

## Login and watching

`wqa login` opens the run's stack (`http://localhost:8081/` or `:8080`, or
`--url` and `WAFFLED_QA_APP_URL`) and signs in through AuthGate's own form
(`#login-email`, `#login-password`, Sign in). Logged in means the form is gone
and `localStorage["waffled.access"]` is set. It prints one JSON line with the
session and profile: `logged-in` or `already-logged-in` exits 0; `failed` exits
1 with the step, the error, and the page text. Step `setup` means the stack has
no household yet and shows the first-run wizard; seeding it is a fixture
decision (see [Stack](stack.md)), not a login retry.

On `:8081` the demo credentials are built in; on `:8080` the helper refuses to
log in until `WAFFLED_QA_EMAIL` and `WAFFLED_QA_PASSWORD` name an account the
user chose. Do not copy credentials into run files. A failed login is a blocker
to report, not a reason to try other credentials.

To test the login flow itself, drive the form directly instead of `wqa login`.

For the kiosk, set the viewport to the target device before capturing (the
kitchen tablet is a 10.1" landscape screen, for example `set viewport 1280 800`)
and record it in `ENV.md`. Kiosk mode, theme, and device pairing live under
Settings; switch them through the UI and restore them in cleanup.

Many views render from PowerSync's local SQLite copy. To prove a write reached
the server, reload, or open the same view in a second session logged in as
another member, and wait for the change there.

On a host with no display, headed mode needs Xvfb, and the user watches through
`agent-browser dashboard start` at `http://localhost:4848` over an SSH port
forward.

## Target controls

Take a fresh `snapshot -i` before acting and after navigation, sorting,
filtering, or re-rendering. Keep one explicit target per action. Match controls
by role, name, and containing dialog or row, not by position. Do not click every
possible match to make one action succeed.

The tool enforces some checks and not others:

- A click on a covered control fails and names the covering element. A covered
  control the user needs is a product finding.
- A click on a **disabled** control reports success and does nothing. Before a
  click that matters, confirm the snapshot shows no `disabled` flag, or run
  `is enabled <ref>`. A disabled control the user needs is a product finding.
- `fill` does not verify the result. Read it back with `get value <ref>`, and
  verify the submitted value independently after save.
- Waits and refused actions exit 1. Treat a timeout or a refusal as an
  observation to classify, not a reason to retry with a looser target.

Use `eval` only to read state, never to set values, click, or submit.
Synthetic events are not proof that a real interaction worked.

## Exercise the user path

- Start from an observed route or a route confirmed in source.
- Distinguish create, edit, preview, and save flows; they can use different steps.
- Check required validation, disabled controls, confirmation dialogs, and errors.
- After save, verify persisted state and reopen through the normal navigation
  path. A success toast alone is insufficient.
- Verify state transitions that matter to the feature, including reload or
  navigation persistence, cancellation, and permission changes where relevant.
- Use a new tab or a new session when the case requires a fresh session. Do not
  reload the page simply to apply code changes when the dev server supports hot
  reload.

`alert` dialogs are accepted automatically. Handle `confirm` and `prompt` with
`dialog accept` or `dialog dismiss`, choosing what the case requires.

A blank page can be loading, a navigation failure, an application exception,
a hidden tab, or a dead browser. Run `wqa diagnose` before classifying it: it
reports `likely` as `hidden-tab`, `server-down`, `loading`, `app-error`,
`blank`, `no-page`, or `ok`, with the URL, page state, and error counts
(`--label <name>` saves the full dump). `capture` and `diagnose` refuse a
session that is not running, because any `agent-browser` command on it would
launch a new blank browser. If the browser died, record the symptom
before reopening; account for any lost form, cart, or session state.

## Evidence

Capture evidence at decision points: the relevant initial state, the graded
result, and a failure. Use `wqa capture` so the output stays short and every
file lands in the attempt:

```bash
wqa capture mark                        # before the action
# ... act through agent-browser ...
wqa capture collect --label after-save  # after it
```

For a state change, mark and collect once before the action with the label
`before-<name>` and once after it with `after-<name>`, showing the same view.
The HTML report places each such pair side by side.

`collect` saves `<label>.png`, the console messages, page errors, failed
requests (headers removed), and URL and page state since the mark, then prints
their counts. Check that the URL is the intended tab and view the screenshot
before grading from it. `agent-browser errors --clear` does not clear page
errors, so do not rely on it by hand; `capture` counts from the mark instead.
For request or response bodies, use `network request <id>` from the saved
`requestId`, or `wqa api`.

A `visible: false` result means the tab is hidden. A hidden or background tab
stops rendering: canvases stay blank, layouts stay "arranging", and first loads
look slow. Bring the tab forward or give each worker its own session and redo
the capture before reporting such a defect.

Hidden text can help diagnosis; it is not evidence of a visible result. Use
`is visible` or a screenshot to grade what the user sees. Capture transient
messages while they exist; reopening a page may not restore them.

## Limits

- Snapshot refs reach into iframes, including cross-origin embeds (an OAuth
  consent page, an embedded map), so `click` and `fill` work there. `wait` sees only the top
  document, even after `frame`. To read iframe content, run `frame <ref>`, poll
  `get text <selector>` with a bounded number of attempts, then `frame main`.
- Headless rendering can differ from a real display in fonts and GPU effects.
  Visual-fidelity cases need a screenshot review by the user.
