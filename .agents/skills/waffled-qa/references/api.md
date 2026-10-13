# API tests

Use this reference for `/api/*` behavior, or read-only verification of UI writes.

## Contract and access

Find the route handler under `apps/api/src/modules/<module>/`, its request
validation, response shape, and the web client that calls it
(`apps/web/src/lib/api/`). Test the public route rather than calling a service
function. The existing integration tests in `apps/api/test/` show the contract
each route already promises.

All routes are under the app origin (Caddy proxies `/api/*`), so the stack's
base URL is the app URL. Auth is a bearer access token from
`POST /api/auth/login`. The token is household-scoped: it lands on the
account's last-active household. Role capabilities (adult, kid, admin) gate
routes, so log in as the member the case names.

Get a token with `wqa token` (it uses the run's stack). On `:8081` it logs in
as the seeded demo user; on `:8080` it requires `WAFFLED_QA_EMAIL` and
`WAFFLED_QA_PASSWORD` for an account the user named. It caches only the access
token, in `~/.waffled-qa/tokens.json` (mode 0600), until a minute before
expiry; the refresh token is never stored. Keep the token out of the
transcript: let `wqa api` add it, or use it inline.

```bash
wqa token --info     # base URL, email, households, expiry; token redacted
wqa token --refresh  # after a DB reset, a password change, or a 401
curl -s -H "Authorization: Bearer $(wqa token)" http://localhost:8081/api/household
```

Prefer `wqa api` for requests whose result is evidence. It adds the session
token (`--auth session`, the default) or nothing (`--auth none`). With `--save`,
it writes the full response and a `.meta.json` with status, timing, and
redacted headers into the attempt. It prints the status, byte count, top-level
keys, array lengths, pagination fields, and any domain error. A non-2xx status
is printed as an observation; only a transport failure exits 1. `--body <file>`
sends JSON.

To act as a different member (a kid, a second adult), log in as that member
with `WAFFLED_QA_EMAIL`/`WAFFLED_QA_PASSWORD` set for the command; the cache
keys tokens by base URL and email. Kiosk devices authenticate with a paired
device token, not a login; test pairing through the UI.

## Cases

Select contract-relevant cases: valid input, missing or invalid fields,
boundaries, role permissions, household isolation, pagination, and state
transitions. For writes, verify persisted state through a supported read path
and required side effects (a PowerSync row the web app renders, a job enqueued,
an integration call). Test idempotency and retries only when they are part of
the contract.

Setup and cleanup may use the API when the API is the tested interface. For UI
cases, API reads can verify changes; API writes must not replace broken UI steps.

## Evidence

Capture status, request identity, relevant headers, validated response shape,
and complete response content where needed. Keep raw artifacts on disk and
short excerpts in context.

An HTTP 200 can still contain a domain error. A 401 proves transport
reachability only; a 502 from `:8080`/`:8081` means Caddy is up and the api
container is not. Correlate requests with `docker logs --since 2m <api
container>` when execution or downstream work is part of the claim.
