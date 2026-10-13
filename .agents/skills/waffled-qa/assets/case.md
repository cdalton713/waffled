# Case title

## Contract

State the behavior, its user, and the specification or requirement that defines
the expected result. State which layers this case will and will not exercise.

## Preconditions and ownership

Identify the local worktree, the stack (:8080 or :8081), the household and
member roles, required data, and
objects this attempt may change. Record existing values before changing them.
Define the supported setup path and why the data can expose a defect.

## Actions and expected results

List the actions in order. Give independent expected values at the relevant
checkpoints. Include a positive control if a skipped operation could look like
the expected result. Identify relevant negative or boundary inputs.

## Evidence

Define the signals that prove execution, persistence, and downstream effects.
Name required screenshots, request or job IDs, response fields, and log excerpts.
Prefer `before-<name>`/`after-<name>` screenshot pairs of the same view for each
visible state change.
Set a finite wait deadline based on the feature contract or observed local work.

## Cleanup

List created objects to retire and prior values to restore through the supported
interface. Define the read checks that prove cleanup. Record any remaining state
when cleanup fails.
