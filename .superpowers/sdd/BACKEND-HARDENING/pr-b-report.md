# PR B — Local Dev / Test Parity — Report

Branch: `improvement/local-test-parity` (base `main` @ 9e20f2a)
Date: 2026-08-12

## Task B1 — Reconcile DB URLs to one default

**Changed:**

- `apps/server/.env`: `DATABASE_URL` → `postgresql://postgres:password@localhost:6767/cogito-app` (was `...localhost:5432/cogito-test`). Also aligned `NODE_ENV` to `development` to match `.env.example` (was `test`; the rest already matched: BETTER_AUTH_URL 3001, CORS_ORIGIN 3000, PAYMENT_PROVIDER=stub).
- `packages/api/src/tests/test-setup.ts`: line 1 default → `postgresql://postgres:password@localhost:6767/cogito-app` (was `test:test@localhost:5432/test`).

**Important deviation from brief:** The brief asserts `apps/server/.env` is git-tracked and committed. It is NOT — it's ignored by `apps/server/.gitignore:32` (`.env*`) and has never been committed (`git ls-files` empty, `git log -- apps/server/.env` empty). Per repo policy (secrets file, explicitly gitignored) I did **not** force-add it. The local file edit is applied on disk so local dev works, but the B1 commit contains only `test-setup.ts`. Flagging so the maintainer can decide whether `.env` should be force-committed (not recommended).

## Task B2 — Test database compose file (DEFERRED-OPS 1.8)

**Changed:**

- Created `docker-compose.test.yml` (repo root): postgres:16-alpine on 6767, redis:7-alpine on 6379, healthchecks per brief.
- `packages/db/package.json`: added `"db:test": "docker compose -f ../../docker-compose.test.yml up -d"`.
- `package.json` (root) + `turbo.json`: added `db:test` forwarding task (`turbo -F @cogito-app/db db:test`, cache:false) to match the existing `db:*` pattern — required so `bun run db:test` works from repo root as the brief's verification expects. No dependency versions changed.

## Verification

- `bun run check-types`: PASS — 3/3 tasks successful (server, api, web).
- `bun test --env-file apps/server/.env packages/api/src/tests/integration/booking-solo.test.ts`: could NOT pass — Docker daemon is not running on this machine, so all 3 suites fail with `ECONNREFUSED` on the TRUNCATE/reset step. Failure is connection-only, not URL misalignment.
- Static alignment confirmed: `.env`, `test-setup.ts` default, `packages/db/docker-compose.yml`, and `docker-compose.test.yml` all resolve to `postgresql://postgres:password@localhost:6767/cogito-app`. DB-dependent tests require `bun run db:start` (or `db:test`).
- `bun run db:test`: wired correctly (turbo resolves task; docker-compose path `../../docker-compose.test.yml` resolves), fails only at `docker API ... no such file` because the daemon is down. YAML validated via `docker compose config`.

## Files changed

| File                                   | Change                                                                                   |
| -------------------------------------- | ---------------------------------------------------------------------------------------- |
| `packages/api/src/tests/test-setup.ts` | B1: default DATABASE_URL → 6767/cogito-app (committed)                                   |
| `apps/server/.env`                     | B1: local-only edit, 6767/cogito-app + NODE_ENV=development (NOT committed — gitignored) |
| `docker-compose.test.yml`              | B2: new test compose (Postgres+Redis)                                                    |
| `packages/db/package.json`             | B2: added `db:test` script                                                               |
| `package.json`                         | B2: added root `db:test` turbo forwarding                                                |
| `turbo.json`                           | B2: added `db:test` task (cache:false)                                                   |

## Commits

- `aa4e2e9` fix(dev): reconcile DB URLs across .env, docker-compose, and test setup
- `eda8ea8` test: add docker-compose.test.yml for local Postgres + Redis

## Self-review findings

1. **`.env` tracking premise is wrong** (see B1 deviation). Commit for B1 intentionally scoped to `test-setup.ts`.
2. Root `package.json` + `turbo.json` needed the `db:test` wiring for `bun run db:test` to work from root — an addition beyond the brief's literal file list, but required to satisfy the brief's own verification step and consistent with all other `db:*` scripts.
3. Unit-test files (`packages/api/src/tests/unit/db.test.ts`, `db-health.test.ts`, `packages/db/src/tests/unit/db.test.ts`) still contain `test:test@localhost:5432/test` but they mock env and never connect — out of scope, left as-is.
4. Pre-commit oxfmt hook reformats in-place; B1 was amended once to keep the committed file formatter-canonical. Final history is clean (2 commits).

## Concerns

- End-to-end local DB run not exercised (no Docker on this machine). CI on GitHub Actions still provisions its own Postgres on 5432 with `cogito-test` — unaffected. Recommend running `bun run db:start && bun run db:migrate && bun test ...` once Docker is available.
- `apps/server/.env` remains untracked, so the fix is machine-local. If a committed default `.env` is desired, that's a repo-policy decision (currently gitignored).
