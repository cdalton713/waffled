# waffled-qa fix brief: {{caseId}} attempt {{attempt}}

Role: fix. Implement one coherent fix for the diagnosed finding.
Read the skill at `{{skill}}/SKILL.md` and follow the repository's rules.

## Identity

- Run: `{{run}}` (runId `{{runId}}`), case `{{caseId}}`, attempt {{attempt}}, step `{{step}}`
- Tested source: `{{repo}}` at {{source}}
- Work in: `{{branch}}`, based on `{{base}}`; the coordinator integrates into `{{target}}`

## Inputs

- Case: `{{caseFile}}`
- Evidence and diagnosis: `{{directory}}`

## Required

1. A regression test that fails for the observed defect.
2. The fix in the owning layer; nothing outside the finding's scope.
3. Clean diagnostics and the repository's focused lint and tests.
4. One commit with the repository's conventional message. Do not push.

## Deliverable

Write `{{output}}` with the commit, test commands and results, and anything the
retest must check. Include the identity lines above.

Deadline: {{deadline}}. A material product or architecture decision is a
blocker to report. Final message: status, commit, output path, and any
blocker, at most eight lines.
