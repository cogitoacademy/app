# Task C6 Report: Remove dead code

Branch: `improvement/backend-correctness`
Status: DONE (with pre-existing test-infra failures, unrelated)

## Candidate-by-candidate results

### 1. `apps/server/src/middleware.ts` — DELETED

- **Grep**: `grep -rn "middleware" apps/server/src --include="*.ts" | grep -v "middleware.ts"` → no matches. Also checked `apps/server`, `apps/web` for `middleware` (`.ts/.tsx/.json`) → only unrelated `procedures.ts` uses `o.middleware(...)` (OpenAPI middleware, different symbol). `routes.ts:21` imports `identifyUserFromSession` directly from `evlog/better-auth`.
- **Action**: `git rm`. File was a 3-line re-export shim with zero consumers.

### 2. `packages/api/src/modules/scheduler/index.ts` — DELETED

- **Grep**: `grep -rn "createSchedulerModule|SchedulerModule" --include="*.ts" .` → matches only inside `scheduler/index.ts` itself (type export + factory). No importers anywhere.
- **Verified**: `apps/server/src/scheduler.ts` imports `scheduler.service.ts` and `scheduler/jobs/*.job` directly. No code imports `modules/scheduler` (the facade) at all.
- **Action**: `git rm`.

### 3. `packages/api/src/lib/db-errors.ts` — DELETED

- **Grep**: `grep -rn "db-errors|isUniqueViolation|classifyDbError" packages/api/src --include="*.ts"` → matches only in `db-errors.ts` itself plus `admin-tutor.service.ts:32`, which defines its **own private** `function isUniqueViolation(err)` (a local symbol, does NOT import from `db-errors`). No imports of `db-errors` module exist anywhere in the repo (checked `.`, all `*.ts`).
- **Action**: `git rm`. `admin-tutor.service.ts`'s private helper is independent and unaffected.

### 4. `packages/env/src/server.ts` — MODIFIED (removed `KNOWLEDGE_BANK_URL`, `SENTRY_DSN`, `SENTRY_ENVIRONMENT`)

- **Grep**: `grep -rn "KNOWLEDGE_BANK_URL|SENTRY_DSN|SENTRY_ENVIRONMENT" --include="*.ts" .` → matches only in `server.ts`. Repo-wide grep across ALL file types: remaining hits are in docs/archive (historical) and `.env.example` files (documentation, updated below). `apps/web` has zero references. `infra/.env.prod.example` documents `SENTRY_DSN`/`SENTRY_ENVIRONMENT` but is infrastructure sample config, not a runtime consumer; left untouched (no code reads these vars).
- **Action**: removed all three zod entries from `packages/env/src/server.ts`.
- **`.env.example` sync**:
  - `apps/server/.env.example`: removed `KNOWLEDGE_BANK_URL` line.
  - `.env.example` (root): removed `SENTRY_DSN`/`SENTRY_ENVIRONMENT` commented block and `KNOWLEDGE_BANK_URL`; retitled comment to `# Competition Calendar URL`.

### 5. `packages/api/src/modules/wallet/wallet.service.ts` `reconcile()` — REMOVED

- **Grep**: `grep -rn "\.reconcile(|reconcile(" packages/api/src --include="*.ts"` → callers only in `wallet.service.test.ts:656`. Repo-wide grep (all `.ts/.tsx`): only `wallet.service.ts` (definition + `WalletPort` interface + return object) and the test. Not exposed via `wallet.handler.ts` (checked all handler methods — get/listLedger/listPackages/knowledgeBankEligible/competitionCalendarLink only), nor any router/route.
- **Action**: removed `reconcile` from `WalletPort` interface, deleted the function body, removed it from the returned object, and dropped the now-unused imports (`eq, and, inArray, sum` from `drizzle-orm`; `wallet, ledgerEntry` from `@cogito-app/db/schema`). Removed the `describe("reconcile")` test block from `wallet.service.test.ts`.

### 6. `packages/api/src/modules/notification/notification.service.ts` `dispatchStatus()` — REMOVED

- **Grep**: `grep -rn "dispatchStatus" packages/api/src --include="*.ts"` → only `notification.service.ts` (definition, return type annotation, return object) and `notification.service.test.ts` (method-exposure assertion + 2 tests). Repo-wide grep: no router, no handler, no other module references it. `notification.handler.ts` exposes only list/getUnreadCount/markAsRead/markAllAsRead.
- **Action**: removed `dispatchStatus` from the return type annotation (`InAppNotificationPort` intersection), deleted the function, removed it from the returned object. Removed the 2 `dispatchStatus` test blocks and the `typeof service.dispatchStatus` assertion from `notification.service.test.ts`.
- **Note**: `notification.repo.ts`'s `findDispatch` was NOT touched — it is a public repo method with its own tests in `notification.repo.test.ts` and remains part of the repo's returned object. Only the service-level wrapper was dead.

## Files changed

Deleted:

- `apps/server/src/middleware.ts`
- `packages/api/src/modules/scheduler/index.ts`
- `packages/api/src/lib/db-errors.ts`

Modified:

- `packages/env/src/server.ts`
- `.env.example`
- `apps/server/.env.example`
- `packages/api/src/modules/wallet/wallet.service.ts`
- `packages/api/src/modules/notification/notification.service.ts`
- `packages/api/src/tests/unit/wallet.service.test.ts`
- `packages/api/src/tests/unit/notification.service.test.ts`

## Verification

- `bun run check-types` → PASS (3 tasks successful).
- `bun test --env-file apps/server/.env packages/api/src/tests/` → 1232 pass, 1 skip, 13 fail.
- **Pre-existing failures**: the same 13 integration-test failures reproduce on the unmodified tree (verified via `git stash`): 1235 pass / 13 fail on baseline; test count differs by exactly the 3 tests removed (1249 → 1246). All 13 are the `db.insert is not a function` test-infra issue in `tests/helpers/test-client.ts`, unrelated to this task. One extra `AdminTutor listInvites` failure in the first run was flaky — passes in isolation and on re-run.
- Post-change grep confirms zero remaining references to `reconcile`, `dispatchStatus`, `createSchedulerModule`, `SchedulerModule`, `db-errors`, `KNOWLEDGE_BANK_URL`, `SENTRY_DSN`, `SENTRY_ENVIRONMENT` in any source (non-test, non-doc).

## Concerns

1. 13 pre-existing integration-test failures (`db.insert is not a function` in `test-client.ts`) exist on this branch independent of this task — out of scope for C6, but flagging for PR review.
2. `infra/.env.prod.example` still documents `SENTRY_DSN`/`SENTRY_ENVIRONMENT`; no code reads these vars so this is harmless sample config, left untouched to avoid touching infra files without direction.

## Commit

- `refactor: remove dead code (middleware, scheduler facade, db-errors, unused env, orphan exports)`
