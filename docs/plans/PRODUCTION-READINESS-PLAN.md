# Cogito Backend — Production Readiness Plan

**Status:** Active — second branch to execute (after consolidation)
**Branch:** `improvement/production-readiness`
**Created from:** `main` (after `improvement/consolidation` merges)
**Date:** 2026-07-21
**Depends on:** `improvement/consolidation` branch merged to main
**Next:** `feature/prd-gaps` (after this merges)

This branch runs after the consolidation branch, so all code uses the unified 4-layer architecture (Router → Handler → Service → Repo), consumer-driven port interfaces, and `postgres.js`.

It runs in parallel with the infrastructure branch — they touch different files (business logic vs Docker/CI).

---

## Table of Contents

1. [Critical Bugs](#1-critical-bugs)
2. [Phase 1: Bug Fixes](#2-phase-1-bug-fixes)
3. [Phase 2: Redis Integration](#3-phase-2-redis-integration)
4. [Phase 3: DB Optimization](#4-phase-3-db-optimization)
5. [Phase 4: Test Coverage — 100%](#5-phase-4-test-coverage--100)
6. [Phase 5: Security Hardening](#6-phase-5-security-hardening)
7. [Phase 6: Documentation](#7-phase-6-documentation)
8. [Phase 7: Verify](#8-phase-7-verify)
9. [Risk Register](#9-risk-register)
10. [Execution Checklist](#10-execution-checklist)

---

## 1. Critical Bugs

### P0 — Data Integrity

| ID  | Bug                                                            | Impact                                           | Root Cause                                                 |
| --- | -------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------- |
| B2  | Meeting creation failure leaves booking in `"scheduled"` state | Orphaned bookings, student can't rebook          | No rollback of booking status on meeting provider error    |
| B4  | Series bookings never expire — no `deadlineAt` set             | Series slots held forever                        | `createSeries` doesn't set `deadlineAt`                    |
| B3  | Refund correction stores `bookingId` as `paymentId`            | Ledger entries reference wrong entity            | `createCorrection` passes `bookingId` to `paymentId` param |
| B5  | No CSRF protection on mutation endpoints                       | Any malicious site can invoke state-changing API | No CSRF token or SameSite enforcement                      |

### P1 — Performance

| ID  | Bug                                                 | Impact                                | Root Cause                                                                   |
| --- | --------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------- |
| B1  | Triple session validation per authenticated request | 3x DB queries on every protected call | `identifyUser` + `protectedProcedure` + `createContext` all validate session |

### P1 — Correctness

| ID  | Bug                                                      | Impact                                              | Root Cause                     |
| --- | -------------------------------------------------------- | --------------------------------------------------- | ------------------------------ |
| N1  | Scheduler `onReleaseHolds` calls `expireBookings`        | Hold release job does the same thing as expiry job  | Wrong function reference       |
| N2  | Scheduler `onSendNotificationEmail` is a no-op           | Notifications silently dropped                      | Handler stub never implemented |
| N7  | Refund `createCorrection` uses `Date.now()` in event key | Potential unique constraint violation               | Race window with ms precision  |
| N15 | `applyOverride` doesn't update `booking.holdAmount`      | Override changes price but hold stays at old amount | Missing field update           |

### P2 — Functional

| ID  | Bug                                                  | Impact                                    | Root Cause                                |
| --- | ---------------------------------------------------- | ----------------------------------------- | ----------------------------------------- |
| N4  | `expireBookings` doesn't expire series sessions      | Orphaned series sessions                  | Scheduler only queries top-level bookings |
| N5  | `listLedger` ignores `bookingId`/`eventKey` filters  | Pagination broken for filtered views      | Repo doesn't pass filter params           |
| N8  | `withdraw` doesn't release other participants' holds | Group booking withdrawal leaks held funds | Only releases withdrawing user's hold     |
| N9  | `adminBooking.listBookings` returns null cursor      | Admin pagination broken                   | Cursor never set in response              |

---

## 2. Phase 1: Bug Fixes

**Goal:** Fix all P0/P1/P2 bugs. Repurpose dormant code.

### 1.1 Fix triple session validation (B1)

**Files:** `apps/server/src/routes.ts`, `packages/api/src/procedures.ts`, `packages/api/src/context.ts`

- Remove session validation from `identifyUser` middleware (keep only user identification for logging)
- Remove duplicate session fetch in `protectedProcedure` (rely on `createContext` which already validates)
- Result: single session validation per request in `createContext`

**Acceptance:** Authenticated request hits DB exactly once for session lookup.

### 1.2 Fix meeting creation rollback (B2)

**Files:** `packages/api/src/modules/booking/booking.handler.ts` (after consolidation)

- Wrap meeting creation inside the booking transaction
- If meeting provider throws, rollback the booking status change
- On meeting creation failure, set booking status to `"pending"` (allow retry)

**Acceptance:** When Google Meet API fails, booking reverts to `"pending"`, not stuck in `"scheduled"`.

### 1.3 Fix series booking deadline (B4)

**Files:** `packages/api/src/modules/booking/booking.service.ts`

- Add `deadlineAt` calculation to `createSeries` flow
- Series bookings get `deadlineAt = now + 12h` (same as individual bookings)
- Service validation rejects series without deadline

**Acceptance:** Series bookings have `deadlineAt` set. Scheduler expiry job picks them up.

### 1.4 Fix refund correction paymentId (B3)

**Files:** `packages/api/src/modules/wallet/wallet.handler.ts` (after consolidation)

- Change `createCorrection` call to pass actual payment ID instead of booking ID
- Add field mapping: `paymentId: refund.paymentId` not `paymentId: booking.id`

**Acceptance:** Ledger corrections reference the correct payment entity.

### 1.5 Repurpose `bookingIdempotency` for payment race condition

**Files:** `packages/api/src/lib/idempotency.ts`, `packages/api/src/modules/payment/payment.router.ts`

- Remove unused `bookingIdempotency` instance
- Create `paymentIdempotency` instance keyed on `payment_provider + charge_id`
- Wire into payment webhook handler: check idempotency before processing
- Return cached result on duplicate webhook
- Note: This will be replaced by Redis-backed idempotency in Phase 2, but the in-memory version is correct for single-instance

**Acceptance:** Duplicate payment webhooks return 200 with cached result instead of double-processing.

### 1.6 Extend CircuitBreaker to Google Meet + Resend

**Files:** `packages/api/src/lib/circuit-breaker.ts`, `packages/api/src/modules/meeting/google-meeting.provider.ts`

- Extract `CircuitBreaker` to shared utility (currently only used in Xendit handler)
- Create `googleMeetBreaker` instance: threshold 5, reset 60s
- Create `resendBreaker` instance: threshold 3, reset 120s
- Wire into Google Meet provider and Resend email sender
- On circuit open: return graceful degradation (manual meeting link fallback, queue email for retry)
- Note: Circuit breaker state will be moved to Redis in Phase 2

**Acceptance:** Google Meet outages don't cascade to booking failures. Resend outages don't cascade to 500s.

### 1.7 Fix scheduler correctness (N1, N2)

**Files:** `packages/api/src/modules/scheduler/scheduler.service.ts`

- **N1:** Change `onReleaseHolds` to actually release holds (call `walletPort.release` for each held booking), not call `expireBookings`
- **N2:** Implement `onSendNotificationEmail` — call email port (or queue to BullMQ) instead of just logging

**Acceptance:** Hold release job releases holds. Notification job sends emails.

### 1.8 Fix remaining correctness bugs (N4, N5, N7, N8, N9, N15)

**Files:** Multiple module files

- **N4:** Add series session expiry to `expireBookings` — query `bookingSession` with past `deadlineAt`
- **N5:** Pass `bookingId`/`eventKey` filter params through to SQL query in `wallet.repo.ts`
- **N7:** Replace `Date.now()` in correction event key with deterministic key: `correction:${refundId}:${timestamp}`
- **N8:** In `withdraw` handler, release holds for all group participants (not just withdrawing user)
- **N9:** Set `nextCursor` in `adminBooking.listBookings` response mapper
- **N15:** Update `booking.holdAmount` in `applyOverride` handler

**Acceptance:** Each sub-fix verified with a unit or integration test.

### 1.9 Add CSRF protection (B5)

**Files:** `apps/server/src/routes.ts`

- Add `SameSite=Strict` to auth cookies (currently `SameSite=None` but no CSRF token)
- Alternatively: add CSRF token to auth response, validate on mutations
- Whitelist: payment webhook path (Xendit sends server-to-server)

**Acceptance:** Cross-site POST requests without CSRF token are rejected. Webhooks still work.

### 1.10 Remove dead code

**Files:** Multiple

- Remove `@hookform/resolvers` from dependencies (zero imports)
- Remove `midtrans` enum value from payment provider types
- Remove unused `bookingIdempotency` instance (class stays, repurposed in 1.5)
- Remove `withTx` from `lib/tx.ts` if still unused after consolidation

**Acceptance:** `bun run check-types && bun run build` pass with dead code removed.

### 1.11 Add graceful scheduler shutdown (N3)

**Files:** `packages/api/src/modules/scheduler/scheduler.service.ts`, `apps/server/src/index.ts`

- Add `scheduler.shutdown()` to SIGTERM/SIGINT handler
- Close BullMQ workers and Redis connections before process exit
- Add 10s forced shutdown timeout

**Acceptance:** `kill -SIGTERM <pid>` completes within 10s with no dangling connections.

---

## 3. Phase 2: Redis Integration

**Goal:** Add Redis for shared state — sessions, idempotency, rate limiting, circuit breaker state, BullMQ persistence.

### Architecture Decision

**Single Redis instance** for all use cases, with key prefix namespacing:

- `cogito:session:*` — session cache
- `cogito:idempotency:*` — idempotency records
- `cogito:ratelimit:*` — rate limit counters
- `cogito:circuit:*` — circuit breaker state
- `cogito:bullmq:*` — BullMQ job queue (uses its own prefix)

This means BullMQ jobs survive restarts, rate limiting works across instances, and circuit breaker state persists through deployments.

### 2.1 Add Redis infrastructure

**Files:** `docker-compose.yml` (or equivalent), `packages/env/src/server.ts`

- Add Redis service to Docker Compose (port 6379, persistence enabled)
- Add env vars: `REDIS_URL` (required in production), `REDIS_URL` defaults to `redis://localhost:6379` in dev
- Add Redis health check to `/health` endpoint

**Acceptance:** `docker compose up` starts PostgreSQL + Redis. `/health` reports Redis status.

### 2.2 Redis-backed session caching

**Files:** `packages/auth/src/index.ts`

- Configure Better Auth to use Redis for session storage
- Sessions stored in Redis with TTL matching `maxAge`
- Fallback to DB query on Redis miss
- This eliminates the triple session validation issue (B1) from the DB side entirely

**Acceptance:** Session lookups hit Redis first, DB only on miss. Redis restart doesn't lose sessions (they rehydrate from DB).

### 2.3 Redis-backed idempotency

**Files:** `packages/api/src/lib/idempotency.ts`

- Replace in-memory `IdempotencyStore` with Redis-backed implementation
- Use `SET key value EX ttl` for automatic expiry
- Keep in-memory fallback for when Redis is unavailable (degraded mode)
- Wire into payment webhook, booking creation, and any other idempotent endpoints

**Acceptance:** Duplicate requests return cached result even across server restarts. Idempotency records auto-expire.

### 2.4 Redis-backed rate limiting

**Files:** `packages/api/src/lib/rate-limit.ts`, `apps/server/src/routes.ts`

- Replace in-memory rate limiting with Redis-backed sliding window
- Use `INCR` + `EXPIRE` for counters
- Keep in-memory fallback for dev (no Redis required)
- Apply rate limits: 10 req/min for auth, 5 req/min for payment creation, 100 req/min general

**Acceptance:** Rate limiting works across multiple instances. Redis unavailable falls back to in-memory.

### 2.5 Redis-backed circuit breaker state

**Files:** `packages/api/src/lib/circuit-breaker.ts`

- Store circuit breaker state in Redis (open/closed/half-open + failure counts)
- Key format: `cogito:circuit:{serviceName}`
- On app restart, circuits start in last known state (not reset to closed)
- Keep local in-memory cache with 1-second TTL to avoid Redis round-trips on every request

**Acceptance:** Circuit breaker state survives deployments. Google Meet outage tracked across instances.

### 2.6 BullMQ with Redis persistence

**Files:** `packages/api/src/modules/scheduler/scheduler.service.ts`

- Configure BullMQ to use the shared Redis instance
- Enable job persistence: jobs survive Redis restarts (Redis persistence enabled)
- Add retry config: `attempts: 3, backoff: { type: 'exponential', delay: 1000 }`
- Add dead-letter queue: `cogito:bullmq:dead` for failed jobs after max retries

**Acceptance:** BullMQ jobs survive app restart. Failed jobs go to dead-letter queue. Redis persistence enabled.

### 2.7 Verify Redis integration

- Start app with Redis running: all features work
- Start app without Redis: graceful fallback to in-memory for rate limiting and circuit breaker, sessions fall back to DB, BullMQ errors logged but app starts
- Kill Redis mid-request: app continues with degraded features, logs warning
- Restart app: circuit breaker state preserved, idempotency records preserved

**Acceptance:** App works with and without Redis. No data loss on restart. Degraded mode is functional.

---

## 4. Phase 3: DB Optimization

**Goal:** Add missing indexes, optimize queries.

Note: `pg → postgres.js` migration was done in the consolidation branch. This phase focuses on indexes and query optimization.

### 3.1 Add missing indexes

**Files:** New migration `packages/db/src/migrations/`

| Index                                | Table                | Column(s)                         | Purpose               |
| ------------------------------------ | -------------------- | --------------------------------- | --------------------- |
| `idx_booking_status_deadline`        | `booking`            | `status, deadline_at`             | Expiry sweep query    |
| `idx_booking_participant_user`       | `bookingParticipant` | `user_id`                         | User bookings lookup  |
| `idx_booking_session_booking_id`     | `bookingSession`     | `booking_id`                      | Series session lookup |
| `idx_ledger_entry_wallet_event`      | `ledgerEntry`        | `wallet_id, event_key`            | Idempotency check     |
| `idx_tutor_profile_status_published` | `tutorProfile`       | `onboarding_status, published_at` | Discovery query       |
| `idx_audit_log_target`               | `auditLog`           | `target_type, target_id`          | Admin audit lookup    |

**Acceptance:** Migration applies cleanly. `EXPLAIN ANALYZE` on key queries shows index usage.

### 3.2 Fix wallet query performance

**Files:** `packages/api/src/modules/wallet/wallet.repo.ts`

- Replace `SELECT *` with explicit column lists in hot queries
- Add `LIMIT` to all list queries that currently lack it
- Use `WHERE wallet_id = $1 AND event_key = $2` index prefix for idempotency check

**Acceptance:** `listLedger` with filters uses index scan, not seq scan.

### 3.3 Optimize booking queries

**Files:** `packages/api/src/modules/booking/booking.repo.ts`

- Replace N+1 queries in group booking details with JOINs
- Use `WITH` CTEs for booking + participants + sessions in single round-trip
- Add covering index for `getById` with participants

**Acceptance:** `getBookingDetails` makes 1 query instead of 3.

### 3.4 Verify DB optimization

- Run `EXPLAIN ANALYZE` on 5 key queries
- Compare before/after timings for booking creation (100x)
- Verify no regressions in test suite

**Acceptance:** Key queries show index usage. No performance regressions.

---

## 5. Phase 4: Test Coverage — 100%

**Goal:** 100% line coverage, 95%+ branch coverage across all services, handlers, and repos.

> **Note:** No E2E tests (Playwright). Integration tests (via `createRouterClient` against real DB) and unit tests (pure services) are sufficient for this stage. E2E can be added later if needed.

### Testing Infrastructure

#### 4.0.1 Docker test database

**Files:** `tests/helpers/test-db.ts` (new or update)

- Configure test runner to use Docker PostgreSQL
- Add `docker-compose.test.yml` with test-specific PostgreSQL
- Support: `bun test --docker` to auto-start/stop test DB
- Add transaction rollback in test fixtures (clean slate between tests)

**Acceptance:** `bun test` can run with a Docker PostgreSQL instance.

#### 4.0.2 Test factories and fixtures

**Files:** `tests/helpers/factories.ts` (update)

- Add factories for all entity types: Booking, BookingParticipant, BookingSession, Payment, Notification, etc.
- Add `createTestUser`, `createTestWallet`, `createTestBooking` helpers
- Add `resetDatabase` helper that truncates all tables between test suites

**Acceptance:** Test factories exist for all entity types.

### Services — 100% Line Coverage

Each service module needs unit tests covering every exported function, every branch, every error case.

#### 4.1 booking.service.ts (most complex)

**Files:** `tests/unit/booking.service.test.ts`

- Every `canTransition` path (all state transitions)
- Price calculation for solo, group, series
- Deadline calculation
- Group pricing with headcount changes
- Series session count validation
- Edge cases: zero price, negative price, invalid modality

**Acceptance:** 100% line, 95%+ branch coverage.

#### 4.2 wallet.service.ts

**Files:** `tests/unit/wallet.service.test.ts`

- `hold()`, `release()`, `deduct()`, `credit()`, `compensate()` — every branch
- Balance validation (insufficient funds, negative amounts)
- Idempotency check
- Knowledge bank eligibility

**Acceptance:** 100% line, 95%+ branch coverage.

#### 4.3 pricing.service.ts

**Files:** `tests/unit/pricing.service.test.ts`

- Solo pricing with floor enforcement
- Group pricing with per-student discount
- Series pricing with session count
- Extra take calculation (1 per 5 Marks rule)
- Edge cases: minimum students, maximum sessions, offline premium

**Acceptance:** 100% line, 100% branch coverage (pure function, easy to achieve).

#### 4.4 All other services

**Files:** `tests/unit/{module}.service.test.ts`

- auth, admin, adminTutor, tutor, invite, achievement, payment, notification
- Every exported function, every branch, every error case

**Acceptance:** 100% line, 95%+ branch coverage per service.

### Repos — Key-Path Coverage

Each repo module needs integration tests covering happy paths and key error paths.

#### 4.5 wallet.repo.ts

**Files:** `tests/integration/wallet.repo.test.ts`

- `getById`, `getByUserId`, `getOrCreate`
- `atomicHold`, `atomicRelease`, `atomicDeduct`, `atomicCredit`
- `insertLedger`, `listLedger` with filters
- Concurrent operations test (5 parallel holds)

**Acceptance:** All repo methods tested. Concurrent hold test passes.

#### 4.6 booking.repo.ts

**Files:** `tests/integration/booking.repo.test.ts`

- `createBooking`, `getById`, `updateStatus`
- `addParticipant`, `updateParticipantState`
- `createSession`, `updateSession`
- `getStateHistory`
- Complex queries: `getByIdWithParticipants`, `listExpired`

**Acceptance:** All repo methods tested.

#### 4.7 All other repos

**Files:** `tests/integration/{module}.repo.test.ts`

- auth, admin, adminTutor, tutor, invite, achievement, payment, notification
- Happy paths + constraint violations

**Acceptance:** All repo methods have integration tests.

### Routers — Integration Coverage

After consolidation, router files contain the orchestration logic that was previously in handlers. These need integration tests via `createRouterClient`.

#### 4.8 booking router

**Files:** `tests/integration/booking.router.test.ts`

- Create solo booking
- Create group booking
- Create series booking
- Confirm, withdraw, cancel flows
- Admin override
- Error cases: insufficient funds, invalid state transition, missing deadline

**Acceptance:** All booking API endpoints tested.

#### 4.9 wallet router

**Files:** `tests/integration/wallet.router.test.ts`

- Hold, release, deduct, credit, compensate
- List ledger with filters
- Knowledge bank eligibility check
- Error cases: insufficient balance, duplicate idempotency key

**Acceptance:** All wallet API endpoints tested.

#### 4.10 All other routers

**Files:** `tests/integration/{module}.router.test.ts`

- auth, admin, adminTutor, tutor, invite, achievement, payment, notification
- Happy paths + error paths for each endpoint

**Acceptance:** All API endpoints have integration tests.

### Scheduler Jobs — Integration Coverage

#### 4.11 scheduler.test.ts

**Files:** `tests/integration/scheduler.test.ts`

- `onExpireBookings` — verify bookings past deadline get expired
- `onReleaseHolds` — verify held funds get released (N1 regression test)
- `onSendNotificationEmail` — verify emails get dispatched (N2 regression test)

**Acceptance:** All scheduler jobs tested with real BullMQ + Redis.

### Concurrency Tests

#### 4.12 wallet concurrency

**Files:** `tests/integration/wallet.concurrency.test.ts`

- 5+ parallel holds on same wallet — verify no overdraw
- 10+ parallel credits — verify final balance is correct
- Parallel hold + release — verify no lost updates

**Acceptance:** No race conditions in wallet operations.

#### 4.13 payment idempotency

**Files:** `tests/integration/payment.idempotency.test.ts`

- Send 2 identical webhooks simultaneously — verify only 1 charge
- Send webhook, then send again — verify cached result returned

**Acceptance:** No double-charging under concurrency.

### CI Configuration

#### 4.14 Coverage enforcement

**Files:** `bunfig.toml`, `.github/workflows/ci.yml`

- Set coverage threshold to 80% overall (enforced)
- Set per-package threshold: `packages/api` 90%, `packages/db` 80%
- Fail CI if coverage drops below threshold
- Add coverage report comment on PRs

**Acceptance:** CI fails if coverage drops below 80%.

---

## 6. Phase 5: Security Hardening

> **Note:** Docker, Dockerfiles, CD pipeline, and Hetzner provisioning are handled in the `improvement/infrastructure` branch (see `docs/plans/INFRASTRUCTURE-PLAN.md`). This phase focuses on application-level security.

### 5.1 Webhook security (N13, N14)

**Files:** `apps/server/src/routes.ts`, `packages/api/src/modules/payment/payment.router.ts`

- **N13:** Add IP allowlisting for Xendit webhook (configurable via env var)
- **N14:** Return generic 200 for webhook errors (no error details in response body)
- Add request body signature verification (Xendity signature header)

**Acceptance:** Webhooks from non-allowlisted IPs return 403. Error responses contain no internal details.

### 5.6 CSP and security headers

**Files:** `apps/server/src/routes.ts`

- Review and relax CSP for frontend compatibility
- Add security headers: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`
- Configure CORS properly for production origin

**Acceptance:** Frontend loads without CSP errors. Security headers present on all responses.

### 5.7 Seed file production guard

**Files:** `packages/db/src/seed.ts`

- Add guard: `if (process.env.NODE_ENV === 'production') throw new Error('Cannot seed production DB')`
- Remove hardcoded passwords from seed data (use env vars or generate random)

**Acceptance:** `NODE_ENV=production bun run db:seed` exits with error. No plaintext passwords in seed file.

### 5.8 Structured error logging

**Files:** `apps/server/src/index.ts`, `packages/api/src/lib/`

- Add structured JSON logging on every unhandled error
- Include: request ID, user ID, error code, stack trace (dev only)
- Use existing `evlog` logger, configure production format

**Acceptance:** Errors logged as structured JSON. No sensitive data in logs.

### 5.9 Production env review

**Files:** `packages/env/src/index.ts`, `apps/server/.env.example`

- Verify all secrets come from env vars (not hardcoded)
- Add `.env.example` with all required vars documented
- Verify: `BETTER_AUTH_SECRET`, `DATABASE_URL`, `REDIS_URL`, `XENDIT_SECRET_KEY`, `GOOGLE_*`, `RESEND_API_KEY`
- Ensure CORS origin is configurable
- Ensure cookie `secure` flag is env-dependent

**Acceptance:** No secrets in code. `.env.example` documents all required vars including `REDIS_URL`.

---

## 7. Phase 6: Documentation

**Goal:** Architecture guide, module reference, API reference, runbook, JSDoc on all public functions, onboarding guide.

### 6.1 Architecture guide

**Files:** `docs/CONTEXT.md` (rewrite)

- Updated architecture diagram (after consolidation — no handler layer)
- Request flow with `postgres.js` and Redis
- Module dependency graph
- Redis key namespace map
- How to add a new module (using createModule pattern)

**Acceptance:** New developer can understand the architecture from CONTEXT.md alone.

### 6.2 Module reference

**Files:** `docs/MODULE-REFERENCE.md` (new)

For each module:

- Name and purpose
- File structure (router, service, repo, types, index)
- Exported service methods with signatures
- Dependencies (which ports it needs)
- Key business rules
- Related PRD requirements

**Acceptance:** Every module documented with method signatures and business rules.

### 6.3 API reference

**Files:** `docs/API-REFERENCE.md` (new)

For each endpoint:

- Path and method (all POST per oRPC convention)
- Auth requirement (public/protected/admin)
- Input schema (Zod type name)
- Output schema
- Error responses
- Example request/response

**Acceptance:** Every API endpoint documented with example payloads.

### 6.4 Runbook

**Files:** `docs/RUNBOOK.md` (new)

- How to start the server (dev, Docker, production)
- How to run migrations
- How to seed the database
- How to reset the database
- How to check Redis connection
- How to monitor BullMQ jobs
- How to clear rate limit keys
- How to reset circuit breaker state
- How to read the health check endpoint
- Common error messages and their fixes
- How to rollback a deployment

**Acceptance:** Operations team can deploy, monitor, and troubleshoot using the runbook.

### 6.5 JSDoc on all public functions

**Files:** All `*.service.ts`, `*.repo.ts`, `*.router.ts` files

Add JSDoc comments to:

- Every exported service method
- Every exported repo method
- Every router procedure
- Every port interface method
- Every utility function in `lib/`

Format:

```ts
/**
 * Creates a solo booking with wallet hold and notification dispatch.
 *
 * @param conn - Database connection or transaction
 * @param input - Booking creation input (student ID, tutor ID, etc.)
 * @returns Created booking with participants
 * @throws {ORPCError} BAD_REQUEST if tutor not available
 * @throws {ORPCError} FORBIDDEN if student has insufficient balance
 */
```

**Acceptance:** `bun run check-types` passes. Every public method has JSDoc with `@param`, `@returns`, `@throws`.

### 6.6 Onboarding guide

**Files:** `docs/ONBOARDING.md` (new)

- Prerequisites (Bun, Docker, Node.js version)
- How to clone and set up
- How to configure `.env`
- How to start dev server
- How to run tests
- How to run a single test
- How to debug with VS Code
- How the codebase is organized (5-layer → 4-layer after consolidation)
- How to add a new API endpoint
- How to add a new module
- How to add a new database table
- Git workflow (branches, PRs, CI)

**Acceptance:** New developer can go from zero to first PR in under 2 hours.

---

## 8. Phase 7: Verify

### 7.1 Full test suite with coverage

```bash
bun run check
bun run check-types
bun run build
bun test
bun run test:coverage
```

Coverage must be ≥ 80% overall, ≥ 90% for `packages/api`.

### 7.2 Manual smoke test

Start dev server with Redis and test:

- Auth: login, get profile
- Wallet: check balance, purchase, hold/deduct
- Booking: create solo, confirm, withdraw, cancel
- Admin: set role, override booking
- Discovery: list tutors
- Scheduler: trigger expiry job manually
- Redis: verify session caching, rate limiting, circuit breaker

### 7.3 Performance baseline

Run load tests against production-readiness build:

- Auth flow: 100 concurrent logins
- Booking creation: 50 concurrent bookings
- Wallet operations: 100 concurrent holds on same wallet
- Scheduler: trigger 100 bookings to expire

**Acceptance:** p95 latency < 500ms for all operations. No errors under load.

---

## 9. Risk Register

| #   | Risk                                                      | Likelihood | Impact | Mitigation                                                                                                 |
| --- | --------------------------------------------------------- | ---------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| R1  | Redis unavailable causes app crash                        | Medium     | High   | All Redis clients have in-memory fallback. App starts without Redis.                                       |
| R2  | 100% test coverage takes too long                         | Medium     | Medium | Prioritize services (pure, easy), then routers, then repos. Accept 95% branch if 100% line is achieved.    |
| R3  | CSRF protection breaks frontend                           | Medium     | High   | Use `SameSite=Strict` first. Add CSRF token only if cross-site is needed.                                  |
| R4  | Docker build fails due to native deps                     | Medium     | Low    | Use `bun` base image. Verify all native deps available in Alpine.                                          |
| R5  | E2E tests are flaky in CI                                 | High       | Low    | Mark E2E job as non-blocking initially. Stabilize over time.                                               |
| R6  | Redis key collision between features                      | Low        | Medium | Use namespaced keys with `cogito:` prefix. Each feature has its own sub-prefix.                            |
| R7  | Migration to Redis session cache breaks existing sessions | Medium     | Medium | Deploy with dual-read: check Redis first, fall back to DB. Existing sessions rehydrate.                    |
| R8  | 100% line coverage creates fragile tests                  | Low        | Low    | Focus on testing behavior, not implementation. Use integration tests for routers, unit tests for services. |

---

## 10. Execution Checklist

### Phase 1: Bug Fixes

- [ ] 1.1 Fix triple session validation (B1)
- [ ] 1.2 Fix meeting creation rollback (B2)
- [ ] 1.3 Fix series booking deadline (B4)
- [ ] 1.4 Fix refund correction paymentId (B3)
- [ ] 1.5 Repurpose bookingIdempotency for payment race condition
- [ ] 1.6 Extend CircuitBreaker to Google Meet + Resend
- [ ] 1.7 Fix scheduler correctness (N1: release holds, N2: send emails)
- [ ] 1.8 Fix remaining bugs (N4, N5, N7, N8, N9, N15)
- [ ] 1.9 Add CSRF protection (B5)
- [ ] 1.10 Remove dead code
- [ ] 1.11 Add graceful scheduler shutdown (N3)
- [ ] Verify: `bun run check && bun run check-types && bun run build && bun test` all pass

### Phase 2: Redis Integration

- [ ] 2.1 Add Redis to Docker Compose + env vars + health check
- [ ] 2.2 Redis-backed session caching
- [ ] 2.3 Redis-backed idempotency (replace in-memory)
- [ ] 2.4 Redis-backed rate limiting
- [ ] 2.5 Redis-backed circuit breaker state
- [ ] 2.6 BullMQ with Redis persistence
- [ ] 2.7 Verify Redis integration (with Redis, without Redis, kill Redis mid-request)

### Phase 3: DB Optimization

- [ ] 3.1 Add missing indexes (6 indexes)
- [ ] 3.2 Fix wallet query performance
- [ ] 3.3 Optimize booking queries (N+1 → JOINs)
- [ ] 3.4 Verify DB optimization (EXPLAIN ANALYZE)

### Phase 4: Test Coverage — 100%

- [ ] 4.0.1 Set up Docker test database
- [ ] 4.0.2 Create test factories and fixtures
- [ ] 4.1 booking.service.ts — 100% line coverage
- [ ] 4.2 wallet.service.ts — 100% line coverage
- [ ] 4.3 pricing.service.ts — 100% line coverage
- [ ] 4.4 All other services — 100% line coverage
- [ ] 4.5 wallet.repo.ts — integration tests
- [ ] 4.6 booking.repo.ts — integration tests
- [ ] 4.7 All other repos — integration tests
- [ ] 4.8 booking router — integration tests
- [ ] 4.9 wallet router — integration tests
- [ ] 4.10 All other routers — integration tests
- [ ] 4.11 Scheduler jobs — integration tests
- [ ] 4.12 Wallet concurrency test
- [ ] 4.13 Payment idempotency test
- [ ] 4.14 Coverage enforcement in CI (80% overall, 90% packages/api)

### Phase 5: Security Hardening

- [ ] 5.1 Webhook security (IP allowlisting, signature verification)
- [ ] 5.2 CSP and security headers
- [ ] 5.3 Seed file production guard
- [ ] 5.4 Structured error logging
- [ ] 5.5 Production env review (include REDIS_URL)

> Docker, CD pipeline, and infrastructure are handled in the `improvement/infrastructure` branch.

### Phase 6: Documentation

- [ ] 6.1 Rewrite CONTEXT.md (architecture after consolidation)
- [ ] 6.2 Create MODULE-REFERENCE.md
- [ ] 6.3 Create API-REFERENCE.md
- [ ] 6.4 Create RUNBOOK.md
- [ ] 6.5 Add JSDoc to all public functions
- [ ] 6.6 Create ONBOARDING.md

### Phase 7: Verify

- [ ] 7.1 Full test suite with coverage (≥ 80% overall, ≥ 90% packages/api)
- [ ] 7.2 Manual smoke test (auth, wallet, booking, admin, discovery, scheduler, Redis)
- [ ] 7.3 Performance baseline (p95 < 500ms)

---

### Version Notes

- v1.0 (2026-07-21): Created. Production readiness branch: bug fixes, Redis integration, DB optimization, 100% test coverage, documentation. Runs after consolidation branch merges.
- v1.1 (2026-07-21): Removed Docker/CD/E2E (moved to infrastructure branch). Added security hardening phase. No E2E tests — integration + unit tests only.
