# PRD-GAPS Phase 5 — G15/G16/G17/G18 — Implementation Report

Branch: `feat/prd-gaps-payouts-notifications` (stacked on `feat/prd-gaps-meeting-room` → main)

## Summary

All four gaps implemented, tested against the real Postgres + Redis (localhost:6767/6379), and committed. Final suite: **1547 pass / 0 fail** (baseline 1519), `bun run check-types` passes, `oxlint` 0 errors.

## G15 — Group series no opt-out disclaimer (mostly verify + test)

- Verified `computeDisclaimer` already applied in **both** `createSeries` (`booking.service.ts`) and `getById` (`booking.service.ts`, `disclaimer: computeDisclaimer(b)`).
- `cancelSession` already rejects group series (`targetGroupSize > 1` → `BookingSessionNotCancellableError`) — covered by existing G5 tests.
- **Added** integration test in `booking-g5.test.ts`: "group series get response includes the disclaimer (G15)" — seeds a group series, calls `booking.get`, asserts `disclaimer === GROUP_SERIES_DISCLAIMER`. Unit coverage already existed.

## G16 — Tutor payout calculation

**Decision — calc model:** stored per-booking `priceSnapshot` (G19-correct `tutorShare`/`cogitoTake`) is authoritative; **no** flat `total × (1-rate)` recomputation. For a completed **series** booking, the per-session `priceSnapshot` rows are summed (a completed 3-session series pays out all 3 sessions); a series with no completed session rows falls back to its booking-level snapshot. `tutorPayoutIdr = round(tutorPayout × TUTOR_PAYOUT_RATE_IDR)` (7000 IDR/Mark), included as an informational field.

- **Endpoints:**
  - `POST /rpc/admin.getTutorPayouts` (adminProcedure): `{ tutorId, dateFrom?, dateTo? }` → `{ completedSessions, totalMarks, cogitoTake, tutorPayout, tutorPayoutIdr }`. Only `completed` bookings count; date range filters on `scheduledStartAt`.
  - `POST /rpc/tutor.getMyPayouts` (tutorProcedure): same, scoped to `session.user.id`.
- **Architecture:** booking module owns the query (`findCompletedBookingsByTutor` in `booking.repo.ts`) and exposes `getTutorPayouts` via a new **consumer-driven `BookingPayoutPort`** in `booking/index.ts`. Admin and tutor modules consume it (mirrors the existing wallet/refund/notification port pattern). `services.ts` reordered so `booking` is created before `admin`/`tutor`.
- **Tests:** `booking-payout-g16.test.ts` (real DB): full solo flow (create→accept→complete) + seeded completed group, cancelled (excluded), completed series w/ 2 completed sessions → admin sums (4 sessions, 300 marks, cogitoTake 60, payout 240, IDR 1,680,000), date-range filter, `tutor.getMyPayouts` scoped + excludes other tutors.

## G17 — Full notification matrix (event-level email routing) — LARGEST

**Decision — routing model:** added `emailRequired?: boolean` (default **false**, opt-in) to `NotificationWriteParams`. `writeInternal` dispatches email only when `emailRequired === true` **AND** `severity ∈ {action, critical}` **AND** category is in the `EMAIL_SUPPORTED_CATEGORIES` backstop **AND** `emailPort` + recipient email exist. In-app notifications remain the source of record for all events.

**Call-site mapping per the PRD matrix** (`booking.service.ts` unless noted):

| Event                                                                                     | emailRequired              | severity change                                                                                                    |
| ----------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Booking request created → tutor (solo/group/series)                                       | true                       | series added missing tutor notification                                                                            |
| Group/series invitation → invitees                                                        | true                       | —                                                                                                                  |
| Booking accepted/declined → student                                                       | true                       | declined INFO→ACTION                                                                                               |
| Meeting link ready → tutor + confirmed participants (online path)                         | true                       | new notifications                                                                                                  |
| Student cancel / late cancel → tutor + affected participants                              | true                       | INFO→ACTION; group/series participants notified                                                                    |
| Reschedule proposed / accepted / rejected                                                 | true                       | rejected INFO→ACTION                                                                                               |
| Group repricing → participants                                                            | true                       | INFO→ACTION                                                                                                        |
| Admin override → affected                                                                 | true                       | (admin-booking.service.ts)                                                                                         |
| No-show (expireBookings) → student + tutor                                                | true (noShow)              | INFO→ACTION conditional                                                                                            |
| Tutor no-show auto-cancel → student                                                       | true                       | —                                                                                                                  |
| Achievement submit/review                                                                 | false (in-app only)        | achievement module gained in-app notifications (category `achievement`, INFO, no email)                            |
| Expire/release reminders, session completed, series session completed, support resolution | false (INFO)               | —                                                                                                                  |
| Payment/refund → payer                                                                    | **documented as deferred** | payment & refund modules write **no** notifications today — no email wired (per brief, documented not implemented) |
| Account created (signup)                                                                  | **documented as deferred** | auth module writes no notifications; wiring auth is large — deferred per brief                                     |

