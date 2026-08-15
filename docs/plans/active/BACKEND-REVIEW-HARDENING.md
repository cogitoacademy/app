# Backend Review Hardening — Implementation Plan

> **STATUS: ACTIVE — implementation on branch `fix/backend-review-hardening` (worktree `/Users/miapalovaara/cogito/wt-backend-review`).** Findings from the 2026-08-15 full-backend review (correctness + security), verified at HEAD `7e9ff5c`. Cross-checked against `docs/plans/active/PRD-GAPS-PHASE3.md` (U1–U14), `docs/plans/active/BACKEND-CLEANUP.md` (completed, merged 2026-08-15) and `.superpowers/sdd/` ledgers so nothing is double-tracked.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every correctness/security finding from the 2026-08-15 backend review — 1 CRITICAL, 7 HIGH, 16 MEDIUM, ~12 LOW — and make Redis mandatory for local dev.

**Architecture:** 6 independent PRs, backend-only (one small `apps/web/.env` addition), all on `fix/backend-review-hardening`. Follows the existing 4-layer pattern (Router → Handler → Service → Repository), consumer-driven ports, `DomainError` + `withDomainMap`, bounded zod, `DbOrTx`, pg advisory locks for create-path serialization, and real-DB integration tests. PR order is dependency-safe (infra first, then booking money, admin money, module security, meeting/email, uploads).

**Tech Stack:** Bun 1.3.14, Elysia, oRPC, Drizzle + postgres.js, BullMQ, better-auth, Resend, Xendit, Cloudflare R2, bun:test, oxlint/oxfmt.

## Global Constraints

- Import from `@cogito-app/...` package paths; modules use `../../lib`, `../../shared`, `../../procedures`.
- 4-layer pattern; `DbOrTx` (`packages/api/src/lib/tx.ts`); `DomainError` + `withDomainMap`; bounded zod (`.max()`, `.refine()`).
- Redis keys: `cogito:{namespace}:{key}`; stateful libs accept optional `redis` with in-memory fallback (fallback stays as defensive code only — Redis is now mandatory in dev).
- Conventional commits (`fix/feat/refactor/docs/test/chore`); commit after each green step.
- Verify per task: `bun run check-types`, `bun run lint`, targeted `bun test --env-file apps/server/.env ...`; full suite at the end (`bun test --env-file apps/server/.env packages/api/src/tests/ apps/server/src/openapi.test.ts` — baseline 1643 pass / 1 known-failing pre-existing).
- Local test DB `postgresql://postgres:password@localhost:6767/cogito-test`, Redis `localhost:6379`. Docker containers already running.
- CI gates: packages/api ≥ 90% lines, overall ≥ 80% coverage.
- PRD (`docs/prd.tex`) is the source of truth for product behavior. Key citations: permissions matrix prd.tex:350 (cancel = student own booking, tutor/admin No), DL-13 prd.tex:848 (confirmed group withdraw pre-H2 → reprice + reconfirmation), group rules prd.tex:749 (post-confirmation individual commitments locked).

## Overlap Map (no double-tracking)

| This plan | Existing tracker | Relationship |
| --------- | ---------------- | ------------ |
| M4 (group invitee validation) | PRD-GAPS-PHASE3 **U11** | **Folded in — U11 is closed by this plan** (PRD-GAPS-PHASE3 marked done) |
| M12 (retry-failed-meetings dead code) | PRD-GAPS-PHASE3 U1 | Complementary: U1 = admin manual link endpoint (separate, future); M12 = make the auto-retry job live + fall back to manual after 3 attempts |
| H5 (reconfirm decline) | PRD-GAPS-PHASE3 U3 | Distinct: U3 = reconfirmation *deadline* repricing; H5 = *explicit decline* must release the hold. Both reuse repricing semantics; no overlap in code paths |
| C1 (withdraw from confirmed group) | PRD-GAPS-PHASE3 U4 | Must NOT break U4's planned group-series no-opt-out guard — C1 changes only solo-series + group non-series withdraw paths |
| M11 (userNote HTML) | BACKEND-CLEANUP C6 (done) | C6 fixed `achievement.adminNote` only; `admin-booking.service.ts:317` `userNote` remains raw — verified at HEAD |
| M12 (meeting retry) | BACKEND-CLEANUP C1 (done) | C1 added the retry job, but the fallback wrapper (`google-meeting.provider.ts:589-608`) still rewrites `google_meet/failed` → `manual`, making the job dead — verified at HEAD |

## Review Findings Ledger

