# PRD-GAPS Phase 5 — G15 (series disclaimer), G16 (tutor payouts), G17 (notification matrix), G18 (series completion)

Branch: `feat/prd-gaps-payouts-notifications` (stacked on `feat/prd-gaps-meeting-room` → ... → main).

Read the gap specs:

- G15: .superpowers/sdd/BACKEND-HARDENING/gap-G15.md
- G16: .superpowers/sdd/BACKEND-HARDENING/gap-G16.md
- G17: .superpowers/sdd/BACKEND-HARDENING/gap-G17.md
- G18: .superpowers/sdd/BACKEND-HARDENING/gap-G18.md

## Verified code state (facts to build on)

### G15 — Group series no opt-out disclaimer — MOSTLY DONE

- `computeDisclaimer(b)` exists (booking.service.ts:~373): returns `GROUP_SERIES_DISCLAIMER` for `type === series && targetGroupSize > 1`, else null. Applied in `createSeries` response (`{ ...b, disclaimer }`).
- `cancelSession` already rejects group series (`targetGroupSize > 1` → BookingSessionNotCancellableError).
- REMAINING: verify the disclaimer also appears on `get`/`getById` booking responses (check the response mapper at getById — the reviewer noted it's on createSeries; add to getById if missing). Add an integration test if the acceptance tests aren't already covered.

### G16 — Tutor payout calculation

- No payout endpoint exists. `COGITO_TAKE_RATE = 0.2` and `TUTOR_PAYOUT_RATE_IDR = 7000` exist in constants. G19 (extra-take) already landed in PR C — use the booking's stored `priceSnapshot` (has tutorShare/cogitoTake per booking) rather than a flat rate.
- Required:
  - `admin.getTutorPayouts` (adminProcedure): input `{ tutorId, dateFrom?, dateTo? }` → `{ completedSessions, totalMarks, cogitoTake, tutorPayout, tutorPayoutIdr? }`
  - `tutor.getMyPayouts` (tutorProcedure): same, scoped to `session.user.id`
  - Only COMPLETED bookings count. Sum `priceSnapshot.tutorShare` + `priceSnapshot.cogitoTake` from completed bookings in range.
  - Payout calc: use the per-booking `priceSnapshot.tutorShare` (already correct post-G19) — NOT a flat `total × (1-rate)`; document that the stored snapshot is authoritative.
  - `tutorPayoutIdr = tutorPayout × TUTOR_PAYOUT_RATE_IDR` (the constant exists — check its intended use; if ambiguous, include it as an informational field).
- Repo: need a query for completed bookings by tutor + date range — add to tutor repo or a new payout query (read `packages/api/src/modules/tutor/tutor.repo.ts` and `tutor.service.ts`; the tutor module has no booking access — may need a port or query in the tutor repo that joins booking. Check how tutor-discovery or booking repos query by tutorId).

### G17 — Full notification matrix (event-level email routing) — LARGEST

- Current: `EMAIL_SUPPORTED_CATEGORIES` (booking/payment/refund/schedule/override) + severity >= action gates email (notification.service.ts:85-176). This is too coarse: "achievement" category events in booking category could email when they shouldn't.
- Required per PRD matrix: per-event email decision. Implementation approach:
  1. Add `emailRequired?: boolean` to `NotificationWriteParams` (default false).
  2. In `writeInternal`, email when `emailRequired === true` AND severity >= action AND emailPort exists — replacing/augmenting the category-level set. Keep the category check as a backstop for safety (email only if category in the supported set too, OR define the supported set to include all email-capable categories).
  3. Update the notification call sites to set `emailRequired` per the PRD matrix:
     - booking request created → tutor: **email true** (booking.service createSolo/createGroup/createSeries — check current severity; likely ACTION)
     - booking accepted/declined → student: **email true** (tutorAccept/tutorDecline notify proposer)
     - meeting link created → tutor + confirmed students: **email true** (tutorAccept meeting path)
     - student cancel before H-2 → affected: **email true** (cancel path)
     - late cancel / no-show / override → affected: **email true** (cancel late path, expireBookings no_show, admin override)
     - reschedule proposed/approved → affected: **email true** (proposeReschedule/acceptReschedule/rejectReschedule)
     - group repricing → all current participants: **email true** (G4 repricing notifications)
     - payment/refund → payer: **email true** (payment module — check if payment writes notifications; if not, document)
     - achievement submitted/reviewed → **email false** (achievement module — currently writes NO notifications at all! Per PRD, achievement events are in-app only. Add in-app notifications for achievement create/review WITHOUT email — check achievement.service.ts)
     - reminders/non-critical → **email false** (expire/release notifications are INFO severity — keep email false)
  4. "Account created" (signup) → email true: check auth module — likely no notification; document as deferred if wiring auth notifications is large, OR add a minimal one.
- `dispatchStatus` was removed (dead code). The email dispatch happens synchronously in writeInternal — keep that.
- Tests: unit test the email routing decision (emailRequired true+action → queued; achievement → in-app only); integration test asserting a booking-accept notification row + dispatch row exists.

### G18 — Series session completion

- `completeSession` currently REJECTS series (`booking.service.ts:748`). `bookingSession` table has per-session `currentState` (scheduled/completed/cancelled/no_show/late_cancelled) + `holdAmount` (perSession) + `priceSnapshot`.
- Series holds: ONE wallet hold for `totalMarks` (= perSession × N sessions), participant.heldAmount = totalMarks, booking.holdAmount = totalMarks. Sessions each store `holdAmount: perSession`.
- Required: `booking.completeSession` for series → new flow:
  1. Validates: booking is series, session exists, session start passed, session not already completed/cancelled.
  2. Sets session state → completed.
  3. Deducts this session's funds: the tutor's share accrues... For series, decide the deduction model. PRD says "Deducts held funds for this session". Options:
     a. On each session completion, deduct `perSession` from the student wallet (like solo) — reduces the held amount.
     b. Keep the full hold until all sessions complete, then deduct everything at the end.
     Prefer (a) with a release of the remainder: on session completion, `wallet.deduct(tx, amount: perSession)` from proposer wallet (student), decrement participant.heldAmount + booking.holdAmount by perSession. When all sessions completed: transition booking → COMPLETED, release remaining hold (0 after all deducts).
  4. Notifies both parties per session; final notification on booking completion.
  5. Attempt to complete future session → rejected (session.scheduledStartAt > now → error). Already-completed → rejected.
- Check `listSessions` exists (yes) — add sessionId input to completeSession for series (extend `completeSessionInput` with optional `sessionId`).

## Architecture patterns (MUST follow)

- 4-layer per module; DbOrTx; DomainError + withDomainMap; bounded zod; consumer-driven ports.
- Notification call sites: follow the existing `notification.writeBestEffort({ db, userId, bookingId, category, severity, title, body, eventKey })` pattern and ADD `emailRequired`.
- Read `packages/api/src/modules/notification/` fully before G17.
- Read `packages/api/src/modules/booking/booking.service.ts` series + completeSession parts before G18.

## Tests (real DB)

- G15: integration — create group series → response disclaimer; getById includes disclaimer; cancelSession rejected.
- G16: integration — completed solo+group bookings → admin.getTutorPayouts sums correct tutorShare/cogitoTake; tutor.getMyPayouts scoped; cancelled bookings excluded.
- G17: unit — email routing decision table; integration — booking-accept notification + dispatch row; achievement notification in-app only (no dispatch row).
- G18: integration — complete session 1 of 3 → session completed + perSession deducted; all 3 → booking completed + remainder released; future session rejected; double-complete rejected.
- Run full suite at the end: `REDIS_URL=redis://localhost:6379 bun test --env-file apps/server/.env packages/api/src/tests/ apps/server/src/openapi.test.ts` — expect 0 fail (currently 1519).

## Constraints

- Conventional commits per gap: `feat(booking): series disclaimer on booking responses (G15)`, `feat(payout): tutor payout calculations (G16)`, `feat(notification): event-level email routing per PRD matrix (G17)`, `feat(booking): series session completion (G18)`.
- Backend only. No frontend.
- G17: keep the existing `emailRequired` default false so nothing emails unexpectedly; only opt-in call sites email.
- Do NOT break existing notification call sites' signatures (add optional param).
