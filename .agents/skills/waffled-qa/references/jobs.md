# Background job tests

Use this reference for the api's background schedulers (calendar sync and
recurrence expansion, ICS feeds, recipe ingest, chore-proof cleanup), PowerSync
replication, and third-party integrations (Google Calendar and Photos,
AnyList) that change state asynchronously.

## Define the completion contract

Identify the trigger, message or job identity, consumer, final state, and observable
effect. A successful enqueue is not a completed job. A successful validation or
preview job is not proof of publication. Correlate the exact job mode, version,
and output required by the case.

Schedulers run inside the api container, so `wqa stack` (`api` `ours: true`,
current `GIT_SHA`) is the check that the worker runs the tested code. Their
run registry (last run, duration, error, run count) is in the health report:
`docker exec <api container> node dist/health-cli.js --pretty`. The registry
is process-local and resets on every rebuild. A running container does not
prove that a job can complete.

A third-party integration needs credentials the user configured on that stack.
Missing or expired credentials are `blocked/infra` (or `fixture`), not a
product failure. Never connect, disconnect, or reauthorize the user's real
account on `:8080` without asking; disconnecting can delete imported data.

## Trigger, wait, and verify

Trigger through the supported UI, API, or existing local test mechanism. Record
the job and request IDs. Poll for explicit success and failure states with a
deadline:

```bash
wqa wait http --path /api/<resource>/<id> --field status --until done \
  --fail-on failed --timeout 55s
```

It prints the final value and exits 1 on a failure value or timeout; repeat
the call to wait longer. Use runtime wait facilities in short tool calls for long operations.
Capture state changes once; avoid repeated full logs.

Verify the final persisted result and downstream effects. Add retry, duplicate
delivery, cancellation, timeout, ordering, or partial-failure cases only when
those behaviors are in scope. Use data that exposes the difference between
one execution, no execution, and repeated execution.

Keep first-run and retry evidence. A warm retry does not erase a cold failure.
Determine whether a timeout came from the product contract, the test harness,
local resource pressure, expired credentials, or an unavailable dependency.

## Recovery

Use targeted local logs, request correlation, queue state, and worker start times
to identify the failure. A source reload can interrupt a worker mid-job; verify
what completed before triggering a replacement. Do not create duplicate writes
by retrying an operation whose outcome is unknown.

Rebuild a service only with `wqa restart <name>`, and only on a stack this
checkout owns. A rebuild resets the job registry and drops in-flight runs;
verify what completed before triggering a replacement.
Verify the business path after recovery, not only the process or edge health.
Missing authentication is a user action. Persistent shared failure stops the
affected suite; report what could not be tested.
