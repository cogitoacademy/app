# Backend Finalization — PRD Alignment + Production Readiness Fixes

| Field      | Value                                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Status     | Active (implementation)                                                                                                                                |
| Created    | 2026-08-25                                                                                                                                             |
| Branch     | `finalize/backend-prod-readiness`                                                                                                                      |
| Depends on | PRD v1.7 (`docs/prd.tex`), PRD-AUDIT gap list (10 documented gaps), audit wave (2 review workers, 44 findings), PRODUCTION-READINESS spec (Phases 0/1) |
| Scope      | Backend code fixes + docs alignment only. No frontend feature work.                                                                                    |

This plan consolidates the **documented gaps** (from `docs/superpowers/plans/2026-08-25-backend-production-readiness.md`, Tasks 2–11) with the **undocumented findings** from the 2026-08-25 two-worker audit, and aligns the codebase with **PRD v1.7** (the correctness source of truth). All changes are test-first, follow the 4-layer architecture, and update docs in the same PR (AGENTS.md rule 11).

**Findings provenance:**

- Documented gaps 1–10: `docs/plans/active/PRD-AUDIT.md` (committed on `fix/backend-prod-readiness`, folded into this branch).
- Audit findings F1–F30 (worker `audit-api`, `wt-audit-api/WORKER-REPORT.md`) and S1–S14 (worker `audit-server`, `wt-audit-server/WORKER-REPORT.md`). **All HIGH/MEDIUM findings were independently re-verified against code by the lead before planning**; F7 was downgraded to NOTE (see Task 11 rationale).

## Global Constraints

- Import from `@cogito-app/*` workspace packages only.
- Follow the 4-layer architecture: Router → Handler → Service → Repository.
- All new behavior needs tests; `packages/api` coverage gate is 100% lines (CI-enforced).
- Docs follow code (AGENTS.md §11): `docs/CONTEXT.md`, `docs/MODULE-REFERENCE.md`, `docs/API-REFERENCE.md`, `docs/RUNBOOK.md`, `docs/plans/` updated in the same PR.
- oRPC facts: HTTP paths are procedure keys with slashes (`/rpc/booking/createSolo`); request bodies `{"json": <input>}`; responses `{"json": <data>, "meta": [...]}`.
- Tests: `bun run test` in `packages/api` (script `bun ../../scripts/run-test-suite.mjs api`); typecheck `bun run check-types` at root; lint `bun run lint` at root.
- Commit style: Conventional Commits; commit after each task's green test run.
- Do NOT touch: `apps/web` (except nothing in this plan), `packages/ui`, payment-provider internals beyond what a task specifies.

---

## Part A — Documented gaps (Tasks 2–11 from the superpowers plan, restated in repo convention)

### Task 2: Email-verification gate — paid actions require verified email

**Files:**

- Modify: `packages/api/src/procedures.ts` (add `requireVerifiedStudent` middleware + `verifiedStudentProcedure`)
- Modify: `packages/api/src/modules/booking/booking.router.ts` (use `verifiedStudentProcedure` on the 4 create procedures)
- Modify: `packages/api/src/modules/payment/payment.router.ts` (use `verifiedStudentProcedure` on `createPurchase`)
- Test: `packages/api/src/tests/unit/verification-gate.test.ts` (new)
- Docs: `docs/CONTEXT.md` (G2 section — state enforcement level), `docs/MODULE-REFERENCE.md` (booking/payment rules), `docs/API-REFERENCE.md` (auth level on the 5 procedures)

**Interfaces:**

- Consumes: `context.session.user` — better-auth session user carries `emailVerified` (verified: `packages/auth/src/index.ts:17`, better-auth session contract). `CogitoUser` type is exported from `@cogito-app/auth`.
- Produces: `requireVerifiedStudent` middleware — same contract as `requireStudent` but additionally throws `ORPCError("FORBIDDEN", { message: "Email verification required" })` when `context.session.user.emailVerified !== true`; `verifiedStudentProcedure = publicProcedure.use(requireVerifiedStudent)`.

- [ ] **Step 1: Write the failing test** — `packages/api/src/tests/unit/verification-gate.test.ts`: (a) unverified student `createSolo` → rejects `ORPCError` FORBIDDEN; (b) verified student `createSolo` → passes gate (tutor-not-found domain error, not FORBIDDEN). Use `signUpAndSignIn` + `db.update(user).set({ emailVerified: true })` from `tests/helpers/test-client.ts` (existing pattern at `email-verification-g2.test.ts:63`).
- [ ] **Step 2: Run test — expect FAIL** (no gate exists).
- [ ] **Step 3: Implement** the middleware in `procedures.ts` (after `requireStudent`, ~line 60).
- [ ] **Step 4: Apply** to the 4 booking-create procedures (`booking.router.ts` lines ~36/150/162/173 — `createSolo`, `createGroup`, `createSeries`, `createGroupSeries`) and `payment.createPurchase` (`payment.router.ts:7`). Check for existing tests that create bookings with unverified users; mark them verified in setup.
- [ ] **Step 5: Run full `packages/api` test suite — PASS**; fix any test that relies on unverified paid access.
- [ ] **Step 6: Update docs** (CONTEXT G2 section, MODULE-REFERENCE booking/payment, API-REFERENCE procedure rows).
- [ ] **Step 7: Commit** `fix(auth): gate paid actions on email verification`