| ID | Severity | Finding | Location | PR |
| -- | -------- | ------- | -------- | -- |
| C1 | CRITICAL | `withdraw` from CONFIRMED/SCHEDULED group cancels whole booking + strands remaining holds; PRD DL-13 says reprice+reconfirm | `booking.service.ts:1948-1954` | 2 |
| H1 | HIGH | `upsertAvailability` IDOR — update has no `tutorId` predicate | `tutor.repo.ts:128-141` | 4 |
| H2 | HIGH | `confirmInvite` blind headcount increment (lost update race) | `booking.service.ts:1702-1703` | 2 |
| H3 | HIGH | Reprice `eventKey` collision breaks consecutive group withdrawals | `booking.service.ts:360-379` | 2 |
| H4 | HIGH | Overlap check-then-act race (tutor double-booking) | `booking.service.ts:541-547,1553-1559,2006-2014,2153-2161` | 2 |
| H5 | HIGH | `reconfirm(accept=false)` strands participant hold | `booking.service.ts:1840-1845` | 2 |
| H6 | HIGH | Last-admin guard TOCTOU → zero-admins lockout | `admin.service.ts:103-107` | 3 |
| H7 | HIGH | Compensate overrides strand held marks / zero booking hold | `admin-booking.service.ts:141-152,275-304` | 3 |
| M1 | MED | Any participant/tutor can cancel whole booking (PRD: proposer only) | `booking.service.ts:643-698` | 2 |
| M2 | MED | Tutor cancelling series session skips wallet release | `booking.service.ts:1176-1262` | 2 |
| M3 | MED | Intra-series session overlaps never validated | `booking.service.ts:2006-2022` | 2 |
| M4 | MED | Group invitees: dupes/self/over-target → raw 500s (incl. U11) | `booking.service.ts:1605-1626,2209-2230` | 2 |
| M5 | MED | Rate-limit bypass via spoofed `x-real-ip` when `TRUST_PROXY=false` | `lib/request-id.ts:5-14`, `routes.ts:187` | 1 |
| M6 | MED | `adminRefund` status check outside tx + blind overwrite | `admin-booking.service.ts:431-439` | 3 |
| M7 | MED | `createCorrection` random eventKey → no idempotency | `refund.service.ts:45` | 3 |
| M8 | MED | `searchStudents` exposes emails to all authenticated users | `auth.router.ts:44-53` | 4 |
| M9 | MED | Presigned PUT upload is size-unbounded | `lib/storage.ts:86-98` | 6 |
| M10 | MED | Invite tokens stored plaintext at rest | `schema/tutor-invite.ts:20` | 4 |
| M11 | MED | Admin `userNote` unescaped in email HTML | `admin-booking.service.ts:316-318` | 4 |
| M12 | MED | `retryFailedMeetings` dead code; bookings go SCHEDULED without link | `google-meeting.provider.ts:589-608` | 5 |
| M13 | MED | OAuth refresh bypasses circuit breaker, never cached | `google-meeting.provider.ts:452-455` | 5 |
| M14 | MED | Email outbox duplicate-send crash window | `notification.service.ts:229-267` | 5 |
| M15 | MED | `listCorrections` cursor skips filtered entries | `refund.service.ts:91-112` | 3 |
| M16 | MED | Scheduler 500-item sequential loops can run for hours | `booking.service.ts:2490-2792` | 2 |
| L1 | LOW | Service-account Meet poll no timeout; `withTimeout` timer leak | `google-meeting.provider.ts:89-100,428-433` | 5 |
| L2 | LOW | `support.createTicket` bookingId not ownership-validated | `support.service.ts:54-77` | 4 |
| L3 | LOW | Notification cursor unvalidated + equal-timestamp ties | `notification.types.ts:7`, `notification.repo.ts:231` | 4 |
| L4 | LOW | Room date inputs lack order/future validation | `room.types.ts:11-29` | 4 |
| L5 | LOW | `achievement.eventDate` free string; `prices` record unbounded | `achievement.types.ts:8`, `tutor.types.ts:10` | 4 |
| L6 | LOW | Availability upsert/weekly overlap TOCTOU | `tutor.service.ts:237-252,282-313` | 4 |
| L7 | LOW | `deduct` error reports wrong balance field; version race → 404; marksAction silent no-op | `wallet.service.ts:277`, `admin-booking.service.ts:249,197` | 3 |
| L8 | LOW | Chunked bodies bypass content-length pre-check on `/api/auth/*` | `routes.ts:170-183` | 1 |
| L9 | LOW | Seed hardcodes `tutor123`/`student123` | `seed.ts:137,205` | 1 |

---

## PR 1 — Infra & Request-Path Hardening

**Goal:** Redis mandatory for dev; client-IP cannot be spoofed for rate limiting; auth endpoint body size enforced; seed passwords overridable.

### Task 1.1: Redis mandatory in dev

**Files:**
- Modify: `packages/db/docker-compose.yml`
- Modify: `packages/env/src/server.ts:34` (`REDIS_URL` optional → required)
- Modify: `packages/api/src/tests/test-setup.ts`
- Modify: `apps/server/.env`, `apps/server/.env.test`, `apps/server/.env.example`, `apps/web/.env` (worktree-local, gitignored except example)

**Interfaces:**
- Consumes: nothing.
- Produces: `REDIS_URL: z.string().url()` required in the env schema; dev compose exposes `redis:7-alpine` on 6379.

