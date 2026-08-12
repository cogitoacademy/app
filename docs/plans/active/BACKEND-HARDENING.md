# Backend Hardening & Plan Reconciliation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

| Field      | Value                                                                  |
| ---------- | ---------------------------------------------------------------------- |
| Status     | Active (planned, not started)                                          |
| Created    | 2026-08-12                                                             |
| Branch     | `main` (5 focused PRs: A–E)                                            |
| Depends on | #28 merged; PR #33 (`f/frontend-promo-flow-light`) NOT required        |
| Scope      | Backend only (`apps/server/` + `packages/api`, `auth`, `db`, `env`)    |

**Goal:** Stabilize CI/deps-bot, fix live backend bugs (scheduler never boots, dead payment rate-limit, G19 pricing), make tests run locally against real Postgres/Redis, remove mock-heavy tautological tests, and reconcile all active plans (DEFERRED-OPS, PRD-GAPS, FRONTEND-GAPS) with verified code state — backend only.

**Architecture:** 5 focused PRs (A–E), each independently testable, all targeting `main`. 4-layer pattern preserved (Router → Handler → Service → Repository). No `shared/ports/`; consumer-driven ports inline. Redis optional with in-memory fallback.

**Tech Stack:** Bun 1.3.14, Turborepo, Elysia, oRPC, Drizzle ORM + postgres.js, BullMQ, Better Auth 1.6.11, bun:test, oxlint/oxfmt.

---

## Global Constraints

- Import from `@cogito-app/...` package paths only; never relative across packages. Modules import siblings via `../../lib`, `../../shared`, `../../procedures`.
- Follow the 4-layer pattern; every new endpoint = router + handler + service + repo + types + errors + `index.ts` `createModule()`.
- `DbOrTx` type from `packages/api/src/lib/tx.ts` — `db` for reads, `tx` inside transactions.
- `DomainError` subclasses mapped in handlers via `withDomainMap()`.
- Bounded Zod schemas: `.max()` on strings/arrays, `.refine()` on dates. No unbounded inputs.
- Optimistic locking (`version` column + `updateWithVersion`) on all versioned tables.
- External calls: `fetchWithTimeout`/`AbortController` + `CircuitBreaker`. No bare awaits on network.
- Redis keys use `cogito:{namespace}:{key}`; every stateful lib accepts optional `redis` and falls back to in-memory.
- No `// TODO(H14)` style markers — resolve them in the task that touches the file.
- Conventional commits: `feat/fix/refactor/docs/test/chore/ci/deps`. Commit after each green step.
- Verify commands: `bun run check-types`, `bun run lint`, `bun test --env-file apps/server/.env packages/api/src/tests/`, `bun run test:coverage`.
- Coverage gates (CI): packages/api ≥90% lines, overall ≥80%.
- **Never edit frontend** (`apps/web`, `packages/ui`). Backend only.
- **Never touch `bun.lock` manually in the same commit as a `package.json` dep change** — this is the deps-bot failure root cause.

---

## Reconciles the other active plans (nothing left stale)

| Active plan | Disposition in this plan |
|---|---|
| **DEFERRED-OPS-TASKS.md** | Fully absorbed: 1.4 → PR C task C3; 1.5 → PR C task C5; 1.7 → PR C task C4; 1.8 → PR B task B2. §2 Redis session caching → **deferred** (tracked, needs separate plan; blocked on real Redis session infra). Items 1.1/1.2/1.3/1.6 already done → marked ✅ in PR E. |
| **PRD-GAPS-SPEC.md** | G1–G18 feature work stays on future `feature/prd-gaps` branch (NOT this plan). This plan only (a) fixes the live **G19 pricing bug** (PR C task C7), (b) fixes the **scheduler-never-boots** defect that G2/G3 depend on (PR C task C1), (c) fixes the dead payment rate-limit (PR C task C2), and (d) updates the spec's stale statuses (PR E task E1, incl. new G20). |
| **FRONTEND-GAPS-SPEC.md** | Out of scope. Only dependency note: PR C task C7 alters `priceSnapshot` jsonb shape (additive fields, changed `tutorShare`/`cogitoTake` semantics) — flag to frontend; existing reads of `perStudent`/`baseline` remain valid. |
| **PR #33 `f/frontend-promo-flow-light`** | Do NOT stack on it. Its 26 backend files (origins.ts, tutorActions.listBookings, createWeeklyAvailability, completeSession end-time check) are **independent additions**; shared files `booking.service.ts`/`booking.router.ts` are touched in different functions. Land PRs A–E on `main`; merge #33 separately. |

---

## PR A — CI / Deps-bot Stabilization

### Task A1: Switch Dependabot to native Bun ecosystem

**Files:**
- Modify: `.github/dependabot.yml`