### Task 3: Escape user-supplied reason in `withdrawInvite` email body

**Files:**

- Modify: `packages/api/src/modules/booking/booking.service.ts:2558-2560` (notification body)
- Test: extend `packages/api/src/tests/unit/booking.service.test.ts` (or the `booking-reprice-deadline.test.ts` neighbor — follow the file's existing notification-port spy pattern)
- Docs: `docs/MODULE-REFERENCE.md` (booking module — note the escaping convention)

- [ ] **Step 1: Write failing test** — call service `withdrawInvite` with `reason: "<script>alert(1)</script>"`, assert notification body contains `&lt;script&gt;` and not raw `<script>`.
- [ ] **Step 2: Run — FAIL** (raw interpolation, verified `booking.service.ts:2558-2560`).
- [ ] **Step 3: Fix** — wrap `reason` in `escapeHtml(reason)` (already imported at `booking.service.ts:51` from `../../lib/sanitize`).
- [ ] **Step 4: Run tests — PASS**.
- [ ] **Step 5: Commit** `fix(booking): escape withdraw reason in notification email`

### Task 3: Harden the Sanity content file proxy

**Files:**

- Modify: `apps/server/src/routes.ts:353-417` (add host allowlist, timeout, size cap, rate limit)
- Modify: `apps/server/src/rate-limit-paths.ts` (add `"content"` RateLimitKind)
- Test: `apps/server/src/` — extend the existing routes test (find the harness that mocks `content.getStudentResourceFile`; see `apps/server/src/` test files)
- Docs: `docs/CONTEXT.md` (content section), `docs/RUNBOOK.md`

- [ ] **Step 1: Write failing tests** — (a) `fileUrl` host not on `cdn.sanity.io`/`*.sanity.io` → 502, no upstream fetch; (b) upstream fetch exceeding 10s timeout → 502; (c) response with `content-length` > 5MB → 502; (d) streamed body exceeding 5MB → 502. Follow the existing routes-test harness.
- [ ] **Step 2: Run — FAIL** (bare `fetch(file.fileUrl)` at `routes.ts:389`).
- [ ] **Step 3: Implement** — allowlist check, `AbortController` + 10s timeout, `MAX_PROXY_BYTES = 5 * 1024 * 1024` pre-check via `content-length` AND streaming counter via `ReadableStream` wrapper.
- [ ] **Step 4: Add rate limit** — `"content"` kind in `rate-limit-paths.ts` (`urlPath.startsWith("/content/student-resources/")`); wire `contentRateLimit` (30/min window 60s, keyPrefix `content`) mirroring the `authRateLimit` pattern in `routes.ts:39`.
- [ ] **Step 5: Run tests + `bun run typecheck` — PASS**.
- [ ] **Step 6: Docs** (CONTEXT content section, RUNBOOK behavior note).
- [ ] **Step 7: Commit** `fix(content): harden Sanity file proxy (allowlist, timeout, size cap, rate limit)`

### Task 4: Reconcile `getTutorPayouts` ledger columns

**Files:**

- Modify: `packages/api/src/modules/booking/booking.service.ts:3315-3381` (`getTutorPayouts`)
- Test: extend `packages/api/src/tests/unit/booking.service.test.ts` (payouts test)
- Docs: `docs/MODULE-REFERENCE.md` (payouts section), `docs/API-REFERENCE.md` (payouts output semantics)

- [ ] **Step 1: Write failing test** — new-economy snapshot `baseline: 100, actualMarksPooled: 102`; assert returned `totalMarks === cogitoTake + tutorPayout` (currently `102 !== 100`). Also assert `tutorPayoutIdr === tutorHonorariumIdr` sum (F4).
- [ ] **Step 2: Run — FAIL** (known gap #4 confirmed + F4).
- [ ] **Step 3: Fix** — accumulate `totalMarks` from `baseline` (not `actualMarksPooled`) in all three branches; keep `tutorPayout`/`tutorPayoutIdr` semantics, document them.
- [ ] **Step 4: Document the rounding surplus** in MODULE-REFERENCE: "`totalMarks` reports the split basis (`baseline`); students may be charged `actualMarksPooled ≥ baseline` due to per-student rounding (surplus ≤ headcount marks per booking); the surplus is currently unallocated — flagged for product decision (documentation only, per lead decision 2026-08-25)."
- [ ] **Step 5: Run tests — PASS**.
- [ ] **Step 6: Commit** `fix(admin): reconcile tutor payout ledger columns`

### Task 5: Fix escalated admin-queue pagination

**Files:**

- Modify: `packages/api/src/modules/admin-booking/admin-booking.service.ts:480-527` (`listBookings`)
- Test: extend `packages/api/src/tests/unit/admin-booking.service.test.ts`
- Docs: `docs/MODULE-REFERENCE.md` (admin-booking)

- [ ] **Step 1: Write failing test** — seed > MAX_PAGE_LIMIT bookings where few are escalated and sit beyond the first window; call `listBookings({ escalated: true, limit: 10 })`; assert 10 items (or all escalated) and **never** `items.length === 0` with non-null `nextCursor`.
- [ ] **Step 2: Run — FAIL**.
- [ ] **Step 3: Implement** — replace the single-fetch in-memory filter with the bounded window loop (from the superpowers plan Task 6): `MAX_ESCALATED_WINDOWS = 5`, loop fetch → filter → advance cursor until `items.length >= limit || !hasMoreRows`; return `{ items, nextCursor }` with `nextCursor = null` when `items` is empty.
- [ ] **Step 4: Run tests — PASS**.
- [ ] **Step 5: Commit** `fix(admin): fill escalated queue pages and never return cursor with empty page`

### Task 5: Decouple economy-config tutor notifications from the config transaction

**Files:**

- Modify: `packages/api/src/modules/admin/admin.service.ts:295-325` (`updateEconomySettings`)
- Test: extend `packages/api/src/tests/unit/admin.service.test.ts`
- Docs: `docs/MODULE-REFERENCE.md` (admin module economy rules)

- [ ] **Step 1: Write failing test** — mock `notificationPort.write` rejects; assert economy config WAS updated and audit row exists (transaction committed).
- [ ] **Step 2: Run — FAIL** (rollback).
- [ ] **Step 3: Implement** — move the `Promise.all(notification.write(...))` block out of the `db.transaction`, after commit, with `writeBestEffort`-style per-tutor `.catch(log)` (import `log` from `@cogito-app/api/lib/logger`; event key `economy_config_updated:${version}:${tutorId}` stays idempotent).
- [ ] **Step 4: Run tests — PASS**.
- [ ] **Step 5: Commit** `fix(admin): decouple economy-config notifications from config transaction`

### Task 6: Migration rollback documentation (0027/0028)

**IMPORTANT (learned in CI):** drizzle-kit executes each migration file as **one batch** — embedding `-- down` DDL inside the `.sql` file would run the DROP statements immediately after the up-DDL, breaking later migrations (CI failure: `0027` dropped `subject_category` before `0029` ran). Rollback SQL belongs in `docs/RUNBOOK.md` **only**, not in the migration files.

**Files:**

- Docs: `docs/RUNBOOK.md` (rollback procedure section)
- No changes to `packages/db/src/migrations/0027_*.sql` / `0028_*.sql` (verify they contain no `-- down` section)

- [ ] **Step 1: Verify** the migration files contain only up-DDL (no `-- down` section).
- [ ] **Step 2: Docs** — RUNBOOK "Migration rollback" section documents the manual `psql` down statements for 0027 (`DROP TABLE tutor_profile_subject; DROP TABLE subject_category;`) and 0028 (`DROP TABLE economy_config; ALTER TABLE tutor_profile DROP COLUMN IF EXISTS base_rates_idr;`), ordered newest-first.
- [ ] **Step 3: Verify** a scratch-DB migrate applies cleanly: `DATABASE_URL=... bun run db:migrate` → "migrations applied successfully".
- [ ] **Step 4: Commit** `docs(ops): document migration rollback for 0027/0028 (down DDL in RUNBOOK, not in files)`

### Task 7: Scheduler fail-loud boot check + health surface

**Files:**

- Modify: `apps/server/src/scheduler.ts:19-27` (`initScheduler`)
- Modify: `packages/api/src/lib/db-health.ts` (add scheduler check to `/health`)
- Test: `packages/api/src/tests/unit/` or `apps/server/src/` — new exported helper test
- Docs: `docs/RUNBOOK.md`, `docs/CONTEXT.md` (scheduler section)

- [ ] **Step 1: Write failing test** — new exported `checkSchedulerHealth(redis)` helper: mocked Redis ping OK → `"ok"`; throws → `"error"`; no redis → `"degraded"`.
- [ ] **Step 2: Run — FAIL** (helper missing).
- [ ] **Step 3: Implement helper + wire** into `healthCheck` (`checks.scheduler`).
- [ ] **Step 4: Fail-loud boot** — in `initScheduler`, when `SCHEDULER_ENABLED=true`, ping Redis and throw (boot aborts) instead of logging `scheduler_skip`; when disabled, keep the skip log (that's an ops decision, not a defect). Wire the helper's degraded/error states into `/health`.
- [ ] **Step 5: Run tests — PASS**; update the existing `env-xendit`/scheduler tests that assert the old log behavior if needed.
- [ ] **Step 6: Docs** — CONTEXT scheduler section, RUNBOOK boot-failure mode.
- [ ] **Step 7: Commit** `fix(ops): fail loud when scheduler enabled but Redis unreachable; add health check`

### Task 8: Google Meet OAuth helper + RUNBOOK docs

**Files:**

- Create: `scripts/google-meet-auth.ts` (repo-root `scripts/` — exists with `run-test-suite.mjs`)
- Docs: `docs/RUNBOOK.md` (Google Cloud console section), `docs/CONTEXT.md` (auth section)

- [ ] **Step 1: Write the helper script** (from the superpowers plan Task 10 verbatim — OAuth device/loopback flow printing `GOOGLE_MEET_REFRESH_TOKEN`).
- [ ] **Step 2: `bun run type-check` — PASS**.
- [ ] **Step 3: Docs** — RUNBOOK Google Cloud console steps + env annotations.
- [ ] **Step 4: Commit** `feat(ops): add Google Meet OAuth refresh-token helper and docs`

### Task 11: Xendit production switch prep (env + docs only)

**Files:**

- Modify: `apps/server/.env.example`, `infra/.env.prod.example`
- Docs: `docs/RUNBOOK.md` (Xendit go-live checklist)

- [ ] **Step 1: Update env templates** — document `PAYMENT_PROVIDER=xendit`, `XENDIT_SECRET_KEY`, `XENDIT_WEBHOOK_TOKEN`, `XENDIT_SUCCESS/FAILURE_REDIRECT_URL`, `WEBHOOK_ALLOWED_IPS` (with per-field instructions).
- [ ] **Step 2: Write RUNBOOK "Xendit go-live checklist"** (sandbox E2E → signature/IP test → dashboard webhook URL → live small transaction → verify credit + redirects).
- [ ] **Step 3: Commit** `docs(ops): Xendit go-live checklist and env template`

---

## Part B — Undocumented audit findings (verified 2026-08-25)

### Task B1: Fix seed package prices to PRD OQ-01 values (HIGH, F1)

**Files:**

- Modify: `apps/server/src/seed-packages.ts:5-8`, `apps/server/src/seed.ts:47-50`, `packages/api/src/tests/helpers/test-client.ts:141-149`
- Test: `apps/server/src/seed.test.ts` (assert package table matches PRD values)
- Docs: `docs/API-REFERENCE.md` (packages list), `docs/RUNBOOK.md` (seed section)

- [ ] **Step 1: Write failing test** — assert `markPackage` rows match PRD OQ-01: Starter 50 / 312,500; Learner 120 / 690,000; Explorer 200 / 1,070,000; Pioneer **400** / 2,000,000.
- [ ] **Step 2: Run — FAIL** (current: 430,000/990,000/1,570,000/2,180,000 and Pioneer **300**).
- [ ] **Step 3: Fix all three PACKAGES tables** to the PRD values. Verify no code depends on the old numbers (search `1570000`, `2180000`, `marks: 300`).
- [ ] **Step 4: Run tests — PASS**.
- [ ] **Step 5: Docs** — API-REFERENCE package table, RUNBOOK seed note ("re-run `bun run seed` on prod once — onConflictDoNothing keeps existing rows; correct values are required before any real payment").
- [ ] **Step 6: Commit** `fix(seed): align mark package prices with PRD OQ-01`

### Task 9: Prevent admin demotion via tutor invite claim (HIGH, F2)

**Files:**

- Modify: `packages/api/src/modules/invite/invite.service.ts:16-27` (`validateClaim`)
- Test: extend `packages/api/src/tests/unit/invite.service.test.ts`
- Docs: `docs/MODULE-REFERENCE.md` (invite module), `docs/CONTEXT.md` (tutor invite flow — code now matches the documented claim)

- [ ] **Step 1: Write failing test** — an admin-role user calls `claim` with a valid invite token → currently succeeds (demotes); assert it must throw `InviteEmailMismatchError`-class `InvalidRoleForClaimError` (new error, mapped in `invite.errors.ts`) — admin cannot be demoted via invite.
- [ ] **Step 2: Run — FAIL** (no guard; `validateClaim` only checks token/email/profile; `updateUserRole` at `invite.service.ts:96` sets tutor unconditionally).
- [ ] **Step 3: Implement** — in `validateClaim`, fetch the user's role (repo `getUserRoleById` or reuse `auth.me`); throw when `role === "admin"`.
- [ ] **Step 4: Run tests — PASS**.
- [ ] **Step 5: Docs** — MODULE-REFERENCE + CONTEXT.
- [ ] **Step 6: Commit** `fix(invite): block tutor claim on admin accounts (no silent demotion)`

### Task 10: Reconfirm headcount-change reprice (HIGH, F3)

**Files:**

- Modify: `packages/api/src/modules/booking/booking.service.ts:2588-2608` (`reconfirm` accept path)
- Test: `packages/api/src/tests/unit/booking.service.test.ts` or new `booking-reconfirm-reprice.test.ts`
- Docs: `docs/MODULE-REFERENCE.md` (booking module reconfirm rule)

- [ ] **Step 1: Write failing test** — group in `AWAITING_RECONFIRMATION` with 2 of 3 reconfirmed; third participant's decline (or withdraw) changes confirmed headcount to 2; then the last reconfirm accept → assert the booking does NOT go to `AWAITING_TUTOR_REVIEW` with stale pricing; it re-enters `AWAITING_RECONFIRMATION` with a fresh 12h window and repriced per-student (PRD: "If any confirmation changes the headcount again, the system recalculates and reissues the reconfirmation request").
- [ ] **Step 2: Run — FAIL** (current code transitions to tutor review whenever `reconfirmed.length === confirmedCount.length`).
- [ ] **Step 3: Implement** — after each accept, recompute confirmed headcount; compare to the headcount the last reprice used (`b.priceSnapshot` context); if changed, transition to `AWAITING_RECONFIRMATION` + fresh `updateBookingDeadline(now + RESPONSE_WINDOW_MS)` + reprice, instead of `AWAITING_TUTOR_REVIEW`.
- [ ] **Step 4: Run tests — PASS** (watch for existing tests asserting the current behavior — adjust the new contract deliberately).
- [ ] **Step 5: Docs** — MODULE-REFERENCE booking rule.
- [ ] **Step 6: Commit** `fix(booking): reprice and reissue reconfirmation when headcount changes mid-cycle`

### Task 11: Bump deadline when tutorAccept meeting fails (MEDIUM, F6)

**Files:**

- Modify: `packages/api/src/modules/booking/booking.service.ts:1040-1070` (tutorAccept meeting-failure path)
- Test: `packages/api/src/tests/unit/booking.service.test.ts`
- Docs: `docs/MODULE-REFERENCE.md` (booking rule)

- [ ] **Step 1: Write failing test** — tutor accepts online booking; meeting.createEvent fails; assert `deadlineAt` bumped to `scheduledEndAt + 24h` (not left at the old `now+12h`).
- [ ] **Step 2: Run — FAIL** (deadline untouched).
- [ ] **Step 3: Implement** — in the catch block after `finalizeMeetingSchedule` failure, `repo.updateBookingDeadline(tx, bookingId, new Date(b.scheduledEndAt.getTime() + 24h))`. Note: `finalizeMeetingSchedule`'s `meetingResult.status === "failed"` branch returns `{scheduled:false}` — bump the deadline there too (same call, single place).
- [ ] **Step 4: Run tests — PASS**.
- [ ] **Step 5: Docs** — MODULE-REFERENCE booking rule (retry window respected).
- [ ] **Step 6: Commit** `fix(booking): refresh deadline when meeting creation fails so retry window is respected`

### Task 12: Fix outbox claim SQL precedence (MEDIUM, F7 → verified harmless; do NOT parenthesize blindly)

**Files:**

- Verify only: `packages/api/src/modules/notification/notification.repo.ts:185-200`
- Docs: `docs/MODULE-REFERENCE.md` note

Lead verification result: both OR branches carry `attempts < 3`; the precedence issue is real (sending rows with attempts=3 could be claimed) but the 10-minute age + attempts<3 guard makes the actual risk narrow. **Decision: add the parentheses as defense-in-depth; add a regression test asserting `sending` rows with `attempts=3` are never claimed.**

- [ ] **Step 1: Write test** — mock query; assert the SQL predicate excludes `sending` + `attempts >= 3`.
- [ ] **Step 2: Implement** — `WHERE status IN ('queued','failed') AND attempts < 3 OR (status = 'sending' AND attempts < 3 AND created_at < now() - interval '10 minutes')` → parenthesize the whole disjunct.
- [ ] **Step 3: Run tests — PASS**.
- [ ] **Step 4: Commit** `fix(notification): parenthesize outbox reclaim predicate`

### Task 13: Tutor attendance row must not inflate group headcount (MEDIUM, F8)

**Files:**

- Modify: `packages/api/src/modules/booking/booking.service.ts:1743-1791` (`markTutorAttendance`) and `booking.repo.ts` `findConfirmedParticipants` (exclude `role='tutor'`)
- Test: `packages/api/src/tests/unit/booking.service.test.ts`
- Docs: `docs/MODULE-REFERENCE.md`

- [ ] **Step 1: Write failing test** — group booking SCHEDULED; tutor marks attendance (inserts tutor participant row `role:'tutor', confirmationState:CONFIRMED`); `repriceGroupForHeadcount` / `holdAmount` recomputation → assert headcount excludes the tutor row.
- [ ] **Step 2: Run — FAIL** (repro: `findConfirmedParticipants` at `booking.repo.ts:230` does not filter `role`).
- [ ] **Step 3: Implement** — add `ne(bookingParticipant.role, "tutor")` to `findConfirmedParticipants` conditions (keep the existing `excludeUserId` semantics).
- [ ] **Step 4: Run tests — PASS** (verify existing attendance tests unaffected — they don't reprice after attendance).
- [ ] **Step 5: Commit** `fix(booking): exclude tutor row from confirmed-participant headcount`

### Task 14: Flag offline tutor lateness too (MEDIUM, F9)

**Files:**

- Modify: `packages/api/src/modules/booking/booking.repo.ts:702-739` (`findBookingsWithTutorLateness`) — remove `eq(booking.modality, MODALITY.ONLINE)`
- Test: `packages/api/src/tests/unit/booking.service.test.ts` or a repo test
- Docs: `docs/MODULE-REFERENCE.md` (booking module)

- [ ] **Step 1: Write failing test** — offline SCHEDULED booking past start+15min without tutor attendance row → `checkTutorLateness()` flags it (admin queue `tutor_lateness_pending`).
- [ ] **Step 2: Run — FAIL** (modality filter).
- [ ] **Step 3: Implement** — drop the online-only filter (keep the rest: `scheduled`, `startAt < cutoff`, not-flagged, `notExists(tutorAttended)`).
- [ ] **Step 4: Run tests — PASS**.
- [ ] **Step 5: Commit** `fix(booking): flag offline no-show tutors in lateness sweep`

### Task 14: Pass tx to `setManualLink` (MEDIUM, F10)

**Files:**

- Modify: `packages/api/src/modules/meeting/fallback.provider.ts:65-90`, `google-meeting.provider.ts:497+`, `meeting/index.ts`, `booking.service.ts` callers
- Test: `packages/api/src/tests/unit/` meeting fallback tests (existing)
- Docs: `docs/MODULE-REFERENCE.md` (meeting module)

- [ ] **Step 1: Write failing test** — `setManualLink` inside a tx that rolls back → assert no orphan row.
- [ ] **Step 2: Run — FAIL** (writes on global `db`).
- [ ] **Step 3: Implement** — add `conn: DbOrTx` param (mirror `createEvent`'s `conn`), use it for the select/insert/update; update `index.ts` + `admin-booking.service.ts:686` to pass `tx`.
- [ ] **Step 4: Run tests — PASS**.
- [ ] **Step 5: Commit** `fix(meeting): write manual-link rows inside the booking transaction`

### Task 15: `adminRefund` per-payment attribution (MEDIUM, F11)

**Files:**

- Modify: `packages/api/src/modules/admin-booking/admin-booking.service.ts:552-620` (`adminRefund`)
- Test: extend `packages/api/src/tests/unit/admin-booking.service.test.ts`
- Docs: `docs/MODULE-REFERENCE.md` (admin-booking)

- [ ] **Step 1: Write failing test** — two payments P1(100) P2(100); 150 spent (from P1's wallet); refund P1 → current code computes `creditedMarks(200) - totalBalance(50) = 150 spent` → `refundable = 100 - 150 = 0` → throws (wrong; P1's own Marks were fully spent but P2's were not). Assert refund `min(payment.marks, availableBalance)` per-payment instead.
- [ ] **Step 2: Run — FAIL** (FIFO across all payments).
- [ ] **Step 3: Implement** — refund `min(payment.marks, availableBalance)` (available = total − held) with a clear reason; keep the "reject when fully spent" guard per-payment (a payment is fully spent when its event key's credited Marks are gone — the ledger `source_reference` gives per-payment attribution: `sumCompensatedForPayment(paymentId)`).
- [ ] **Step 4: Run tests — PASS**.
- [ ] **Step 5: Docs** — MODULE-REFERENCE + API-REFERENCE refunds section.
- [ ] **Step 6: Commit** `fix(admin): per-payment refund attribution`

### Task 16: Achievement archive action (MEDIUM, F12)

**Files:**

- Modify: `packages/api/src/modules/achievement/achievement.types.ts` (add `archive`/`restore` to `adminReviewInput.status`), `achievement.service.ts` (`adminReview` accept `archived`/`approved`/`rejected` + restore), `achievement.router.ts`
- Test: extend `packages/api/src/tests/unit/achievement.service.test.ts`
- Docs: `docs/MODULE-REFERENCE.md` (achievement), `docs/API-REFERENCE.md` (adminReview input)

- [ ] **Step 1: Write failing test** — `adminReview({status: "archived"})` → success + notification; `archived` → `approved` (restore) → success; PRD moderation states include `archived`.
- [ ] **Step 2: Run — FAIL** (input enum only `approved`/`rejected`).
- [ ] **Step 3: Implement** — widen the enum, allow transitions `approved/rejected → archived` and `archived → approved/rejected` (keep audit + notification), adjust the `AchievementNotEditableError` guard.
- [ ] **Step 4: Run tests — PASS**.
- [ ] **Step 5: Commit** `feat(achievement): support archive and restore moderation states`

### Task 17: Role-scope drifts (LOW, F16–F19)

**Files:**

- Modify: `packages/api/src/modules/auth/auth.router.ts:44-53` (`searchStudents` → `studentProcedure`)
- Modify: `packages/api/src/modules/achievement/achievement.router.ts` (`create`/`update`/`delete` → `studentProcedure`)
- Modify: `packages/api/src/modules/payment/payment.router.ts` (`createPurchase` → `verifiedStudentProcedure` — see Task 2, keep in sync)
- Modify: `packages/api/src/modules/upload/upload.router.ts:6-16` (`createUploadUrl` → keep protected but document)
- Docs: `docs/API-REFERENCE.md`, `docs/MODULE-REFERENCE.md`

- [ ] **Step 1: Write tests per router** — tutor/admin calling `auth.searchStudents`/`achievement.create`/`payment.createPurchase` → FORBIDDEN.
- [ ] **Step 2: Implement** the role guards (except upload — leave `protectedProcedure`, add doc note that any role may mint a bounded upload URL; the tutor proof-file path needs it).
- [ ] **Step 3: Run tests — PASS** (watch `payment.createPurchase` — tutor/admin purchase now blocked; verify the web purchase UI is student-only).
- [ ] **Step 4: Commit** `fix(api): tighten role guards on search, achievements, and purchases`

### Task 18: Apply-override participant validation (LOW, F24) + room state guard (L-22)

**Files:**

- Modify: `packages/api/src/modules/admin-booking/admin-booking.service.ts:229-284` (`planOverride` — validate all `affectedParticipants` ids are participants; throw `OverrideParticipantNotInBookingError`)
- Modify: `packages/api/src/modules/room/room.service.ts:128-175` (`assignRoom`/`relocateRoom` — guard `AWAITING_ADMIN_ROOM_APPROVAL` before inserting roomBooking row)
- Test: extend the respective service tests
- Docs: `docs/MODULE-REFERENCE.md`

- [ ] **Step 1: Tests** — (a) override with a non-participant id → error, not silent filter; (b) `assignRoom` on non-awaiting booking → no roomBooking row.
- [ ] **Step 2: Implement** both guards.
- [ ] **Step 3: Run tests — PASS**.
- [ ] **Step 4: Commit** `fix(admin): validate override participants and room-assign state`

---

## Part C — PRD alignment matrix (correctness source of truth)

This matrix was produced by the audit (workers A/B) and lead re-verification. It is the deliverable of the "align the codebase with the PRD" goal.

| PRD ref      | Rule                                           | Code path                                                    | Status                                                  |
| ------------ | ---------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------- |
| FR-01        | Role-specific access                           | `procedures.ts` requireAdmin/Student/Tutor + routers         | ALIGNED (role-scope drifts F16–F19 fixed in Task 17)    |
| FR-02        | Student profile + parent contact               | `auth.updateProfile`                                         | ALIGNED                                                 |
| FR-03        | Wallet total/held/available + immutable ledger | `wallet` module                                              | ALIGNED                                                 |
| FR-04        | Package purchase                               | `payment` module                                             | **MISMATCH → fixed Task 8 (seed prices)**               |
| FR-05        | Honoraria validation + schedules               | `pricing.validateBaseRates` + `admin.updateEconomySettings`  | ALIGNED                                                 |
| FR-06        | Tutor listing w/ computed Marks                | `tutor-discovery`                                            | ALIGNED                                                 |
| FR-07        | Solo booking lifecycle                         | `booking.createSolo/cancel/complete`                         | ALIGNED                                                 |
| FR-08        | Group finalization                             | `createGroup/confirmInvite/expireBookings`                   | ALIGNED (+F3 fix Task 10)                               |
| FR-09        | Tutor ops tools                                | `tutorActions`                                               | ALIGNED                                                 |
| FR-10        | Admin monitor/override                         | `adminBooking`                                               | ALIGNED                                                 |
| FR-11        | Competition Calendar auth                      | `content.listCompetitions`                                   | ALIGNED                                                 |
| FR-12        | KB 35-Mark gate                                | `wallet.knowledgeBankEligible` (student-only, total balance) | ALIGNED                                                 |
| FR-13        | History preservation                           | audit + ledger retention                                     | ALIGNED                                                 |
| FR-14        | H-2 cancel/reschedule policy                   | `cancel`/`proposeReschedule`                                 | ALIGNED                                                 |
| FR-15        | Tutor reschedule proposal                      | `proposeReschedule`/`acceptReschedule`                       | ALIGNED                                                 |
| FR-16        | Group deadline repricing                       | `expireBookings` B3                                          | ALIGNED (+F3)                                           |
| FR-17        | Notification matrix                            | `notification` module                                        | ALIGNED (+F5 escape, F7 outbox)                         |
| FR-18        | Achievements submission/mod                    | `achievement` module                                         | ALIGNED (+F12 archive Task 16)                          |
| FR-19        | IDR honorarium                                 | `tutor.updateMyProfile` + pricing                            | ALIGNED                                                 |
| FR-20        | Series up to 4                                 | `createSeries`/`createGroupSeries`                           | ALIGNED                                                 |
| FR-21        | Meeting link after confirm                     | `finalizeMeetingSchedule`                                    | ALIGNED (+F6 deadline Task 11)                          |
| FR-22        | Offline room approval                          | `room` module                                                | ALIGNED (+F22/F23 Task 18)                              |
| FR-23        | Invite-only tutor access                       | `adminTutor` + `invite`                                      | ALIGNED (+F2 Task 9, F15 verified)                      |
| FR-24        | Onboarding publication gate                    | `tutor.submitForReview` + admin review                       | ALIGNED (+F25 Task 19 — see below)                      |
| DL-04..DL-29 | Decision log                                   | (each checked)                                               | ALIGNED except OQ-01 (F1, Task 8)                       |
| OQ-04        | SLA 30min/4h                                   | `support` module                                             | ALIGNED                                                 |
| OQ-05        | Meet fallback                                  | `meeting` module                                             | ALIGNED                                                 |
| OQ-06        | Non-refundable Marks                           | `adminRefund` in-app only (N1)                               | ALIGNED                                                 |
| OQ-07        | 15-min lateness                                | `markAttendance`/`markParticipantNoShow`                     | ALIGNED (+F9 Task 13)                                   |
| OQ-08        | 12h release                                    | `releaseExpiredHolds`                                        | ALIGNED                                                 |
| TC-01..TC-39 | Regression coverage                            | integration tests                                            | ALIGNED except TC-03 (F1) + TC-18 headcount-change (F3) |

**Known accepted/backlog items (documented, not fixed):** K4 (dead states `draft`/`awaiting_marks_hold` — accepted), K5 (dead `repricedMarks` column — accepted), K6 (`timezone` unused — accepted), L3 (URL-less meeting row copy — defense-in-depth), N8 (`payment.getPurchase` — kept).

### Task 19: `reviewTutorProfile` action-state guard (F25, MEDIUM — same class as F24)

**Files:**

- Modify: `packages/api/src/modules/admin-tutor/admin-tutor.service.ts:139-180` (`reviewTutorProfile` — enforce per-status allowed actions via `validateReviewAction`)
- Test: extend `packages/api/src/tests/unit/admin-tutor.service.test.ts`
- Docs: `docs/MODULE-REFERENCE.md` (admin-tutor rules)

- [ ] **Step 1: Write failing test** — `publish` from `suspended` → error; `request_changes` from `published` → error.
- [ ] **Step 2: Run — FAIL** (currently no state-machine guard).
- [ ] **Step 3: Implement** the transition table (`draft/pending_review/changes_requested/approved_unpublished → published`; `published → request_edit_changes`; etc.) — reuse `validateReviewAction`'s shape.
- [ ] **Step 4: Run tests — PASS**.
- [ ] **Step 5: Commit** `fix(admin-tutor): enforce review-action state machine`

---

## Part D — Docs cleanup (part of the same PR)

- `docs/plans/README.md` — add this plan to the Active index; move `docs/superpowers/specs/2026-08-25-production-readiness-design.md` + `docs/superpowers/plans/2026-08-25-backend-production-readiness.md` to `docs/archive/superpowers/` (repo convention: plans live in `docs/plans/`, superseded docs in `docs/archive/`); update the `PRD-AUDIT.md` provenance line.
- `docs/CONTEXT.md` — G2 section: state enforcement level (paid actions require verified email); scheduler section: fail-loud boot + `/health` scheduler check; content section: proxy allowlist/timeout/size-cap/rate-limit; invite flow: admin-demotion guard now real; known-bugs tables: add new fixed findings (F1..F25, S1..S14) with status.
- `docs/MODULE-REFERENCE.md` — per-task module rule updates (already listed per task).
- `docs/API-REFERENCE.md` — fix the RPC path drift (S1): correct `/rpc/tutorActions/...`, `/rpc/adminBooking/...`, `/rpc/achievement/...` paths (the doc's dotted-name style is fine — add a "paths" note); add per-task procedure auth-level changes (Task 2, 17); remove the stale `x-event-id` webhook header reference if present.
- `docs/RUNBOOK.md` — migration rollback section, Google Cloud console section, Xendit go-live checklist, seed package note.
- `docs/plans/active/PRD-AUDIT.md` — fold in the audit findings + this plan's status (all tasks done → move to `docs/plans/completed/`).

---

## Part E — Verification (exit gate)

- [ ] `bun run test` in `packages/api` — all suites green (2,147+ tests).
- [ ] `bun run type-check` at root — PASS.
- [ ] `bun run lint` at root — PASS.
- [ ] CI on the PR: lint + typecheck + build + test + coverage (100% gate) green.
- [ ] Docs updated in the same PR (Part D checklist complete).