- [ ] **Step 1:** Add `redis` service to `packages/db/docker-compose.yml` (mirror `docker-compose.test.yml`).
- [ ] **Step 2:** Make `REDIS_URL` required in `packages/env/src/server.ts` (`z.string().url()`), update `.env.example` (root + server).
- [ ] **Step 3:** `test-setup.ts` default `REDIS_URL ??= "redis://localhost:6379"`; `.env.test` gets `REDIS_URL`.
- [ ] **Step 4:** Add missing dev keys to `apps/server/.env`: `REDIS_URL`, `PORT`, `NODE_ENV=development`, `STUB_WEBHOOK_ALLOWED=true`, `TRUST_PROXY=false`, `SEED_ADMIN_PASSWORD`, `UPLOAD_DIR`, `WEBHOOK_ALLOWED_IPS=`, `DB_SSL_REJECT_UNAUTHORIZED=true`, `EMAIL_FROM`, `SESSION_COOKIE_CACHE_MAX_AGE=60`, `SCHEDULER_ENABLED=true`, `METRICS_TOKEN` (generated). Remove stale `KNOWLEDGE_BANK_URL` (unused — verified). Create `apps/web/.env` with `VITE_SERVER_URL=http://localhost:3001`. Fix root `.env.example` DB port 5432→6767.
- [ ] **Step 5:** `bun run db:start` brings up postgres + redis. Verify `docker compose ps` shows both healthy.
- [ ] **Step 6:** Commit: `fix(infra): make Redis mandatory for local development`.

### Task 1.2: Untrustworthy `x-real-ip` for rate limiting (M5)

**Files:**
- Modify: `packages/api/src/lib/request-id.ts:5-14`
- Modify: `apps/server/src/routes.ts:187` (+ webhook `ipAllowed` call in `apps/server/src/webhooks/payments.ts`)

**Interfaces:**
- Consumes: Elysia context `server` (Bun `Server`).
- Produces: `getClientIp(request, trustProxy, server?)` — when `!trustProxy`, returns `server.requestIP(request)?.address ?? "unknown"` (never the client-controlled `x-real-ip`); when trusted, first hop of `x-forwarded-for`.

- [ ] **Step 1:** Write failing unit test (`request-id.test.ts`): spoofed `x-real-ip` ignored when `!trustProxy`.
- [ ] **Step 2:** Implement: pass the Elysia server into `getClientIp` at both call sites (rate-limit hook + `ipAllowed`).
- [ ] **Step 3:** Verify tests pass; `bun run check-types`.
- [ ] **Step 4:** Commit: `fix(security): stop trusting client-supplied x-real-ip for rate limits`.

### Task 1.3: Enforce body limit on `/api/auth/*` (L8)

**Files:**
- Modify: `apps/server/src/routes.ts:244-250` (auth handler)

**Interfaces:**
- Consumes: `readBodyWithLimit` from `lib/request-id.ts`.
- Produces: auth route reads body with the 1 MB limit (413 on overflow) and reconstructs the Request, mirroring the `/rpc*` handler.

- [ ] **Step 1:** Implement — reuse the `/rpc*` pattern for `/api/auth/*`.
- [ ] **Step 2:** Verify with a targeted request test (body-limit.test.ts already covers `/rpc*`; add auth-path case).
- [ ] **Step 3:** Commit: `fix(security): enforce body-size limit on auth endpoints`.

### Task 1.4: Overridable seed passwords (L9)

**Files:**
- Modify: `apps/server/src/seed.ts:133-137,203-225`

**Interfaces:**
- Consumes: `process.env.SEED_TUTOR_PASSWORD`, `process.env.SEED_STUDENT_PASSWORD`.
- Produces: seed uses env-overridden passwords with the current defaults as fallback.

- [ ] **Step 1:** Implement env overrides (defaults `tutor123`/`student123` unchanged).
- [ ] **Step 2:** Commit: `chore(seed): allow overriding demo passwords via env`.

---

## PR 2 — Booking Money Correctness

**Goal:** Close the money-integrity gaps in the booking module. PRD citations: DL-13 (confirmed-group withdraw → reprice+reconfirm), prd.tex:350 (cancel = student own booking), prd.tex:749 (post-confirmation commitments locked).

### Task 2.1: Withdraw from confirmed/scheduled group → reprice + reconfirm (C1)

**Files:**
- Modify: `packages/api/src/modules/booking/booking-transitions.ts:39-54` (add transitions)
- Modify: `packages/api/src/modules/booking/booking.service.ts:1930-1955` (withdraw branch)
- Test: `packages/api/src/tests/unit/booking-transitions.test.ts`, integration `booking-g4.test.ts`

**Interfaces:**
- Consumes: existing `transition`, `repriceGroupForHeadcount`, `releaseAllParticipantHolds`, meeting port.
- Produces: `TRANSITIONS[CONFIRMED].to` includes `AWAITING_RECONFIRMATION`; `TRANSITIONS[SCHEDULED].to` includes `AWAITING_RECONFIRMATION`.