**Achievement module:** added `AchievementNotificationPort` (writeBestEffort); `create` → "Achievement submitted", `adminReview` → "Achievement approved/rejected" to the owner. No `emailRequired` → in-app only; the `achievement` category is also outside the email backstop set (double protection).

**Tests:**

- Unit (`notification.service.test.ts`): updated existing dispatch tests to pass `emailRequired: true`; added a decision-table block — true+action→dispatched & status sent; default-false+action→no email; true+info→no email; true+achievement→no email (backstop); achievement in-app only.
- Unit (`achievement.handler.test.ts`): submit/review write in-app notification w/o email.
- Integration (`notification-email-g17.test.ts`): booking request → tutor notification + dispatch row (tutor email); booking accept → student notification + dispatch row + tutor "Meeting link ready" dispatch; achievement submit → notification row **without** dispatch row; session completed (INFO) → no dispatch row.

## G18 — Series session completion

**Decision — deduct model (option a per brief):** on each session completion, `wallet.deduct` the session's `holdAmount` (= perSession) from the proposer (student) wallet, decrement `participant.heldAmount` and `booking.holdAmount` by the same amount, and mark the session `completed`. When all sessions are completed → `transition` booking `SCHEDULED → COMPLETED`, zero out the hold (remainder is 0 after all deducts), and emit a final "Series completed" notification to both parties. Per-session notifications go to both student and tutor.

- **Endpoint:** `POST /rpc/tutor/booking/complete` extended — `completeSessionInput` gains optional `sessionId`. `booking.completeSession(bookingId, tutorId, sessionId?)`: non-series bookings keep the existing solo/group flow untouched.
- **Validation:** series + `sessionId` required (`BookingSessionRequiredError`), session exists & belongs to booking (`BookingSessionNotFoundError`), session state `scheduled` (else `BookingStateTransitionError`), `scheduledStartAt` passed (else new `BookingSessionNotStartedError`), booking in `SCHEDULED`.
- **New errors:** `BookingSessionRequiredError`, `BookingSessionNotStartedError` (mapped to BAD_REQUEST).
- **Repo:** `booking.repo.completeSession(sessionId)` sets `currentState = completed`.
- **Tests:**
  - Unit (`booking.service.test.ts`): replaced the "series → BookingNotEditableError" test with: series w/o sessionId → `BookingSessionRequiredError`; completing session 1 of 3 → perSession deducted (amount 50), session completed, participant/booking holds decremented, booking stays `scheduled`, 2 notifications; last session → `transition` to `completed`, hold 0, 4 notifications; future session → `BookingSessionNotStartedError`; double-complete → `BookingStateTransitionError`.
  - Unit (`booking.handlers.test.ts`): handler passes `sessionId` through.
  - Integration (`booking-series-g18.test.ts`): 3-session series, accept → `scheduled`, 150 held; future session rejected; session 1 completed → session `completed`, wallet held 100, booking.holdAmount 100, participant.heldAmount 100; double-complete rejected (CONFLICT); sessions 2+3 → booking `completed`, held 0, remainder released; per-session + final notification rows exist.

## Files changed

