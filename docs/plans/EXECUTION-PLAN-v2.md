# Cogito Backend — Execution Plan v2

**Status:** Active — supersedes `docs/planning-phase-0-backend-mvp/PLAN.md` for execution
**Date:** 2026-06-27
**Source of truth:** `docs/prd.tex` (v1.4), `docs/planning-phase-0-backend-mvp/PLAN.md` (design reference)
**Scope:** Production-grade backend MVP satisfying PRD FR-01..FR-24

This document is the **active execution plan**. The original PLAN.md remains as the design reference (schema, API design, edge cases, decision log D-01..D-30). This document defines the execution phases, architecture patterns, and step-by-step work items.

---

## Table of Contents

1. [Phase Structure](#1-phase-structure)
2. [Architecture: 5-Layer Pattern](#2-architecture-5-layer-pattern)
3. [Phase A: Architecture & Infrastructure](#3-phase-a-architecture--infrastructure)
4. [Phase B: Feature Implementation + Testing](#4-phase-b-feature-implementation--testing)
5. [Phase C: Polish & Production Readiness](#5-phase-c-polish--production-readiness)
6. [Phase D: Staging Deploy + Validation](#6-phase-d-staging-deploy--validation)
7. [Phase E: Production Deploy](#7-phase-e-production-deploy)
8. [Architecture Decisions](#8-architecture-decisions)

---

## 1. Phase Structure

```
Phase A: Architecture & Infrastructure     ← fix CI, remove dead code, 5-layer refactor, cleanup
Phase B: Feature Implementation + Testing  ← Phases 1-5 from PLAN.md, tests written alongside
Phase C: Polish & Production Readiness     ← Dockerfiles, CD pipeline, rate limiting, monitoring
Phase D: Staging Deploy + Validation       ← deploy to staging, smoke tests, manual QA
Phase E: Production Deploy                  ← tag release, migrate, deploy, monitor
```

**Testing is integrated per-feature in Phase B, not a separate phase.** Every feature ships with unit tests (for pure services) and integration tests (for handlers/repos).

### Completed Work (Prior to v2)

| Phase     | What                                                                                                 | Commit    |
| --------- | ---------------------------------------------------------------------------------------------------- | --------- |
| Phase 0   | Schema integrity fixes, CHECK constraints, migrations, lib/ports/events skeleton                     | `2152367` |
| Phase 0.5 | Module refactoring: 10 domain modules, functional factory services, port DI, server split, `/health` | `2152367` |
| Phase 0.6 | GitHub Actions CI, Lefthook, coverage, Dependabot, test refactoring (createRouterClient)             | `bb030e7` |

**Known issues from Phase 0.6:**

- CI fails: `tsdown` and `drizzle-kit` not in `bun.lock` (lockfile out of sync)
- CI fails: coverage threshold 50% too high (actual ~15%)
- CI fails: `bunfig.toml` `coverage = false` conflicts with `--coverage` flag
- Dependabot fails: `package-ecosystem: "bun"` is invalid (should be `"npm"`)
- Dead code: 5 unused ports, dead event bus, 2 dead lib files
- Dead deps: `"api"` package, `@sinclair/typebox`, unnecessary deps in API package
- Inconsistencies: `achievement.service.ts` uses `new ORPCError()` instead of helper, duplicate `INVITE_EXPIRY_DAYS`, no `user.role` CHECK, no graceful shutdown

---

## 2. Architecture: 5-Layer Pattern

All modules follow the 5-layer pattern. Each layer has a single responsibility.

### Layer Responsibilities

| Layer          | Responsibility                                                               | DB access?     | Business rules? | Side effects?   | File                          |
| -------------- | ---------------------------------------------------------------------------- | -------------- | --------------- | --------------- | ----------------------------- |
| **Router**     | oRPC route definition, zod validation, auth middleware                       | No             | No              | No              | `{module}.router.ts`          |
| **Handler**    | Orchestration: call repo + service + ports, manage transactions, return DTOs | No (delegates) | No (delegates)  | Yes (tx, audit) | `{module}.handler.ts`         |
| **Service**    | Pure business logic: validation, state transitions, pricing math             | No             | Yes             | No              | `{module}.service.ts`         |
| **Repository** | Data access: SELECT, INSERT, UPDATE, DELETE                                  | Yes            | No              | No              | `{module}.repo.ts`            |
| **Port**       | Cross-module interface (DI boundary)                                         | No             | No              | No              | `shared/ports/{name}.port.ts` |

### Request Flow

```
HTTP POST /rpc/admin.setRole
  → Elysia: evlog + cors + identifyUser
  → oRPC: createContext → { session, services }
  → Router: adminProcedure middleware (auth check)
  → Router: .handler(async ({ context, input }) => {
      return context.services.admin.setRole(context.session.user.id, input);
    })
  → Handler: setRole(adminId, input)
      1. const target = await adminRepo.getById(db, input.userId)     ← repo (DB read)
      2. const decision = adminService.validateRoleChange(target, input.role)  ← service (pure)
      3. if (!decision.ok) throw decision.error                        ← handler (control flow)
      4. return db.transaction(async (tx) => {                        ← handler (tx management)
           const updated = await adminRepo.updateRole(tx, input.userId, input.role)  ← repo (DB write)
           await auditPort.record({ db: tx, ... })                    ← port (side effect)
           return updated
         })
  → JSON response
```

### Module File Structure

Every module with HTTP endpoints has 5 files:

```
modules/{module}/
  {module}.router.ts     ← oRPC route definitions (thin)
  {module}.handler.ts     ← orchestration (calls repo + service + ports)
  {module}.service.ts     ← pure business logic (no DB, no I/O)
  {module}.repo.ts        ← data access (SQL queries only)
  {module}.types.ts       ← zod input/output schemas
```

Modules that are port implementations only (no HTTP) have 3 files:

```
modules/{module}/
  {module}.handler.ts     ← orchestration (implements the port interface)
  {module}.service.ts     ← pure business logic (validation, calculations)
  {module}.repo.ts        ← data access
```

### Composition Root

```ts
// services.ts
const auditRepo = createAuditRepo(db);
const auditService = createAuditService();
const auditPort = createAuditHandler({ auditRepo, auditService });

const walletRepo = createWalletRepo(db);
const walletService = createWalletService();
const walletPort = createWalletHandler({ walletRepo, walletService });

const pricingPort = createPricingService(); // pure, no repo needed

const authRepo = createAuthRepo(db);
const authHandler = createAuthHandler({ authRepo, walletPort });

const adminRepo = createAdminRepo(db);
const adminHandler = createAdminHandler({ adminRepo, auditPort });

// ... etc

export const services = { audit: auditPort, wallet: walletPort, pricing: pricingPort, auth: authHandler, ... };
```

### Testing Strategy

| Layer       | Test type                                   | Needs DB? | Example                                                       |
| ----------- | ------------------------------------------- | --------- | ------------------------------------------------------------- |
| **Service** | Unit test (pure functions)                  | No        | `expect(canSubmitForReview(profile).ok).toBe(false)`          |
| **Repo**    | Integration test                            | Yes       | `expect(await repo.getById(db, userId)).toBeDefined()`        |
| **Handler** | Integration test (via `createRouterClient`) | Yes       | `await expect(client.admin.setRole({...})).rejects.toThrow()` |
| **Router**  | Covered by handler tests                    | Yes       | Same as handler — the router delegates to handler             |

---

## 3. Phase A: Architecture & Infrastructure

**Goal:** Fix CI, remove dead code, refactor to 5-layer, clean up inconsistencies.

### A.1: Fix CI Failures

| Step | What                                                                                    | File                                  |
| ---- | --------------------------------------------------------------------------------------- | ------------------------------------- |
| 1    | Run `bun install` to sync `bun.lock` (installs `tsdown`, `drizzle-kit`)                 | `bun.lock`                            |
| 2    | Fix Dependabot: `"bun"` → `"npm"`                                                       | `.github/dependabot.yml`              |
| 3    | Coverage threshold: 50% → 10%                                                           | `bunfig.toml`                         |
| 4    | Remove `coverage = false` line (let `--coverage` CLI flag control)                      | `bunfig.toml`                         |
| 5    | Fix coverage script: remove hardcoded macOS path                                        | `.github/scripts/coverage-comment.ts` |
| 6    | Fix CI cache: remove `node_modules` from cache (only `~/.bun/install/cache` + `.turbo`) | `.github/workflows/ci.yml`            |
| 7    | Remove `privateData` endpoint from `routers.ts`                                         | `packages/api/src/routers.ts`         |

### A.2: Remove Dead Code

| Step | What                                                                                                         | Files deleted                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| 8    | Remove 5 dead ports: `payment`, `room`, `support`, `notification`, `meeting`                                 | `shared/ports/{payment,room,support,notification,meeting}.port.ts` |
| 9    | Remove dead event bus: `bus.ts`, `types.ts`                                                                  | `shared/events/bus.ts`, `shared/events/types.ts`                   |
| 10   | Remove dead lib: `time.ts`, `money.ts`                                                                       | `lib/time.ts`, `lib/money.ts`                                      |
| 11   | Remove `nanoevents` from root `package.json` deps                                                            | `package.json`                                                     |
| 12   | Remove `"api": "^6.1.3"` from root `package.json` deps                                                       | `package.json`                                                     |
| 13   | Remove unused `getAuditLogsForTarget()` from test factories                                                  | `tests/helpers/factories.ts`                                       |
| 14   | Clean API package deps: remove `@orpc/client`, `@orpc/openapi`, `@orpc/zod`, `@types/pg`, `dotenv`, `elysia` | `packages/api/package.json`                                        |
| 15   | Remove `@sinclair/typebox` from server deps                                                                  | `apps/server/package.json`                                         |

### A.3: Refactor All 10 Modules to 5-Layer

One atomic commit. For each of the 10 modules:

1. Extract SQL queries from service → new `{module}.repo.ts`
2. Extract pure business logic → keep in `{module}.service.ts` (now DB-free)
3. Create `{module}.handler.ts` — orchestration that calls repo + service + ports
4. Update `{module}.router.ts` — calls `context.services.{module}.{method}()`
5. Update `services.ts` — wire repos + services into handlers

**Module refactoring list:**

| Module            | New files                                       | Key changes                                                                                                                                                                                                                       |
| ----------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth`            | `auth.repo.ts`, `auth.handler.ts`               | Repo: getStudentProfile, getTutorProfile, upsertProfile. Handler: me(), getProfile(), updateProfile(). Service: validateUpdateInput().                                                                                            |
| `admin`           | `admin.repo.ts`, `admin.handler.ts`             | Repo: listUsers, getById, updateRole, countAdmins. Handler: setRole() with tx + audit. Service: validateRoleChange() (last-admin guard).                                                                                          |
| `admin-tutor`     | `admin-tutor.repo.ts`, `admin-tutor.handler.ts` | Repo: insertInvite, getInviteById, updateInvite, listInvites, getTutorProfileById, updateTutorProfile, listTutorProfiles. Handler: createInvite, resendInvite, revokeInvite, reviewTutorProfile. Service: validateReviewAction(). |
| `tutor`           | `tutor.repo.ts`, `tutor.handler.ts`             | Repo: getByUserId, updateProfile, updateStatus. Handler: getMyProfile, updateMyProfile, submitForReview. Service: validateSubmitForReview(), validatePrices() (delegates to pricing port).                                        |
| `tutor-discovery` | `discovery.repo.ts`, `discovery.handler.ts`     | Repo: listPublished (SQL filtering), getProfile. Handler: listPublished(), getProfile(). Service: buildDiscoveryProjection().                                                                                                     |
| `invite`          | `invite.repo.ts`, `invite.handler.ts`           | Repo: findInviteByToken, updateInviteStatus, insertTutorProfile, updateUserRole. Handler: verify(), claim() (tx + audit). Service: validateClaim().                                                                               |
| `achievement`     | `achievement.repo.ts`, `achievement.handler.ts` | Repo: list, insert, update, delete, adminList, getById. Handler: create, update, remove, adminReview. Service: validateUpdate(), validateDelete(). Fix `new ORPCError()` → `badRequest()`.                                        |
| `wallet`          | `wallet.repo.ts`, `wallet.handler.ts`           | Repo: getById, getByUserId, insert, updateBalances, insertLedger. Handler: hold, release, deduct, credit, compensate, getOrCreate. Service: validateHold(), validateDeduct(). Implements `WalletPort`.                            |
| `pricing`         | (no change — already pure)                      | `pricing.service.ts` stays as-is. No repo, no handler. Implements `PricingPort`.                                                                                                                                                  |
| `audit`           | `audit.repo.ts`, `audit.handler.ts`             | Repo: insertAuditLog. Handler: record(). Service: (thin — just passes through). Implements `AuditPort`.                                                                                                                           |

### A.4: Add `user.role` CHECK Constraint

| Step | What                                                                | File                             |
| ---- | ------------------------------------------------------------------- | -------------------------------- |
| 16   | Add `CHECK (role IN ('student', 'tutor', 'admin'))` to `user` table | `packages/db/src/schema/auth.ts` |
| 17   | Generate + apply migration `0001`                                   | `packages/db/src/migrations/`    |

### A.5: Consistency Fixes

| Step | What                                                                                 | File                                   |
| ---- | ------------------------------------------------------------------------------------ | -------------------------------------- |
| 18   | Extract `INVITE_EXPIRY_DAYS = 7` to shared constant                                  | `packages/api/src/shared/constants.ts` |
| 19   | Add graceful shutdown (SIGTERM/SIGINT handler + DB pool drain)                       | `apps/server/src/index.ts`             |
| 20   | Fix dynamic imports in `/health` → top-level imports                                 | `apps/server/src/routes.ts`            |
| 21   | Remove `o` export from `index.ts` (internal detail leaking)                          | `packages/api/src/index.ts`            |
| 22   | Remove `withTx` from `lib/tx.ts` (unused — handlers use `db.transaction()` directly) | `packages/api/src/lib/tx.ts`           |

### A.6: Update Docs

| Step | What                                               | File              |
| ---- | -------------------------------------------------- | ----------------- |
| 23   | Rewrite CONTEXT.md to reflect current architecture | `docs/CONTEXT.md` |
| 24   | Remove "Todo CRUD" reference from AGENTS.md        | `AGENTS.md`       |
| 25   | Add 5-layer pattern documentation to AGENTS.md     | `AGENTS.md`       |

### A.7: Verify

| Step | What                                           |
| ---- | ---------------------------------------------- |
| 26   | `bun install --frozen-lockfile` (simulates CI) |
| 27   | `bunx oxlint --format=github` (CI lint)        |
| 28   | `bunx oxfmt --check` (CI format check)         |
| 29   | `bun run check-types` (CI typecheck)           |
| 30   | `bun run build` (CI build)                     |
| 31   | `bun test --coverage` (CI test + coverage)     |

### A.8: Commit Plan

| Commit | Scope                | Message                                                                                   |
| ------ | -------------------- | ----------------------------------------------------------------------------------------- |
| 1      | Remove dead code     | `refactor: remove dead ports, events, lib, and unused dependencies`                       |
| 2      | Fix CI               | `fix(ci): fix Dependabot ecosystem, coverage threshold, cache config, lockfile sync`      |
| 3      | 5-layer refactor     | `refactor: restructure all modules to 5-layer architecture (router/handler/service/repo)` |
| 4      | Schema + consistency | `feat(db): add user role CHECK constraint, extract shared constants, graceful shutdown`   |
| 5      | Docs                 | `docs: update CONTEXT.md and AGENTS.md to reflect current architecture`                   |

---

## 4. Phase B: Feature Implementation + Testing

Each sub-phase: schema migration → repo → service (pure + unit tests) → handler → router → integration tests → CONTEXT.md update.

### B1: Wallet & Payment (FR-03, FR-04, FR-12, DL-04, DL-16, DL-24)

**Tables:** `markPackage`, `paymentRecord`, `refundRecord` (with `status` CHECK column)

**Modules:**

- `modules/payment/` — `payment.repo.ts`, `payment.service.ts`, `payment.handler.ts`, `payment.router.ts`, `payment.types.ts`
- Expand `modules/wallet/` — add `listLedger`, `listPackages`, `knowledgeBankEligible` to handler + router
- `apps/server/src/webhooks/payments.ts` — thin webhook handler

**Tests:** TC-03 (purchase), TC-04 (idempotency), TC-35 (no-credit-on-fail), TC-32 (KB gate)

### B2: Tutor Discovery & Availability (FR-06, FR-19, FR-23, FR-24)

**Tables:** `availabilitySlot`, `floor_price_config` (runtime-editable)

**Modules:**

- Expand `modules/tutor-discovery/` — add `getProfile` with availability summary
- New `modules/availability/` — CRUD for tutor availability slots
- Expand `modules/pricing/` — read floor prices from config table instead of hardcoded constants

**Tests:** TC-05, TC-07, TC-10

### B3: Booking Core — Solo (FR-07, FR-14, FR-15, FR-21 fallback, FR-22)

**Tables:** `booking`, `bookingParticipant`, `bookingStateHistory`, `bookingRescheduleProposal`, `room`, `roomBooking`, `meetingEvent`, `notification`, `notificationDispatch`

**Modules:**

- `modules/booking/` — state machine (`canTransition` pure function + unit tests), `booking.repo.ts`, `booking.handler.ts`, `booking.router.ts`
- `modules/room/` — `room.repo.ts`, `room.handler.ts`, `room.router.ts` (admin only)
- `modules/meeting/` — fallback provider (manual link entry)
- `modules/notification/` — `notification.repo.ts`, `notification.handler.ts`, `notification.router.ts`, email queue (post-commit async)

**Tests:** TC-11, TC-13..17, TC-20, TC-21, TC-36, TC-37, TC-38

### B4: Booking — Group + Series (FR-08, FR-16, FR-20, FR-22 group)

**Tables:** `bookingSession` (series children with independent state machine)

**Modules:**

- Expand `modules/booking/` — `createGroup`, `confirmInvite`, `reconfirm`, `withdraw`, `createSeries`
- `modules/booking/expiry-sweep.ts` — background job for 12h deadline windows

**Tests:** TC-12, TC-18, TC-19, TC-23..34

### B5: Admin Override & Support (FR-10, FR-13)

**Tables:** `supportTicket`

**Modules:**

- `modules/support/` — `support.repo.ts`, `support.handler.ts`, `support.router.ts`
- Expand `modules/admin/` — `applyOverride`, `reconcilePayment`, `refundPayment`, `listOverridesQueue`

**Tests:** TC-37, TC-39, override-audit, payment-reconciliation

---

## 5. Phase C: Polish & Production Readiness

| Step | What                                                                         |
| ---- | ---------------------------------------------------------------------------- |
| 1    | `apps/server/Dockerfile` (Bun + tsdown → dist)                               |
| 2    | `apps/web/Dockerfile` (Vite build → nginx)                                   |
| 3    | `apps/web/nginx.conf` (SPA fallback, gzip, cache headers)                    |
| 4    | `.github/workflows/cd.yml` (build → push to GHCR → migrate → Coolify deploy) |
| 5    | Rate limiting on auth + payment webhook (`@elysiajs/rate-limit`)             |
| 6    | Structured error logging on every service error (evlog)                      |
| 7    | OpenAPI tags cleanup                                                         |
| 8    | Production env review (secrets, CORS, secure cookies)                        |
| 9    | E2E test setup (Playwright or similar)                                       |

---

## 6. Phase D: Staging Deploy + Validation

| Step | What                                                                             |
| ---- | -------------------------------------------------------------------------------- |
| 1    | Set up Coolify staging (Postgres service + server app + web app)                 |
| 2    | Configure staging env vars (BETTER_AUTH_SECRET, DATABASE_URL, CORS_ORIGIN, etc.) |
| 3    | Run migrations against staging DB                                                |
| 4    | Deploy server + web to staging via Coolify                                       |
| 5    | Smoke tests: auth flow, wallet purchase (stub), booking flow, admin override     |
| 6    | Manual QA against staging URL                                                    |

---

## 7. Phase E: Production Deploy

| Step | What                                                                        |
| ---- | --------------------------------------------------------------------------- |
| 1    | Tag `v1.0.0`                                                                |
| 2    | CD pipeline: build images → push to GHCR → migrate prod DB → Coolify deploy |
| 3    | Monitor healthcheck + logs for 30 minutes                                   |
| 4    | Rollback plan: Coolify redeploy prior image tag                             |

---

## 8. Architecture Decisions

| ID   | Decision                                                             | Rationale                                                                                                                                      |
| ---- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| A-01 | 5-layer architecture: router → handler → service → repo → port       | Separation of concerns: SQL in repos, business logic in services (unit-testable without DB), orchestration in handlers, cross-module via ports |
| A-02 | Functional factories, not classes                                    | Matches codebase style (Elysia, oRPC, Better Auth, Drizzle). No `this` binding issues. Services are stateless.                                 |
| A-03 | DI via oRPC context (`context.services`)                             | Every procedure has access to all services. Testable via `createRouterClient` with mock context.                                               |
| A-04 | Remove dead code immediately                                         | Don't keep skeleton code for "future use" — add it when the phase needs it. Keeps codebase honest.                                             |
| A-05 | Testing: TDD for services (pure), test-after for repos/handlers (DB) | Pure services benefit from TDD. DB-dependent code can't be TDD'd without a running DB.                                                         |
| A-06 | Coverage threshold starts at 10%                                     | Realistic for current state. Raise as Phase B adds tests.                                                                                      |
| A-07 | Dependabot ecosystem: `"npm"` (not `"bun"`)                          | Bun uses npm-compatible lockfiles. `"bun"` is not a valid Dependabot ecosystem.                                                                |
| A-08 | CI cache: only `~/.bun/install/cache` + `.turbo`                     | Caching `node_modules` with `linker = "isolated"` causes symlink issues.                                                                       |
| A-09 | `user.role` gets CHECK constraint                                    | DB-level enforcement prevents corrupt data from direct DB access or bugs.                                                                      |
| A-10 | Graceful shutdown: SIGTERM handler + DB pool drain                   | Prevents hanging connections during deploys.                                                                                                   |

### Version Notes

- v2.0 (2026-06-27): Created. Supersedes PLAN.md for execution. Defines 5-layer architecture, Phase A-E structure, testing strategy. References PLAN.md for design decisions (D-01..D-30) and schema/API/edge case details.