**PRD:** DL-13 (prd.tex:848): confirmed-group participant withdraw pre-H2 → release that participant's hold, recalculate, move to `awaiting_reconfirmation`. Post-H2 → late-cancel handling, no repricing.

- [ ] **Step 1:** Write failing integration test: confirmed 3-person group (holds on all 3); participant withdraws pre-H2 → booking is `AWAITING_RECONFIRMATION`, withdrawn hold released, other two holds intact, `holdAmount` = 2× per-student.
- [ ] **Step 2:** Extend transition table (`CONFIRMED`/`SCHEDULED` → `AWAITING_RECONFIRMATION`).
- [ ] **Step 3:** Rework the withdraw branch: replace the bare-cancel `else` with the reprice path for GROUP bookings in any non-terminal state; when regressing from `SCHEDULED`, cancel the meeting event via the meeting port; keep solo-withdraw → cancel as today; keep the < MIN_GROUP_HEADCOUNT cancel-all branch.
- [ ] **Step 4:** Add guard test: post-H2 group withdraw does NOT reprice/cancel (booking continues, late-cancel forfeits the withdrawer's hold).
- [ ] **Step 5:** Run targeted tests (booking-g4, booking-solo, unit transitions); commit: `fix(booking): withdraw from confirmed group reprices instead of cancelling (C1)`.

### Task 2.2: Atomic headcount increment in `confirmInvite` (H2)

**Files:**
- Modify: `packages/api/src/modules/booking/booking.repo.ts` (`updateBookingConfirmedHeadcount`)
- Modify: `packages/api/src/modules/booking/booking.service.ts:1690-1750` (confirmInvite)
- Test: `booking.repo.test.ts` / integration `booking-g4.test.ts`

**Interfaces:**
- Consumes: existing `transition` (version-guarded).
- Produces: `updateBookingConfirmedHeadcount(tx, bookingId, delta: 1)` does `confirmedHeadcount = confirmedHeadcount + 1` in SQL and returns the fresh row.

- [ ] **Step 1:** Change repo method to atomic SQL increment (`sql\`${table.confirmedHeadcount} + 1\``) + `RETURNING`.
- [ ] **Step 2:** In `confirmInvite`, re-read the booking after the increment and evaluate the `>= targetGroupSize` transition on the fresh value (no blind in-memory `+1`).
- [ ] **Step 3:** Test: two concurrent confirms both persist (atomic increment); transition decision uses fresh headcount. Existing confirm flow tests stay green.
- [ ] **Step 4:** Commit: `fix(booking): make confirmInvite headcount increment atomic (H2)`.

### Task 2.3: Unique repricing event keys (H3)

**Files:**
- Modify: `packages/api/src/modules/booking/booking.service.ts:360-379` (`repriceGroupForHeadcount` event keys)
- Test: integration — group of 4, two consecutive withdrawals → both repricings succeed.

**Interfaces:**
- Produces: reprice ledger eventKey includes the resulting per-student price (deterministic per repricing, distinct across headcount changes).

- [ ] **Step 1:** Write failing test: group 4→3→2 via sequential withdrawals, no unique-violation 500.
- [ ] **Step 2:** Append the new `perStudent` price to both the increase-hold and release event keys (and `expireBookings` reprice reuse).
- [ ] **Step 3:** Commit: `fix(booking): unique repricing ledger keys for consecutive withdrawals (H3)`.

### Task 2.4: Serialize tutor-overlap checks with advisory locks (H4)

**Files:**
- Create: `packages/api/src/lib/locks.ts` (or extend `lib/tx.ts`)
- Modify: `packages/api/src/modules/booking/booking.service.ts` — `createSolo`, `createGroup`, `createSeries`, `createGroupSeries`
- Test: integration — concurrent creates for the same tutor+window produce exactly one booking.

**Interfaces:**
- Produces: `lockTutorForBooking(conn: DbOrTx, tutorId: string)` → `SELECT pg_advisory_xact_lock(hashtextextended(${tutorId}, 0))`; called at the top of each create transaction before the overlap check.

- [ ] **Step 1:** Add the lock helper in `lib/locks.ts` (export from `lib/index` if it exists — check imports).
- [ ] **Step 2:** Insert lock calls in the 4 create flows (after the tx begins, before `findOverlappingBookings`).
- [ ] **Step 3:** Test: `Promise.all` of 2 concurrent `createSolo` for same tutor/slot → 1 booking + 1 `BOOKING_CONFLICT`; sequential creates unaffected.
- [ ] **Step 4:** Commit: `fix(booking): serialize overlap checks with pg advisory locks (H4)`.

### Task 2.5: Reconfirm decline releases the hold (H5)

**Files:**
- Modify: `packages/api/src/modules/booking/booking.service.ts:1800-1860` (`reconfirm`)
- Test: integration — decline in reconfirmation releases hold, decrements headcount, reprices; < MIN cancels + releases all.

**Interfaces:**
- Consumes: `wallet.release`, `repriceGroupForHeadcount`, `releaseAllParticipantHolds`, `transition`.
- Produces: decline path mirrors `withdraw`: release → decrement → reprice (or cancel if < MIN).

- [ ] **Step 1:** Write failing test: declined reconfirmation leaves no stranded hold.
- [ ] **Step 2:** Implement the decline branch (reuse withdraw's hold math; keep the booking in `AWAITING_RECONFIRMATION` when ≥ MIN, cancel when < MIN).
- [ ] **Step 3:** Commit: `fix(booking): release hold on reconfirmation decline (H5)`.

### Task 2.6: Cancel restricted to proposer (M1)

**Files:**
- Modify: `packages/api/src/modules/booking/booking.service.ts:643-698`
- Test: unit + integration — participant/tutor cannot `cancel`; proposer can (pre-H2 release; post-H2 penalty).

**Interfaces:**
- Produces: `cancel` asserts `b.proposerId === userId` (per PRD prd.tex:350); non-proposers get `BookingNotOwnedError`.

- [ ] **Step 1:** Write failing test: invitee calls cancel → FORBIDDEN-equivalent error; tutor calls cancel → error.
- [ ] **Step 2:** Implement ownership assertion; audit callers (web uses cancel from student booking detail — proposer path unchanged).
- [ ] **Step 3:** Commit: `fix(booking): cancel is proposer-only per PRD permissions matrix (M1)`.

### Task 2.7: Session cancel restricted to proposer (M2)

**Files:**
- Modify: `packages/api/src/modules/booking/booking.service.ts:1176-1262` (`cancelSession`)
- Test: unit — tutor cannot `cancelSession` (tutor uses `declineBooking`/`completeSession`); proposer can; hold math unchanged.

**Interfaces:**
- Produces: `cancelSession` requires `userId === b.proposerId`; the wallet-op guard becomes unconditional (no more tutor-skip path).

- [ ] **Step 1:** Write failing test (tutor cancels session → error).
- [ ] **Step 2:** Implement proposer assertion and remove the dead skip path.
- [ ] **Step 3:** Commit: `fix(booking): session cancel is proposer-only (M2)`.

### Task 2.8: Validate intra-series session overlaps (M3)

**Files:**
- Modify: `packages/api/src/modules/booking/booking.service.ts:2006-2022,2153-2161` (createSeries/createGroupSeries)
- Test: unit — overlapping sessions in one request → domain error.

**Interfaces:**
- Produces: `assertNoIntraSeriesOverlap(sessions)` — sorted, `next.start < prev.end` → `BookingConflictError`.

- [ ] **Step 1:** Implement validation in both create flows (before insert).
- [ ] **Step 2:** Test overlapping + non-overlapping session arrays.
- [ ] **Step 3:** Commit: `fix(booking): reject intra-series session overlaps (M3)`.

### Task 2.9: Group invitee validation (M4 + U11)

**Files:**
- Modify: `packages/api/src/modules/booking/booking.service.ts:1605-1626,2209-2230`
- Modify: `packages/api/src/modules/booking/booking.repo.ts` (`findUsersByIds` reuse)
- Test: integration — dupes/self/over-target/unknown ids → clean domain errors (no 500).

**Interfaces:**
- Consumes: repo `findUsersByIds` (exists for group-series).
- Produces: `createGroup` validates invitees: dedupe (conflict error on dupes), reject proposer id, enforce `invitees.length + 1 <= targetGroupSize`, reject unknown ids with `USER_NOT_FOUND` (closes PRD-GAPS U11).

- [ ] **Step 1:** Write failing integration tests for each case.
- [ ] **Step 2:** Implement in `createGroup` (mirror the group-series validation); reuse for `createGroupSeries`.
- [ ] **Step 3:** Mark U11 closed in `docs/plans/active/PRD-GAPS-PHASE3.md`.
- [ ] **Step 4:** Commit: `fix(booking): validate group invitees (M4, closes U11)`.

### Task 2.10: Bounded scheduler batches (M16)

**Files:**
- Modify: `packages/api/src/lib/` (new `mapLimit` helper)
- Modify: `packages/api/src/modules/booking/booking.service.ts:2490-2792` (job loops)
- Test: unit — helper respects concurrency cap and error propagation.

**Interfaces:**
- Produces: `mapLimit<T, R>(items, limit, fn)` in `lib/concurrency.ts`; job loops use it with `limit=5` and batch size 100 (from 500).

- [ ] **Step 1:** Add `lib/concurrency.ts` + unit test.
- [ ] **Step 2:** Refactor the 4 job loops (expire, release, lateness, meeting retry) to bounded batches + `mapLimit`.
- [ ] **Step 3:** Job unit tests stay green; commit: `fix(scheduler): bound batch size and concurrency (M16)`.

---

## PR 3 — Admin Money Correctness

### Task 3.1: Last-admin guard inside a transaction with row locks (H6)

**Files:**
- Modify: `packages/api/src/modules/admin/admin.service.ts:49-55,103-107`
- Modify: `packages/api/src/modules/admin/admin.repo.ts`
- Test: unit + integration — concurrent demotions of the last 2 admins cannot reach zero.

**Interfaces:**
- Produces: `adminRepo.lockAdminRows(tx)` (`SELECT id FROM "user" WHERE role='admin' FOR UPDATE`); count+validate+update all inside one tx.

- [ ] **Step 1:** Write failing test (simulated race: two demotions of last-2 admins → exactly one succeeds).
- [ ] **Step 2:** Move `countAdmins` + validation inside the tx after `lockAdminRows`; perform the role update after validation.
- [ ] **Step 3:** Commit: `fix(admin): close last-admin TOCTOU with row locks (H6)`.

### Task 3.2: Compensate override reconciliation (H7)

**Files:**
- Modify: `packages/api/src/modules/admin-booking/admin-booking.service.ts:141-152,275-304`
- Test: integration — compensate_deduct on a held participant leaves no stranded hold and keeps the wallet invariant; booking `holdAmount` matches remaining holds.

**Interfaces:**
- Consumes: `wallet.atomicDeduct`-style math via the wallet port (`deduct` from held).
- Produces: `compensate_deduct` = forfeit semantics (total−, held−, available unchanged); `compensate_credit` = release hold then credit; affected participants' `held_amount` zeroed; `booking.holdAmount` recomputed from remaining participant holds (not blindly 0).

- [ ] **Step 1:** Write failing integration test: post-override, wallet invariant `total = held + available` holds and no marks stranded.
- [ ] **Step 2:** Implement new semantics in `applyOverride` compensation branches + `updateBookingHoldAmount` recomputation + participant `held_amount` clearing.
- [ ] **Step 3:** Commit: `fix(admin-booking): reconcile holds on compensation overrides (H7)`.

### Task 3.3: Conditional refund status update in tx (M6)

**Files:**
- Modify: `packages/api/src/modules/admin-booking/admin-booking.service.ts:431-439`
- Modify: `packages/api/src/modules/admin-booking/admin-booking.repo.ts:276-287`
- Test: unit — stale PAID/SETTLED snapshot fails inside the tx; update requires status IN ('PAID','SETTLED').

**Interfaces:**
- Produces: `updatePaymentStatusIfRefundable(tx, id)` — `UPDATE ... SET status='REFUNDED' WHERE id=? AND status IN ('PAID','SETTLED') RETURNING`; 0 rows → `InvalidRefundStateError`.

- [ ] **Step 1:** Implement conditional update + move read/validation into the tx.
- [ ] **Step 2:** Test: refund on already-REFUNDED payment → clean error, no clobber.
- [ ] **Step 3:** Commit: `fix(admin-booking): conditional status update for refunds (M6)`.

### Task 3.4: Deterministic correction event key (M7)

**Files:**
- Modify: `packages/api/src/modules/refund/refund.service.ts:45`
- Test: unit/integration — double-submit of the same correction produces one ledger entry.

**Interfaces:**
- Produces: eventKey derived from a SHA-256 of `{type, walletId, amount, reason, bookingId}` (stable across retries, unique per distinct correction).

- [ ] **Step 1:** Implement stable key; keep `sourceReference` populated so the ledger unique index actually guards it.
- [ ] **Step 2:** Test: identical retry → `CONFLICT`-style idempotent result (ledger index or pre-check).
- [ ] **Step 3:** Commit: `fix(refund): idempotent wallet corrections (M7)`.

### Task 3.5: Corrections pagination from filtered results (M15)

**Files:**
- Modify: `packages/api/src/modules/refund/refund.service.ts:91-112`
- Modify: `packages/api/src/modules/wallet/wallet.repo.ts` (pass `entryType` filter into the query)
- Test: unit — mixed ledger with corrections interleaved pages correctly.

**Interfaces:**
- Consumes: `wallet.repo.findLedgerEntries(..., { entryType })` (already accepts the filter).
- Produces: `listCorrections` filters in SQL so the cursor is derived from the filtered set.

- [ ] **Step 1:** Implement SQL-side filtering; remove the in-memory filter.
- [ ] **Step 2:** Commit: `fix(refund): cursor pagination over filtered corrections (M15)`.

### Task 3.6: Override error/observability nits (L7)

**Files:**
- Modify: `packages/api/src/modules/admin-booking/admin-booking.service.ts:197,249` + repo (distinct race signal)
- Modify: `packages/api/src/modules/wallet/wallet.service.ts:277` (deduct error message)
- Test: unit — version race → conflict error (not 404); marksAction with holds-but-zero-holdAmount → explicit error; deduct message reports held balance.

- [ ] **Step 1:** Implement all three; add tests.
- [ ] **Step 2:** Commit: `fix(admin-booking): surface version races and marksAction no-ops explicitly`.

---

## PR 4 — Module Security Fixes

### Task 4.1: Availability upsert ownership (H1)

**Files:**
- Modify: `packages/api/src/modules/tutor/tutor.repo.ts:128-141`
- Modify: `packages/api/src/modules/tutor/tutor.service.ts:222-253`
- Test: unit — cross-tutor slot id → not-found error; own slot works.

**Interfaces:**
- Produces: update branch adds `eq(availabilitySlot.tutorId, userId)`; service throws `AvailabilitySlotNotFoundError` when `updated` is undefined.

- [ ] **Step 1:** Write failing test (updating another tutor's slot id).
- [ ] **Step 2:** Implement; ensure `deleteAvailability` symmetry already in place.
- [ ] **Step 3:** Commit: `fix(tutor): ownership check on availability upsert (H1)`.

### Task 4.2: Availability overlap TOCTOU (L6)

**Files:**
- Modify: `packages/api/src/modules/tutor/tutor.service.ts:237-252,282-313`
- Test: unit — lock helper invoked on upsert/weekly-create (integration concurrency optional).

**Interfaces:**
- Consumes: `lockTutorForBooking`-style advisory lock (reuse `lib/locks.ts` keyed on tutorId).

- [ ] **Step 1:** Wrap upsert + weekly-create transactions with the tutor advisory lock.
- [ ] **Step 2:** Commit: `fix(tutor): serialize availability overlap checks (L6)`.

### Task 4.3: Restrict student search + rate limit (M8)

**Files:**
- Modify: `packages/api/src/modules/auth/auth.service.ts` (searchStudents) + `auth.router.ts:44-53`
- Modify: `apps/server/src/routes.ts` (rate limiter for `/rpc/auth.students/search`)
- Test: unit — tutor/admin get FORBIDDEN; student OK.

**Interfaces:**
- Produces: `searchStudents` requires `role === 'student'` (service-level check + rate limit 30/min keyed on IP).

- [ ] **Step 1:** Implement role gate in the handler/service.
- [ ] **Step 2:** Add route rate limit; update docs note in CONTEXT if needed.
- [ ] **Step 3:** Commit: `fix(auth): restrict student search to students and rate-limit it (M8)`.

### Task 4.4: Hash invite tokens at rest (M10)

**Files:**
- Modify: `packages/db/src/schema/tutor-invite.ts` (+ migration `0017_invite_token_hash.sql`)
- Modify: `packages/api/src/modules/admin-tutor/admin-tutor.service.ts`
- Modify: `packages/api/src/modules/invite/invite.service.ts` + `invite.repo.ts`
- Modify: `apps/server/src/seed.ts` (+ `seed-invite.ts`)
- Test: unit + integration — token hashed at rest; verify/claim with plaintext token works; list no longer returns plaintext.

**Interfaces:**
- Produces: `tokenHash` column (unique, text); `hashInviteToken(token)` (SHA-256 hex); plaintext returned only from create/resend responses; repo lookups hash the incoming token first.

- [ ] **Step 1:** Schema + migration (`token_hash` + unique index; backfill existing rows hashing their `token`).
- [ ] **Step 2:** Update admin-tutor create/resend/revoke + invite verify/claim + seeds.
- [ ] **Step 3:** Update existing invite tests (assert stored value is hashed).
- [ ] **Step 4:** Commit: `fix(invite): store invite tokens hashed (M10)`.

### Task 4.5: Escape admin userNote (M11)

**Files:**
- Modify: `packages/api/src/modules/admin-booking/admin-booking.service.ts:316-318`
- Test: unit — `<script>` in userNote is escaped in the composed notification body.

**Interfaces:**
- Consumes: `escapeHtml` from `lib/sanitize.ts`.

- [ ] **Step 1:** Wrap `input.userNote` in `escapeHtml`; audit other raw interpolations reaching notification bodies (achievement eventName).
- [ ] **Step 2:** Commit: `fix(admin-booking): escape userNote in notifications (M11)`.

### Task 4.6: Support/notification/room/achievement validation lows (L2-L5)

**Files:**
- Modify: `packages/api/src/modules/support/support.service.ts:54-77` (bookingId ownership for all categories)
- Modify: `packages/api/src/modules/notification/notification.types.ts:7` + `notification.repo.ts:231` (ISO cursor + `(createdAt,id)` tie-break)
- Modify: `packages/api/src/modules/room/room.types.ts:11-29` (`endAt > startAt` + future)
- Modify: `packages/api/src/modules/achievement/achievement.types.ts:8` (`z.iso.datetime()`)
- Modify: `packages/api/src/modules/tutor/tutor.types.ts:10` (prices record cap: keys `[1-6]`, ≤ 6 entries)
- Test: unit per change.

- [ ] **Step 1-5:** Implement each; add tests.
- [ ] **Step 6:** Commit: `fix(validation): tighten support, notification, room, achievement, tutor inputs (L2-L5)`.

---

## PR 5 — Meeting & Email Reliability

### Task 5.1: Make meeting retry live (M12)

**Files:**
- Modify: `packages/db/src/schema/booking.ts` (`meetingEvent.retryAttempts`) + migration
- Modify: `packages/api/src/modules/meeting/google-meeting.provider.ts:589-608` (no clobber; record failure)
- Modify: `packages/api/src/modules/booking/booking.service.ts:2408-2426,2490-2518` (keep CONFIRMED on failure; retry job increments attempts; fall back to manual after 3)
- Test: unit + integration — failed create leaves `google_meet/failed` row; retry job promotes it; after 3 attempts → manual + SCHEDULED.

**Interfaces:**
- Produces: `meetingEvent.retryAttempts` (int default 0); fallback wrapper no longer rewrites `google_meet/failed` → `manual`; `retryFailedMeetings` increments attempts and only falls back to manual at `>= 3`.

- [ ] **Step 1:** Schema + migration for `retry_attempts`.
- [ ] **Step 2:** Rework the fallback wrapper + `finalizeMeetingSchedule` (failure → stay CONFIRMED, no link, notified).
- [ ] **Step 3:** Rework `retryFailedMeetings` (attempt increment, manual fallback at 3).
- [ ] **Step 4:** Update job tests; commit: `fix(meeting): make meeting retry job live with attempt limits (M12)`.

### Task 5.2: OAuth refresh inside the breaker + token cache (M13)

**Files:**
- Modify: `packages/api/src/modules/meeting/google-meeting.provider.ts:452-455` (+ refresh function, token cache)
- Test: unit — refresh failure trips the breaker; cached token reused within expiry.

**Interfaces:**
- Produces: module-level cached access token `{ token, expiresAt }`; refresh inside `googleMeetBreaker.execute`.

- [ ] **Step 1:** Implement cache + move refresh inside the breaker.
- [ ] **Step 2:** Update provider tests; commit: `fix(meeting): cache OAuth tokens and protect refresh with circuit breaker (M13)`.

### Task 5.3: Atomic outbox claim + Resend idempotency (M14)

**Files:**
- Modify: `packages/api/src/modules/notification/notification.repo.ts` (claim)
- Modify: `packages/api/src/modules/notification/notification.service.ts:229-267`
- Modify: `packages/api/src/modules/email/resend-email.provider.ts` (Idempotency-Key header)
- Test: unit — two concurrent claims return one row; duplicate send prevented.

**Interfaces:**
- Produces: `claimQueuedDispatch(tx, limit)` — conditional `UPDATE ... SET status='sending' WHERE id IN (SELECT ... WHERE status IN ('queued','failed') FOR UPDATE SKIP LOCKED LIMIT n) RETURNING *`; Resend requests carry `Idempotency-Key: dispatch-{id}`.

- [ ] **Step 1:** Implement claim + dispatch state machine ('sending' rows recovered when stale > 10 min).
- [ ] **Step 2:** Add Idempotency-Key to Resend calls.
- [ ] **Step 3:** Update outbox tests; commit: `fix(notification): atomic outbox claim and resend idempotency (M14)`.

### Task 5.4: Timeout nits (L1)

**Files:**
- Modify: `packages/api/src/modules/meeting/google-meeting.provider.ts:89-100,428-433`

- [ ] **Step 1:** Wrap service-account `events.get` poll in `withTimeout`; `clearTimeout` in `withTimeout`'s `finally`.
- [ ] **Step 2:** Commit: `fix(meeting): add poll timeout and clean up timers (L1)`.

---

## PR 6 — Uploads

### Task 6.1: Presigned POST with size bound (M9)

**Files:**
- Modify: `packages/api/src/lib/storage.ts:86-98` (+ POST policy signing)
- Modify: `packages/api/src/modules/upload/upload.types.ts` + `upload.service.ts` (response shape)
- Modify: `apps/server/src/routes.ts` (authenticated dev upload handler with size bound)
- Test: unit — POST policy contains `content-length-range` 1..5MB and content-type condition; signature validates.

**Interfaces:**
- Consumes: S3 SigV4 POST policy (R2-compatible).
- Produces: `getSignedUploadUrl` returns `{ url, fields }` (policy + signature) with `content-length-range`; dev mode returns a server upload URL handled by an authenticated, size-bounded route.

- [ ] **Step 1:** Write failing unit test for the policy shape.
- [ ] **Step 2:** Implement POST policy signing; update service/type output; add dev route.
- [ ] **Step 3:** Update upload tests; commit: `fix(upload): presigned POST with content-length-range (M9)`.

---

## Verification (end of every PR)

```bash
bun run check-types
bun run lint
bun test --env-file apps/server/.env packages/api/src/tests/ apps/server/src/openapi.test.ts
```

End of branch: full suite + `bun run test:coverage` gates + server boot smoke + endpoint walkthrough (throwaway script, not committed).

### Version Notes

- v1.0 (2026-08-15): Created from the 2026-08-15 full-backend review (correctness + security) of HEAD `7e9ff5c`. All findings verified in code; cross-checked against PRD-GAPS-PHASE3 (U1/U3/U4/U11), BACKEND-CLEANUP (completed), DEFERRED-OPS-TASKS, and `.superpowers/sdd/` ledgers.