- `packages/api/src/modules/booking/booking.service.ts` — G16 payout, G17 call sites, G18 completeSession rework
- `packages/api/src/modules/booking/booking.repo.ts` — `findCompletedBookingsByTutor`, `completeSession`
- `packages/api/src/modules/booking/booking.errors.ts` — `BookingSessionRequiredError`, `BookingSessionNotStartedError`
- `packages/api/src/modules/booking/booking.types.ts` — `completeSessionInput.sessionId`
- `packages/api/src/modules/booking/booking.handler.ts` — pass `sessionId`
- `packages/api/src/modules/booking/index.ts` — `BookingPayoutPort`
- `packages/api/src/modules/notification/notification.service.ts` — `emailRequired` gate
- `packages/api/src/modules/admin/{service,handler,router,types,index}.ts` — `admin.getTutorPayouts`
- `packages/api/src/modules/tutor/{service,handler,router,types,errors,index}.ts` — `tutor.getMyPayouts`
- `packages/api/src/modules/admin-booking/admin-booking.service.ts` — override emailRequired
- `packages/api/src/modules/achievement/{service,index}.ts` — in-app notifications + port
- `packages/api/src/services.ts` — composition reorder + ports
- Tests: `booking-g5.test.ts`, `booking-payout-g16.test.ts` (new), `notification-email-g17.test.ts` (new), `booking-series-g18.test.ts` (new), `notification.service.test.ts`, `achievement.handler.test.ts`, `booking.service.test.ts`, `booking.handlers.test.ts`

## Concerns

- **Payment/refund + signup email deferred:** per the brief, payment & refund modules write no in-app notifications and the auth module writes none — those PRD email rows (payment→payer, account created) are documented as not yet wired. Wiring them is a follow-up.
- **Meeting-link email:** "meeting link created → tutor + confirmed students" is covered by new in-app notifications (email true) on the online SCHEDULED path; actual meeting calendar invitations are sent separately by the meeting provider to attendees.
- **Email is synchronous best-effort inside `writeInternal`** (existing behavior, kept): a slow/failed provider adds latency/failure-tolerant to the booking transaction; dispatch rows remain the source for retries.
- **INFO events now emailing were bumped to ACTION** (declined, reschedule-rejected, group-reprice, no-show) so the `severity ≥ action` gate admits them — a deliberate consequence of event-level routing.
- **Group cancel notifications** now reach all confirmed participants (not just tutor), matching "affected participants" — new eventKeys `booking.<id>.<state>.<participantId>`.
- `services.ts` construction order changed so `booking` precedes `admin`/`tutor` (they consume its payout port) — no circular deps.

---

## G18 Review Fixes — stale response + residual hold release

Commit: `7a748e4` — `fix(booking): return refreshed booking on partial series completion and release residual holds (G18)`

### Finding (Important): stale response on partial series completion

`completeSeriesSession` returned the original pre-deduct booking row `b` when not all sessions were complete, so the RPC response misreported `holdAmount`/`originalMarks`. **Fix:** after the per-session deduct + participant/booking hold updates, re-read the row via `repo.findBookingById(tx, bookingId)` and return the refreshed row. The all-complete path also now re-reads and returns the refreshed row instead of relying on the pre-transition row.

### Finding (Minor): wallet remainder release on all-complete

`updateBookingHoldAmount(0)` only zeroed the booking field; the wallet was left untouched when hold/session drift left a residual. **Fix:** compute the residual participant hold after the last session deduct (`max(0, participant.heldAmount - session.holdAmount)`); on the all-complete path, if `> 0`, release it from the proposer wallet via the `wallet.release` port with `eventKey: booking.<id>.series-release` (actor tutor, reason "Series completed: released residual hold") and zero the participant's held amount. Only the actually-still-held residual is released.

### Tests

- Unit (`booking.service.test.ts`): partial-completion test now asserts the response `holdAmount` is 100 (decremented) and `wallet.release` is not called; all-complete test asserts response `holdAmount` 0 and no release when no residual; new test asserts a residual hold (participant 60 vs 50) is released (amount 10, `eventKey` series-release, `sourceReference`/`bookingId` `b1`, actor tutor).
- Integration (`booking-series-g18.test.ts`): response `holdAmount` asserted as `2 * perSession` after completing 1 of 3 sessions, `perSession` after session 2, and 0 on the final session (refreshed rows in both partial and all-complete paths).

### Verification

- `bun run check-types` — pass.
- `bun run lint` — 0 errors (34 pre-existing warnings).
- Full suite: **1548 pass / 1 skip / 0 fail** (baseline 1547).
