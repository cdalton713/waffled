# waffled-qa diagnosis brief: {{caseId}} attempt {{attempt}}

Role: diagnosis. Explain the failure; do not change code or product state.
Read the skill at `{{skill}}/SKILL.md` and the failing attempt's evidence.

## Identity

- Run: `{{run}}` (runId `{{runId}}`), case `{{caseId}}`, attempt {{attempt}}, step `{{step}}`
- Source: `{{repo}}` at {{source}}

## Inputs

- Case: `{{caseFile}}`
- Failing attempt: `{{directory}}` (report, result.json, evidence)
- Open findings: `wqa findings --run {{run}} --open`

## Deliverable

Write `{{output}}` with: the violated contract, the owning layer, the root
cause, the finding ID (reuse an existing ID only when the cause matches), and a
minimal reproduction. Include the identity lines above.

Deadline: {{deadline}}. Final message: status, output path, finding ID, and any
blocker, at most eight lines.