**Interfaces:**
- Produces: Dependabot writes `bun.lock` correctly on version bumps (the `npm` ecosystem can't).

- [ ] **Step 1:** Edit `.github/dependabot.yml`. In the first `updates` block change `package-ecosystem: "npm"` → `package-ecosystem: "bun"`. Keep `groups` (dev-dependencies/dependencies), `open-pull-requests-limit`, `labels`, `commit-message.prefix: deps` unchanged. The two `docker` and `github-actions` blocks stay as-is.

- [ ] **Step 2:** Verify config parses.

Run: `bunx actionlint .github/dependabot.yml 2>/dev/null || echo "actionlint not installed (optional)"`
Expected: no syntax errors; `bun` is a valid `package-ecosystem` (confirmed in GitHub docs).

- [ ] **Step 3: Commit**

```bash
git add .github/dependabot.yml
git commit -m "ci: use native bun ecosystem in dependabot (writes bun.lock)"
```

### Task A2: Stop auto-merge on failing CI

**Files:**
- Modify: `.github/workflows/auto-merge.yml`

**Interfaces:**
- Produces: Dependabot PRs only merge when CI is green.

- [ ] **Step 1:** Edit `.github/workflows/auto-merge.yml`. Main has **no branch protection** (API returns 404), so add an explicit guard. Remove the `pull_request_review` trigger (it caused merges before CI finished — PRs #29–32 merged red). Set `target: minor` so major bumps need manual review:

```yaml
name: Auto-merge Dependabot
on:
  pull_request:
    types: [opened, synchronize, reopened]
  check_suite:
    types: [completed]

jobs:
  auto-merge:
    runs-on: ubuntu-latest
    if: github.actor == 'dependabot[bot]'
    permissions:
      pull-requests: write
      contents: write
    steps:
      - uses: fastify/github-action-merge-dependabot@v3
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          merge-method: squash
          target: minor
```

- [ ] **Step 2:** Add a comment noting the durable fix: `# Durable gate: enable "Require status checks" branch protection for main with CI required.`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/auto-merge.yml
git commit -m "ci: require green checks before auto-merging dependabot PRs"
```

### Task A3: Pin Bun version in Dockerfile

**Files:**
- Modify: `apps/server/Dockerfile`

**Interfaces:**
- Produces: reproducible `bun install --frozen-lockfile` inside Docker (floating `oven/bun:1` was resolving differently than lockfile).

- [ ] **Step 1:** Edit `apps/server/Dockerfile` lines 1 and 15: `oven/bun:1` → `oven/bun:1.3.14` and `oven/bun:1-slim` → `oven/bun:1.3.14-slim`.

- [ ] **Step 2:** Verify the image tag exists.

Run: `docker manifest inspect oven/bun:1.3.14 >/dev/null && echo OK`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add apps/server/Dockerfile
git commit -m "ci: pin oven/bun to 1.3.14 in Dockerfile (lockfile parity)"
```

### Task A4: Re-sync lockfile (repair drift from #29–#32)

**Files:**
- Modify: `bun.lock` (regenerated, only if drifted)

**Interfaces:**
- Produces: `bun install --frozen-lockfile` passes in CI and Docker; `Deploy Production` stops failing.

- [ ] **Step 1:** Confirm current drift then regenerate.

Run: `git diff --stat bun.lock`
Expected: empty (main already re-synced by `8c00af3`). If drifted, run `bun install` (no `--frozen-lockfile`) and commit `bun.lock` **separately** from any `package.json` change.

- [ ] **Step 2:** Verify frozen install passes.

Run: `bun install --frozen-lockfile`
Expected: exit 0, no "lockfile had changes" error.

- [ ] **Step 3:** (Only if drift existed) commit the lockfile alone:

```bash
git add bun.lock
git commit -m "chore: sync bun.lock"
```

### Task A5: Clean up stale merged branches + worktree

**Files:** git only.

- [ ] **Step 1:** Verify the three branches are merged into main, then delete.

Run: `git branch -r --merged main`
Confirm `improvement/infrastructure`, `improvement/production-readiness`, `improvement/foundation-critical-fixes` appear. (The foundation-critical-fixes extra commits are formatting-only and were squash-merged as #28.)

Run:
```bash
git push origin --delete improvement/infrastructure improvement/production-readiness
git worktree remove .worktrees/foundation-critical-fixes
git branch -D improvement/foundation-critical-fixes
```

- [ ] **Step 2:** Keep `f/frontend-promo-flow-light` (active PR #33).

---

## PR B — Local Dev / Test Parity

### Task B1: Reconcile DB URLs to one default

**Files:**
- Modify: `apps/server/.env`
- Modify: `packages/api/src/tests/test-setup.ts`

**Interfaces:**
- Produces: `docker compose up -d` (in `packages/db`) yields a DB that `.env` and tests both use, so integration tests run locally.

- [ ] **Step 1:** Align the committed `.env` with `.env.example` + `docker-compose.yml` (which already agree on `localhost:6767/cogito-app`).

Edit `apps/server/.env` line 1:
```
DATABASE_URL=postgresql://postgres:password@localhost:5432/cogito-test
```
→
```
DATABASE_URL=postgresql://postgres:password@localhost:6767/cogito-app
```
Verify rest of `.env` matches `.env.example` (PORT 3001, CORS_ORIGIN http://localhost:3000, PAYMENT_PROVIDER=stub, NODE_ENV=development).

- [ ] **Step 2:** Align `test-setup.ts` default so tests can run without a `.env` override.

Edit `packages/api/src/tests/test-setup.ts` line 1:
```
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
```
→
```
process.env.DATABASE_URL ??= "postgresql://postgres:password@localhost:6767/cogito-app";
```

- [ ] **Step 3:** Verify local DB works end to end.

Run:
```bash
bun run db:start
bun run db:migrate
bun test --env-file apps/server/.env packages/api/src/tests/integration/booking-solo.test.ts
```
Expected: integration test passes against local Postgres on 6767.

- [ ] **Step 4: Commit**

```bash
git add apps/server/.env packages/api/src/tests/test-setup.ts
git commit -m "fix(dev): reconcile DB URLs across .env, docker-compose, and test setup"
```

### Task B2: Add test database compose file (DEFERRED-OPS 1.8)

**Files:**
- Create: `docker-compose.test.yml` (repo root)

**Interfaces:**
- Produces: isolated Postgres+Redis for tests, mirrors CI services.

- [ ] **Step 1:** Create `docker-compose.test.yml`:

```yaml
name: cogito-app-test

services:
  postgres:
    image: postgres:16-alpine
    container_name: cogito-app-postgres-test
    environment:
      POSTGRES_DB: cogito-app
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports:
      - "6767:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    container_name: cogito-app-redis-test
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  cogito-app_postgres_data:
```

- [ ] **Step 2:** Add script to `packages/db/package.json` (match existing `db:start` style):
```json
"db:test": "docker compose -f ../../docker-compose.test.yml up -d"
```
Verify: `bun run db:test`.

- [ ] **Step 3: Commit**

```bash
git add docker-compose.test.yml packages/db/package.json
git commit -m "test: add docker-compose.test.yml for local Postgres + Redis"
```

---

## PR C — Correctness Bugs

### Task C1: Wire `initScheduler()` into server startup (CRITICAL)

**Files:**
- Modify: `apps/server/src/index.ts`

**Interfaces:**
- Consumes: `initScheduler` from `./scheduler` (already exported, `apps/server/src/scheduler.ts:11`).
- Produces: BullMQ worker + 3 repeatable jobs (`expire-bookings` 5min, `release-expired-holds` 10min, `send-notification-email` 60s) actually start when `SCHEDULER_ENABLED=true`.

- [ ] **Step 1:** Add import and call.

Edit `apps/server/src/index.ts` line 7:
```ts
import { shutdownScheduler } from "./scheduler";
```
→
```ts
import { initScheduler, shutdownScheduler } from "./scheduler";
```

Edit after `const server = app.listen(...)` (line 62–64), before `gracefulShutdown`:
```ts
await initScheduler();
```

- [ ] **Step 2:** Verify types and that the server boots with scheduler disabled.

Run: `bun run check-types`
Run: `SCHEDULER_ENABLED=false REDIS_URL= bun --env-file apps/server/.env apps/server/src/index.ts 2>&1 | grep scheduler_skip` (with timeout) — or rely on CI.
Expected: log `scheduler_skip` (disabled path) and server starts; no crash.

- [ ] **Step 3:** Verify scheduler path with Redis available locally.

Run (with Redis from Task B2):
```bash
REDIS_URL=redis://localhost:6379 SCHEDULER_ENABLED=true timeout 15 bun --env-file apps/server/.env apps/server/src/index.ts 2>&1 | grep scheduler_initialized
```
Expected: `scheduler_initialized` log; graceful shutdown on timeout/SIGINT.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/index.ts
git commit -m "fix(scheduler): boot BullMQ worker and repeatable jobs on server start"
```

### Task C2: Fix dead payment rate-limit path

**Files:**
- Modify: `apps/server/src/routes.ts:176`
- Create: `apps/server/src/rate-limit.test.ts`

**Interfaces:**
- Consumes: `paymentRateLimit` (already imported at top of `routes.ts`).
- Produces: the 5/min limiter actually applies to `payment.createPurchase`.

- [ ] **Step 1:** Edit `apps/server/src/routes.ts` line 176:
```ts
if (path === "/rpc/payment.createIntent") {
```
→
```ts
if (path === "/rpc/payment.createPurchase") {
```

- [ ] **Step 2:** Add `apps/server/src/rate-limit.test.ts` proving the path constant:

```ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("payment rate limit path", () => {
  test("rate limiter targets payment.createPurchase", () => {
    const routes = readFileSync(
      new URL("./routes.ts", import.meta.url),
      "utf-8",
    );
    expect(routes).toContain('path === "/rpc/payment.createPurchase"');
    expect(routes).not.toContain('path === "/rpc/payment.createIntent"');
  });
});
```

> This avoids spinning up the whole server. The essential check is the path constant matches the registered procedure (`payment.router.ts:7` is `createPurchase`).

- [ ] **Step 3:** Verify test runs.

Run: `bun test --env-file apps/server/.env apps/server/src/rate-limit.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/routes.ts apps/server/src/rate-limit.test.ts
git commit -m "fix(server): point payment rate limiter at payment.createPurchase"
```

### Task C3: Booking repo explicit column lists (DEFERRED-OPS 1.4)

**Files:**
- Modify: `packages/api/src/modules/booking/booking.repo.ts`
- Modify: `packages/api/src/tests/unit/booking.repo.test.ts`

**Interfaces:**
- Consumes: `getTableColumns` from `drizzle-orm` (already used in `achievement.repo.ts`).
- Produces: all `.select()` calls on `booking`/`bookingParticipant` use explicit columns.

- [ ] **Step 1:** Add `getTableColumns` to the `drizzle-orm` import in `booking.repo.ts`. (`getTableColumns` is exported from `drizzle-orm` 0.45.2 — verified in `packages/api/node_modules/drizzle-orm/index.js:13` via `export * from "./utils.js"`. Note: the `achievement.repo.ts` usage exists only on PR #33, not main — do not copy from there.)

- [ ] **Step 2:** Replace `.select()` with explicit columns at lines 34, 84, 112, 119, 251, 295. Pattern:
```ts
.select({ ...getTableColumns(booking) })
```
For `bookingParticipant` queries (lines 84, 112, 119, 251) use `...getTableColumns(bookingParticipant)`; for `findBookingById` (line 34) use `...getTableColumns(booking)`.

> Do **not** use `select()` without a projection anywhere in this file after this task.

- [ ] **Step 3:** Update affected repo tests to assert the returned object has expected column keys (the fake chain returns canned rows; ensure projection includes `id`, `currentState`, `priceSnapshot`, etc. as needed).

- [ ] **Step 4:** Verify.

Run: `bun test --env-file apps/server/.env packages/api/src/tests/unit/booking.repo.test.ts`
Run: `bun run check-types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/modules/booking/booking.repo.ts packages/api/src/tests/unit/booking.repo.test.ts
git commit -m "refactor(booking): explicit column lists in booking repo (DEFERRED-OPS 1.4)"
```

### Task C4: JSDoc on public functions (DEFERRED-OPS 1.7)

**Files:**
- Modify: all `packages/api/src/modules/*/{service,repo,handler,router}.ts` public functions; `apps/server/src/{routes,scheduler}.ts` exported functions.

**Interfaces:**
- Produces: `@param`, `@returns`, `@throws` on all exported functions.

- [ ] **Step 1:** Enumerate public functions (exported from each module index + routers). For each, add JSDoc. Example for `pricing.service.ts` (use the CURRENT 2-arg `computeSplit` signature as it exists at C4 execution time; the signature changes to 3-arg in Task C7 — update this JSDoc again if you write it before C7):

```ts
/**
 * Validates tutor-set prices against the Cogito floor for each group size.
 *
 * @param prices - map of group size (as string) to price in Marks
 * @param modality - online/offline/both (both takes the max floor)
 * @returns an error message string, or null when all prices are valid
 * @throws {never} - returns a string instead of throwing
 */
```

Priority order: `wallet.service.ts`, `booking.service.ts`, `payment.service.ts`, `pricing.service.ts`, `notification.service.ts`, `tutor.service.ts`, `admin-booking.service.ts`, then all `*.repo.ts` public methods.

- [ ] **Step 2:** Verify types + lint.

Run: `bun run check-types`
Run: `bunx oxlint --format=github`
Expected: PASS (JSDoc-only changes).

- [ ] **Step 3: Commit** (one commit per module, or a single docs commit if reviewers prefer)

```bash
git add packages/api/src
git commit -m "docs(api): add JSDoc to public service and repo functions (DEFERRED-OPS 1.7)"
```

### Task C5: Webhook IP allowlisting (DEFERRED-OPS 1.5)

**Files:**
- Modify: `packages/env/src/server.ts`
- Modify: `apps/server/src/webhooks/payments.ts`

**Interfaces:**
- Consumes: new env var `WEBHOOK_ALLOWED_IPS` (optional string, comma-separated IPs).
- Produces: non-production requests to `/webhooks/payments/:provider` from disallowed IPs → 403. Allowlist off by default (empty → allow all; signature verification remains the primary control).

- [ ] **Step 1:** Add env var. Edit `packages/env/src/server.ts`:
```ts
WEBHOOK_ALLOWED_IPS: z.string().optional(),
```

- [ ] **Step 2:** Add helper in `apps/server/src/webhooks/payments.ts`:
```ts
export function ipAllowed(request: Request, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true;
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "";
  return allowlist.some((entry) => entry === ip);
}
```
Wire it at the top of the webhook handler (before idempotency check):
```ts
const allowlist = (env.WEBHOOK_ALLOWED_IPS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (!ipAllowed(request, allowlist)) {
  set.status = 403;
  return { error: "Forbidden" };
}
```
Export `ipAllowed` for testing.

- [ ] **Step 3:** Add tests for the helper in `packages/api/src/tests/unit/webhook-idempotency.test.ts` (or a new `webhook-allowlist.test.ts`): empty allowlist → true; listed IP → true; unlisted IP → false.

- [ ] **Step 4:** Verify.

Run: `bun test --env-file apps/server/.env packages/api/src/tests/unit/`
Run: `bun run check-types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/env/src/server.ts apps/server/src/webhooks/payments.ts
git commit -m "fix(webhooks): add optional IP allowlist for payment webhooks (DEFERRED-OPS 1.5)"
```

### Task C6: Remove dead code

**Files:**
- Delete: `apps/server/src/middleware.ts`
- Delete: `packages/api/src/modules/scheduler/index.ts` facade (only if `createSchedulerModule`/`SchedulerModule` have zero consumers — verified)
- Delete: `packages/api/src/lib/db-errors.ts` (zero imports; `admin-tutor.service.ts` has its own private `isUniqueViolation` copy)
- Modify: `packages/env/src/server.ts` — remove `KNOWLEDGE_BANK_URL`, `SENTRY_DSN`, `SENTRY_ENVIRONMENT` (no consumers)
- Modify: `packages/api/src/modules/wallet/wallet.service.ts:367` — remove `reconcile()` if no caller (only tests call it)
- Modify: `packages/api/src/modules/notification/notification.service.ts:231` — remove `dispatchStatus()` if not exposed (no router)

**Interfaces:**
- Produces: no orphaned files/exports. All deletions must be confirmed grep-empty first.

- [ ] **Step 1:** For each candidate, confirm zero references:
```bash
grep -rn "middleware" apps/server/src --include="*.ts" | grep -v "middleware.ts"
grep -rn "createSchedulerModule\|SchedulerModule" --include="*.ts" . --exclude-dir=node_modules --exclude-dir=dist
grep -rn "db-errors\|isUniqueViolation\|classifyDbError" packages/api/src --include="*.ts"
grep -rn "KNOWLEDGE_BANK_URL\|SENTRY_DSN\|SENTRY_ENVIRONMENT" --include="*.ts" . --exclude-dir=node_modules
grep -rn "\.reconcile(\|reconcile(" packages/api/src --include="*.ts" | grep -v "test"
grep -rn "dispatchStatus" packages/api/src --include="*.ts" | grep -v "test"
```
Expected: matches only in the files being deleted/modified (or test files, which are updated/deleted alongside).

- [ ] **Step 2:** Delete/modify accordingly. If a test only exercises the deleted function (e.g., `reconcile` in `wallet.service.test.ts`), remove that test block.

- [ ] **Step 3:** Verify.

Run: `bun run check-types`
Run: `bun test --env-file apps/server/.env packages/api/src/tests/`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove dead code (middleware, scheduler facade, db-errors, unused env, orphan exports)"
```

### Task C7: G19 — Pricing extra-take rule (PRD FR-05, FR-19, DL-22, TC-06)

**Files:**
- Modify: `packages/api/src/shared/constants.ts` (add baseline tables)
- Modify: `packages/api/src/modules/pricing/pricing.service.ts` (rewrite `computeSplit`)
- Modify: `packages/api/src/modules/booking/index.ts` (`BookingPricingPort`)
- Modify: `packages/api/src/modules/tutor/index.ts` (`TutorPricingPort`)
- Modify: `packages/api/src/modules/booking/booking.service.ts` (3 call sites: 273, 694, 1069 + hold/originalMarks at 327/748/1125/1147)
- Modify: `packages/db/src/schema/booking.ts` (`priceSnapshot` jsonb type: add fields)
- Modify: `packages/api/src/tests/unit/pricing.service.test.ts` (rewrite computeSplit tests vs PRD TC-06)

**Interfaces:**
- Produces:
  - `computeSplit(modality: Modality, tutorPricePerStudent: number, confirmedHeadcount: GroupSize): PriceSnapshot`
  - `PriceSnapshot` extends to: `{ perStudent, baseline, tutorShare, cogitoTake, baselineCogitoTake, baselineTutorShare, extraTotal, cogitoExtraTake, tutorExtraShare }`

**PRD data (source of truth, `docs/prd.tex:768-816`):**

| Modality | Size | Floor/student | Tutor | Cogito |
|---|---|---|---|---|
| online | 1 | 42 | 30 | 12 |
| online | 2 | 35 | 54 | 16 |
| online | 3 | 28 | 64 | 20 |
| online | 4 | 24 | 74 | 22 |
| online | 5 | 21 | 81 | 24 |
| online | 6 | 19 | 88 | 26 |
| offline | 1 | 50 | 35 | 15 |
| offline | 2 | 45 | 70 | 20 |
| offline | 3 | 40 | 95 | 25 |
| offline | 4 | 35 | 115 | 25 |
| offline | 5 | 30 | 120 | 30 |
| offline | 6 | 27 | 127 | 35 |

Rule: `extraTotal = tutorTotal − baselineTotal`; `cogitoExtraTake = floor(extraTotal / 5)`; `tutorExtraShare = extraTotal − cogitoExtraTake`; final Cogito = baseline Cogito + cogitoExtraTake; final tutor = baseline tutor + tutorExtraShare. `EXTRA_TAKE_DIVISOR = 5` already in constants.

- [ ] **Step 1:** Add baseline tables to `packages/api/src/shared/constants.ts`:
```ts
export const ONLINE_BASELINE_SPLIT: Record<number, { tutor: number; cogito: number }> = {
  1: { tutor: 30, cogito: 12 },
  2: { tutor: 54, cogito: 16 },
  3: { tutor: 64, cogito: 20 },
  4: { tutor: 74, cogito: 22 },
  5: { tutor: 81, cogito: 24 },
  6: { tutor: 88, cogito: 26 },
};

export const OFFLINE_BASELINE_SPLIT: Record<number, { tutor: number; cogito: number }> = {
  1: { tutor: 35, cogito: 15 },
  2: { tutor: 70, cogito: 20 },
  3: { tutor: 95, cogito: 25 },
  4: { tutor: 115, cogito: 25 },
  5: { tutor: 120, cogito: 30 },
  6: { tutor: 127, cogito: 35 },
};
```

- [ ] **Step 2:** Rewrite `computeSplit` in `pricing.service.ts`:
```ts
import {
  ONLINE_BASELINE_SPLIT,
  OFFLINE_BASELINE_SPLIT,
  EXTRA_TAKE_DIVISOR,
} from "../../shared/constants";

export interface PriceSnapshot {
  perStudent: number;
  baseline: number;
  tutorShare: number;
  cogitoTake: number;
  baselineCogitoTake: number;
  baselineTutorShare: number;
  extraTotal: number;
  cogitoExtraTake: number;
  tutorExtraShare: number;
}

function getBaselineSplit(modality: Modality, size: GroupSize) {
  const table =
    modality === MODALITY.OFFLINE ? OFFLINE_BASELINE_SPLIT : ONLINE_BASELINE_SPLIT;
  return table[size];
}

function computeSplit(
  modality: Modality,
  tutorPricePerStudent: number,
  confirmedHeadcount: GroupSize,
): PriceSnapshot {
  const perStudent = Math.floor(tutorPricePerStudent);
  const tutorTotal = perStudent * confirmedHeadcount;
  const baseline = getBaselineSplit(modality, confirmedHeadcount);
  const baselineTotal = baseline.tutor + baseline.cogito;
  const extraTotal = tutorTotal - baselineTotal;
  const cogitoExtraTake =
    extraTotal > 0 ? Math.floor(extraTotal / EXTRA_TAKE_DIVISOR) : 0;
  const tutorExtraShare = extraTotal - cogitoExtraTake;

  const baselineCogitoTake = baseline.cogito;
  const baselineTutorShare = baseline.tutor;
  const cogitoTake = baselineCogitoTake + cogitoExtraTake;
  const tutorShare = baselineTutorShare + tutorExtraShare;

  return {
    perStudent,
    baseline: baselineTotal,
    tutorShare,
    cogitoTake,
    baselineCogitoTake,
    baselineTutorShare,
    extraTotal,
    cogitoExtraTake,
    tutorExtraShare,
  };
}
```

Update `PricingPort`:
```ts
export interface PricingPort {
  validatePrices(prices: Record<string, number>, modality: Modality): string | null;
  computeSplit(
    modality: Modality,
    tutorPricePerStudent: number,
    confirmedHeadcount: GroupSize,
  ): PriceSnapshot;
}
```

> `COGITO_TAKE_RATE` is no longer used by `computeSplit`; remove it from the import. Do **not** delete the constant (used by G16/payout later); keep it in constants.

- [ ] **Step 3:** Update ports in `booking/index.ts` and `tutor/index.ts` to the new signature:
```ts
computeSplit(
  modality: Modality,
  tutorPricePerStudent: number,
  confirmedHeadcount: GroupSize,
): PriceSnapshot;
```
(both `booking/index.ts:32` and `tutor/index.ts:21`).

- [ ] **Step 4:** Update the 3 call sites in `booking.service.ts`:

Solo (line 273):
```ts
const priceSnapshot = pricing.computeSplit(
  modality,
  (profile.prices?.["1"] ?? DEFAULT_SOLO_PRICE) as number,
  1,
);
```
Group (line 694):
```ts
const priceSnapshot = pricing.computeSplit(
  modality,
  (profile.prices?.[String(size)] ?? DEFAULT_SOLO_PRICE) as number,
  size as 1 | 2 | 3 | 4 | 5 | 6,
);
```
Series (line 1069):
```ts
const priceSnapshot = pricing.computeSplit(modality, pricePerStudent, 1);
```

> `modality` is already in scope in each function. **Hold/originalMarks decision:** `originalMarks`/`holdAmount` must equal the actual charge `tutorTotal` (`priceSnapshot.perStudent × headcount`), NOT `baseline`. Update lines 327/748/1125/1147: set `originalMarks: priceSnapshot.perStudent * headcount` and `holdAmount: <same>`. Solo headcount 1; group uses `size`; series per-session = `perStudent`.

- [ ] **Step 5:** Extend the DB schema type for `priceSnapshot` (`packages/db/src/schema/booking.ts:68` and `:258`):
```ts
priceSnapshot: jsonb("price_snapshot").$type<{
  perStudent: number;
  baseline: number;
  tutorShare: number;
  cogitoTake: number;
  baselineCogitoTake: number;
  baselineTutorShare: number;
  extraTotal: number;
  cogitoExtraTake: number;
  tutorExtraShare: number;
}>(),
```
> jsonb is schemaless in Postgres — no migration needed. Verify with `bun run db:generate` (should produce no new migration).

- [ ] **Step 6:** Rewrite `computeSplit` tests vs PRD TC-06 in `pricing.service.test.ts`:
```ts
describe("computeSplit (extra-take rule)", () => {
  const pricing = createPricingService();

  test("online class for 1 at floor (42) → tutor 30, Cogito 12", () => {
    const r = pricing.computeSplit("online", 42, 1);
    expect(r.tutorShare).toBe(30);
    expect(r.cogitoTake).toBe(12);
    expect(r.extraTotal).toBe(0);
    expect(r.cogitoExtraTake).toBe(0);
  });

  test("online class for 1 at 50 → tutor 37, Cogito 13 (extra 8, Cogito extra 1)", () => {
    const r = pricing.computeSplit("online", 50, 1);
    expect(r.extraTotal).toBe(8);
    expect(r.cogitoExtraTake).toBe(1);
    expect(r.tutorExtraShare).toBe(7);
    expect(r.tutorShare).toBe(37);
    expect(r.cogitoTake).toBe(13);
  });

  test("online class for 3 at floor (28) → tutor 64, Cogito 20", () => {
    const r = pricing.computeSplit("online", 28, 3);
    expect(r.tutorShare).toBe(64);
    expect(r.cogitoTake).toBe(20);
  });

  test("online class for 3 at 32 → tutor 74, Cogito 22 (extra 12, Cogito extra 2)", () => {
    const r = pricing.computeSplit("online", 32, 3);
    expect(r.extraTotal).toBe(12);
    expect(r.cogitoExtraTake).toBe(2);
    expect(r.tutorShare).toBe(74);
    expect(r.cogitoTake).toBe(22);
  });

  test("offline class for 2 at floor (45) → tutor 70, Cogito 20", () => {
    const r = pricing.computeSplit("offline", 45, 2);
    expect(r.tutorShare).toBe(70);
    expect(r.cogitoTake).toBe(20);
  });

  test("extra total of 4 → Cogito extra 0, all to tutor", () => {
    const r = pricing.computeSplit("online", 46, 1); // baseline 42, extra 4
    expect(r.cogitoExtraTake).toBe(0);
    expect(r.tutorShare).toBe(34);
  });

  test("extra total of 5 → Cogito extra 1, 4 to tutor", () => {
    const r = pricing.computeSplit("online", 47, 1); // baseline 42, extra 5
    expect(r.cogitoExtraTake).toBe(1);
    expect(r.tutorShare).toBe(36);
  });
});
```

- [ ] **Step 7:** Update mock-based tests that stub `computeSplit(totalMarks, groupSize)` — search `packages/api/src/tests` for `computeSplit` mocks (`booking.service.test.ts`, `tutor.service.test.ts`) and update to the 3-arg signature.

- [ ] **Step 8:** Verify.

Run: `bun test --env-file apps/server/.env packages/api/src/tests/unit/pricing.service.test.ts packages/api/src/tests/unit/booking.service.test.ts`
Run: `bun run check-types`
Run: `bun run test:coverage`
Expected: PASS; coverage gates hold (add tests if coverage drops).

- [ ] **Step 9: Commit**

```bash
git add packages/api/src packages/db/src/schema/booking.ts
git commit -m "fix(pricing): implement PRD extra-take split rule (G19)"
```

---

## PR D — Test Realignment (mock-heavy remediation)

### Task D1: Real-DB wallet + booking repo tests

**Files:**
- Create: `packages/api/src/tests/integration/repo-wallet.test.ts`
- Create: `packages/api/src/tests/integration/repo-booking.test.ts`

**Interfaces:**
- Consumes: real `db` from `@cogito-app/db`, `resetDatabase()` from `helpers/test-client.ts`, `factories.ts`.
- Produces: repo-layer tests that run real SQL against Postgres (replacing fake query-chain assertions).

- [ ] **Step 1:** Study existing integration harness (`packages/api/src/tests/integration/wallet-ledger.test.ts`, `helpers/test-client.ts:80-85`). Follow the same `beforeAll` reset + `createTestClient` pattern.

- [ ] **Step 2:** `repo-wallet.test.ts` — test `createWalletRepo(realDb)`:
- `getOrCreate` inserts a wallet row with total=0, held=0, available=0.
- `atomicHold` increases held + total; `atomicRelease` decreases held + available; `atomicDeduct` decreases available + total.
- Balance guard: attempting to deduct more than available throws / returns an error (assert real DB behavior).
- Ledger: `insertLedgerEntry` + duplicate `eventKey`/`sourceReference` violates the `ledger_walletId_eventKey_sourceReference_uniq` constraint (assert the unique violation error).

- [ ] **Step 3:** `repo-booking.test.ts` — test `createBookingRepo(realDb)`:
- `insertBooking` + `findBookingById` round-trip with all explicit columns.
- `updateBookingVersioned` optimistic lock: update with wrong `version` → throws; correct version → updates and bumps version.
- `findOverlappingBookings` returns overlap for the composite-indexed time range; returns none for non-overlapping.
- `listBookingsByProposer` cursor pagination: page 1 + page 2 via `nextCursor` return disjoint sets (exercises `gt(booking.id, cursor)` SQL).

- [ ] **Step 4:** Verify.

Run: `bun test --env-file apps/server/.env packages/api/src/tests/integration/repo-wallet.test.ts packages/api/src/tests/integration/repo-booking.test.ts`
Expected: PASS against real Postgres.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/tests/integration/repo-wallet.test.ts packages/api/src/tests/integration/repo-booking.test.ts
git commit -m "test: real-DB repo tests for wallet and booking"
```

### Task D2: Real-Redis integration tests

**Files:**
- Create: `packages/api/src/tests/integration/redis-real.test.ts`

**Interfaces:**
- Consumes: `REDIS_URL` from env; `IdempotencyStore`, `rateLimit`, `CircuitBreaker` from `packages/api/src/lib`.
- Produces: distributed-atomicity verification against real Redis (CI provisions redis; local via Task B2).

- [ ] **Step 1:** Skip if `REDIS_URL` unset:
```ts
const hasRedis = !!process.env.REDIS_URL;
const maybe = hasRedis ? describe : describe.skip;
```

- [ ] **Step 2:** Write tests:
- `IdempotencyStore.getOrSet`: two concurrent calls with the same key execute the factory once (track call count).
- `rateLimit`: exceed threshold → `allowed:false`, `retryAfterMs > 0`; reset after TTL.
- `CircuitBreaker`: after N failures → opens; cooldown then half-open; recovery on success.

Use real `initRedis(process.env.REDIS_URL)`; clean keys between tests (unique keys or prefix-scoped `flushdb`). Add `afterAll(() => redis.quit())`.

- [ ] **Step 3:** Verify with local Redis.

Run:
```bash
docker compose -f docker-compose.test.yml up -d
REDIS_URL=redis://localhost:6379 bun test --env-file apps/server/.env packages/api/src/tests/integration/redis-real.test.ts
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/tests/integration/redis-real.test.ts
git commit -m "test: real-Redis integration tests for idempotency, rate limit, circuit breaker"
```

### Task D3: Scheduler job integration tests

**Files:**
- Create: `packages/api/src/tests/integration/scheduler-expiry.test.ts`
- Create: `packages/api/src/tests/integration/scheduler-holds.test.ts`

**Interfaces:**
- Consumes: `services.booking.expireBookings()`, `services.booking.releaseExpiredHolds()`, `factories.ts` booking/wallet factories, real DB.
- Produces: the two highest-risk untested paths are covered end-to-end.

- [ ] **Step 1:** `scheduler-expiry.test.ts`:
- Insert a booking in `pending_confirmed` with `deadlineAt` in the past + hold in wallet.
- Call `await services.booking.expireBookings()`.
- Assert: booking `currentState === "expired"`, wallet hold released (held decreased, available restored), ledger `release` entry exists, notification row created for the affected user.

- [ ] **Step 2:** `scheduler-holds.test.ts`:
- Insert a booking with a hold that has exceeded its window (use `RESPONSE_WINDOW_MS` semantics).
- Call `await services.booking.releaseExpiredHolds()`.
- Assert holds released and ledger entries recorded.

> These mirror N1/N3 bug fixes (the exact paths that were historically broken) — the most valuable missing tests. If `expireBookings` requires `SCHEDULER_ENABLED`, call the service method directly (it doesn't depend on BullMQ).

- [ ] **Step 3:** Verify.

Run: `bun test --env-file apps/server/.env packages/api/src/tests/integration/scheduler-expiry.test.ts packages/api/src/tests/integration/scheduler-holds.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/tests/integration/scheduler-expiry.test.ts packages/api/src/tests/integration/scheduler-holds.test.ts
git commit -m "test: scheduler expiry and hold-release integration tests"
```

### Task D4: Broaden integration coverage (room, refund, achievement, admin-override)

**Files:**
- Create: `packages/api/src/tests/integration/room-flow.test.ts`
- Create: `packages/api/src/tests/integration/refund-flow.test.ts`
- Create: `packages/api/src/tests/integration/achievement-flow.test.ts`
- Modify: `packages/api/src/tests/integration/admin-override.test.ts` (add happy path)

**Interfaces:**
- Consumes: `createTestClient`, `factories.ts`, real DB.
- Produces: happy-path integration coverage for the 4 modules currently mock-only.

- [ ] **Step 1:** `room-flow.test.ts` — admin `room.assign` happy path: assign a room to a booking → `roomBooking` row with status `confirmed`; conflicting assign to overlapping slot → error.

- [ ] **Step 2:** `refund-flow.test.ts` — `adminRefund`/`refund.createCorrection` happy path: create a paid booking, issue a correction, assert wallet `compensate_credit`/refundRecord rows + ledger entries.

- [ ] **Step 3:** `achievement-flow.test.ts` — student `achievement.create` → row `pending`; admin `adminReview` approve → `approved` + notification; reject path.

- [ ] **Step 4:** `admin-override.test.ts` — add happy path: apply override on a real booking, assert booking state change + `bookingStateHistory` row + wallet impact (uses real DB).

- [ ] **Step 5:** Verify all integration tests pass against real DB.

Run: `bun test --env-file apps/server/.env packages/api/src/tests/integration/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/tests/integration/
git commit -m "test: add room, refund, achievement, and admin-override happy-path integration tests"
```

---

## PR E — Spec / Docs Sync

### Task E1: Update PRD-GAPS-SPEC.md to verified state

**Files:**
- Modify: `docs/plans/active/PRD-GAPS-SPEC.md`

**Interfaces:**
- Produces: spec reflects reality; adds G20 (scheduler-never-boots); fixes stale statuses.

- [ ] **Step 1:** Apply these edits:
- **G2:** Change "Current state" to note the repeatable 5-min job is now wired on main (was "not running"). Add acceptance sub-item "Notification on expiry" as the remaining gap.
- **G5:** Note H-2 window IS enforced on whole-booking cancel; real gap is per-session `cancelSession`.
- **G8:** Change "null cursor (N9)" to "pagination fixed by PR #28 (`admin-booking.repo.ts:31-33`); urgency sorting + SLA + filters still missing."
- **G11:** Change "current state" claim — link is created only on tutor accept (not at confirmation); gating largely satisfied by state machine; explicit placeholder UX is the remaining gap.
- **G14:** Note `room.assign` exists (approve-equivalent); relocate/cancel missing.
- **G7:** Fix "no `_sessionNote` column" claim → "dead `sessionNote` input on `completeSessionInput` (`booking.types.ts:107`) that the handler never passes to the service (`booking.handler.ts:300-315` calls `booking.completeSession(input.bookingId, ...)` only)."
- **Add G20:** Scheduler never boots — `initScheduler()` defined but never called in `apps/server/src/index.ts`. Status: Fixed by PR C task C1. Depends: G2/G3 need scheduler running.
- **Version notes:** add v1.3 (2026-08-12) entry.

- [ ] **Step 2:** Keep G1–G18 statuses as "not implemented" except where PR C changed them (G19 → implemented after PR C; mark with note).

- [ ] **Step 3: Commit**

```bash
git add docs/plans/active/PRD-GAPS-SPEC.md
git commit -m "docs(plans): sync PRD-GAPS-SPEC with verified code state; add G20 scheduler boot"
```

### Task E2: Update CONTEXT.md and DEFERRED-OPS-TASKS.md

**Files:**
- Modify: `docs/CONTEXT.md`
- Modify: `docs/plans/active/DEFERRED-OPS-TASKS.md`

- [ ] **Step 1:** `CONTEXT.md` edits:
- Remove/repair the stale "N9 NOT fully fixed" paragraph (now fixed).
- Update K3 note: all 3 jobs have `attempts:3` + exponential backoff (no DLQ).
- Add scheduler-boots note to CI/CD/Deployment section: `SCHEDULER_ENABLED=true` + `REDIS_URL` required.
- Update plans table status for DEFERRED-OPS (1.4/1.5/1.7/1.8 → done in these PRs).

- [ ] **Step 2:** `DEFERRED-OPS-TASKS.md`: mark 1.4, 1.5, 1.7, 1.8 ✅ with PR references; move §2 Redis session caching to "Deferred / needs separate plan" note.

- [ ] **Step 3: Commit**

```bash
git add docs/CONTEXT.md docs/plans/active/DEFERRED-OPS-TASKS.md
git commit -m "docs: sync CONTEXT and DEFERRED-OPS with backend hardening PRs"
```

---

## Roadmap (execution order + concern mapping)

| Step | PR | Branches | Blocks | Concern addressed |
|---|---|---|---|---|
| 1 | A | `ci/backend-hardening` | B–E | Deps-bot failing, lockfile drift, deploy failure, branch/planning clash |
| 2 | B | `fix/local-test-parity` | C (local verify), D | No server / can't test locally |
| 3 | C | `fix/backend-correctness` | D, E | Scheduler dead, G19 pricing, dead rate-limit, dead code, DEFERRED-OPS 1.4/1.5/1.7 |
| 4 | E | `docs/plan-sync` | (docs only) | Code vs PRD/CONTEXT not in sync |
| 5 | D | `test/backend-realignment` | (last, depends on C) | Tests mock too much, real coverage gaps |

**Sequencing rationale:**
- A first — unblocks CI so every subsequent PR is actually verifiable on GitHub.
- B next — PR C's scheduler + PR D's tests need local Postgres/Redis to run outside CI.
- C before D — D's scheduler tests exercise the now-booted code; D's repo tests assert the explicit columns from C3.
- E before D or after — E is docs-only; do it after C so the spec reflects the fixed scheduler/pricing. (D can run in parallel with E.)
- D last — depends on C's pricing/scheduler changes and needs the real-DB/Redis harness from B.

**Per-PR gates (run before merge):**
1. `bun run check-types`
2. `bun run lint`
3. `bun run test:coverage` (or the CI test job with Postgres+Redis services)
4. `git log --oneline main..HEAD` — each commit is conventional and self-contained.

**Gap-check vs all active plans (nothing left behind):**

| Plan | Item | Where handled |
|---|---|---|
| DEFERRED-OPS | 1.1 ✅, 1.2 ✅, 1.3 ✅, 1.6 ✅ | already done (marked in E2) |
| DEFERRED-OPS | 1.4 explicit cols | C3 |
| DEFERRED-OPS | 1.5 webhook IP allowlist | C5 |
| DEFERRED-OPS | 1.7 JSDoc | C4 |
| DEFERRED-OPS | 1.8 docker-compose.test | B2 |
| DEFERRED-OPS | §2 Redis session caching | **deferred** — tracked in DEFERRED-OPS as needs-separate-plan; blocked on session store design + real Redis ops |
| DEFERRED-OPS | §3 manual verification | requires running env — after B, partially doable; production items stay deferred |
| DEFERRED-OPS | §4 production ops | requires live VPS/Coolify — deferred |
| PRD-GAPS | G19 | C7 |
| PRD-GAPS | G2/G3 scheduler dep | C1 (scheduler boots) + E1 status |
| PRD-GAPS | G1–G18 features | deferred to `feature/prd-gaps` (not this plan) |
| PRD-GAPS | stale claims (G5/G8/G11/G14/G7) | E1 |
| FRONTEND-GAPS | F1–F17 | out of scope; E1 documents backend API surface changes for F-gaps |
| PR #33 | 26 backend files | independent; land separately, do not stack |

---

## Execution Notes

- **PR #33:** do not base work on it; its 26 backend files are additive. After it merges, re-run `bun run check-types` on main before starting PR D.
- **G19 frontend dependency:** after PR C, the `priceSnapshot` jsonb gains new fields — additive, so existing web code that reads `perStudent`/`baseline` still works. Flag to frontend that `tutorShare`/`cogitoTake` semantics changed (baseline vs extra-take).
- **Verification before every PR merge:** `bun run check-types`, `bun run lint`, `bun run test:coverage`, and the CI workflow (Postgres+Redis services).
- **Deferred (tracked, not in this plan):** Redis session caching (DEFERRED-OPS §2), all G1–G18 feature gaps (feature/prd-gaps), FRONTEND-GAPS F1–F17, production ops §4, manual verification §3 (partially after B).

---

### Version Notes

- v1.0 (2026-08-12): Created from full backend audit (deps-bot, branches, local-test parity, test-mocking, PRD sync). Reconciles DEFERRED-OPS (1.4/1.5/1.7/1.8), fixes G19 + scheduler-boots + payment rate-limit, realigns test suite, syncs PRD-GAPS/CONTEXT. 5 PRs A–E.
