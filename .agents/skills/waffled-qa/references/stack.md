# Stack

Read this before the first test write in every run.

## The two stacks

| | `:8080` main | `:8081` demo |
| --- | --- | --- |
| Control script | `./waffled` | `./waffled-demo` |
| Data | The household's real install | "The Seinfelds", fake |
| Web + `/api` | `http://localhost:8080` | `http://localhost:8081` |
| Direct api port | `:3000` | `:3100` |
| Postgres | `:5432`, `waffled-postgres` | `:5532`, `waffled-demo-postgres` |
| Containers | `waffled-api`, `waffled-caddy`, … | `waffled-demo-api`, `waffled-demo-caddy`, … |
| QA login | `WAFFLED_QA_EMAIL` / `WAFFLED_QA_PASSWORD`, named by the user | `jerry@seinfeld.demo`, built in |
| `wqa up` runs | `./waffled up --build` (needs `--confirm-main`) | `./waffled-demo up` |
| `wqa restart api` runs | `./waffled rebuild api` (needs `--confirm-main`) | `./waffled-demo up api` |

Caddy serves the built SPA and proxies `/api/*`, `/auth/google/*`, and
`/media/*` to the api; PowerSync has its own route. So the app origin is also
the API base URL, and `web` in `wqa restart` means the caddy image. Caddy
answers `/healthz` itself, so it proves nothing about the api; `wqa` probes
`/api/auth/status` instead.

Use the direct api port only for diagnosis. On this machine `:3000` can belong
to another project's dev server, so never assume a response there is Waffled.

## Ownership

Every `./waffled[-demo]` invocation from any worktree targets the same
containers. `wqa stack` reads each container's compose `working_dir` label (the
checkout that last created it) and the api's `GIT_SHA` build arg:

```bash
wqa stack --stack 8081 --expect-repo "$(git rev-parse --show-toplevel)"
```

`ours: false` on `api` or `web` means the running code is not the code under
test. Do not grade a case against it. Ask the user before `wqa up --take-over`,
because the owning session may be mid-run. `postgres` and `powersync` labels
only show who created them; their data persists across rebuilds.

## Seeding the demo household

`./waffled-demo up` on empty volumes shows the first-run setup wizard
(`/api/auth/status` → `initialized: false`; `wqa doctor` flags it). Seeding is
fixture setup, so ask before running it, and record it in `ENV.md`:

```bash
docker exec -e WAFFLED_ALLOW_DEMO_SEED=1 waffled-demo-api node dist/seed-demo.js base
# copy recipes in (see apps/api/scripts/seed-demo.ts header), then:
docker exec -e WAFFLED_ALLOW_DEMO_SEED=1 waffled-demo-api node dist/seed-demo.js meals
```

`base` creates the household, four people (Jerry and Kramer adults, George and
Elaine kids), modules, currencies, rewards, chores, goals, lists, pantry,
photos, calendar events, and countdowns. Resolve IDs from the live API after
seeding; never reuse IDs from another run. `./waffled-demo nuke` deletes the
demo volumes; it is destructive and needs the user's go-ahead.

## Reading state

- Logs: `./waffled-demo logs api` (follows; bound it with `timeout 20`), or
  `docker logs --since 2m waffled-demo-api`.
- Database: `./waffled-demo psql` / `./waffled psql`, read-only queries only.
- Jobs and health: `docker exec waffled-demo-api node dist/health-cli.js --pretty`
  (the same report `./waffled doctor` prints), no token needed.
- Migrations run on `up`; a failed migration leaves the api unhealthy. Read
  `docker logs waffled-demo-migrate` before classifying a broken page.

## Out of scope

`agent-browser` drives the web app only. The iOS and Mac apps need their own
simulators and XcodeGen flow (`apps/ios/CLAUDE.md`, `apps/mac/CLAUDE.md`);
record any native-only behavior as untested rather than inferring it from web.
