# waffled-qa runner brief: {{caseId}} attempt {{attempt}}

Role: runner. Run one case and record its result. Do not change product code.
Read the skill at `{{skill}}/SKILL.md` and only the references this case needs.

## Identity

- Run: `{{run}}` (runId `{{runId}}`), mode `{{mode}}`
- Case: `{{caseId}}`, attempt {{attempt}}, step `{{step}}`
- Source: `{{repo}}` at {{source}}

Attempt handle: `{{handle}}`. Add `--as {{handle}}` to each `wqa` command
that writes into the attempt (`result`, `capture`, `created`, `api --save`,
`diagnose --label`); `wqa` then also uses the browser session `{{session}}`.
Drive the browser with `agent-browser --session {{session}} …`.

## Inputs

- Case definition: `{{caseFile}}`
- Brief and environment: `{{run}}/BRIEF.md`, `{{run}}/ENV.md`

## Allowed

- Read the source; drive the app through `agent-browser`; read-only API,
  log, and database checks; setup and cleanup through supported interfaces.
- Write only inside `{{directory}}`.
- Record every created object or changed value with `wqa created`.

## Deliverables

- `report.md` in the attempt directory, with evidence saved through
  `wqa capture`, `wqa api --save`, or plain files there. Capture
  `before-<name>` and `after-<name>` screenshots of the same view around each
  visible state change; list them in the result's evidence.
- {{completion}}

Deadline: {{deadline}}. A required product decision, credential, or
permission is a blocker to report, not a choice to make. Final message: status,
output path, source identity, and any blocker, at most eight lines.
