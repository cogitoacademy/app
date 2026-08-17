# Task D3 — Scheduler job integration tests

## Status

DONE_WITH_CONCERNS — both test files pass, but the expiry test surfaced a **critical production bug** in `expireBookings()` (N1) and the hold-release path leaves `booking_participant.held_amount` stale (N3). Per the task constraint ("tests only — do NOT modify production code"), the tests pin the _actual_ current behavior so the suite stays green and each bug site is documented with real-DB evidence. The assertions that must flip when the production bugs are fixed are listed in "What must change when the bugs are fixed".

## Files changed

- **New:** `packages/api/src/tests/integration/scheduler-expiry.test.ts`
- **New:** `packages/api/src/tests/integration/scheduler-holds.test.ts`

No production code touched. `oxfmt --check` clean on both files.

## How the tests seed state

Both files use the existing harness: `resetDatabase()` in `beforeAll`, `@cogito-app/db` real Postgres, `@cogito-app/api/services` for the service layer, `factories.ts` (`createTestUser`, `createTestWallet`, `getWalletByUserId`) and `createBookingRepo(db)` for direct row inserts.

- `scheduler-expiry.test.ts`
  - Creates a published tutor (direct `tutorInvite`/`tutorProfile`/`availabilitySlot` inserts) + two students with wallets.
  - Main booking: `services.booking.createSolo()` → production path that writes the hold, participant, ledger hold entry and `tutor_request` notification → then backdates `deadline_at` to the past (the `findBookingsExpiringByDeadline` predicate is `deadline_at <= now()`).
  - Additional bookings: `repo.insertBooking` + `repo.insertParticipant` + `services.wallet.hold` seeded in the five other eligible states (`scheduled`, `awaiting_participant_confirmation`, `awaiting_reconfirmation`, `reschedule_proposed`, `awaiting_admin_room_approval`), each with a past deadline and a real wallet hold.
  - Candidate-selection describe: terminal-state + future-deadline bookings to verify they are not picked up.
- `scheduler-holds.test.ts`
  - One student (wallet 300) + one tutor. Three bookings seeded via repo + `services.wallet.hold`: two with past deadlines (`awaiting_tutor_review` 42, `awaiting_participant_confirmation` 100) and one in-window control (deadline `+RESPONSE_WINDOW_MS`, 50).

## What was tested

### scheduler-expiry.test.ts (6 tests)

1. Seed sanity: booking is `awaiting_tutor_review`, hold > 0, deadline in past, wallet holds, one ledger `hold` entry.
2. **N1 pin:** `expireBookings()` returns `{ expired: 0, failed: 1 }`; booking stays `awaiting_tutor_review`, hold not released, no `expired` state-history row. (The intended behavior — transition to `expired`, hold released, ledger `release` entry, withdrawn participant — is _not_ observed because the transaction rolls back.)
3. All five other eligible states also fail to transition; each booking is left in its original state with its original `hold_amount`.
4. Differential: `releaseExpiredHolds()` on the same bookings releases the wallet holds (`held→0`, `available` restored, ledger `release` entries) **while leaving state untouched** — isolating the `expireBookings` failure to the `transition()`/`recordTransition()` step, not the wallet-release machinery.
5. No expiry notification is emitted for the affected user (PRD gap — the task specified "a notification row was created"; production writes none, see concerns).
6. Candidate selection: terminal-state and future-deadline bookings are not selected (`expired: 0, failed: 0`).

### scheduler-holds.test.ts (7 tests)

1. Seed: two overdue holds + one in-window control (held 192 / available 108).
2. `releaseExpiredHolds()` returns `{ released: 2 }`; the two overdue bookings' `hold_amount` zeroed, the in-window control untouched; state unchanged.
3. Wallet: held 50 (only the control remains), available 250, total 300.
4. Ledger: `release` entries exist for the two released bookings, none for the control; actor `system`, amount > 0.
5. Participants of released bookings: `withdrawn_pre_h2`, `withdrawnReason = "Hold released: deadline passed"`, `withdrawn_at` set; control still `confirmed`.
6. **N3 pin:** released participants' `held_amount` is **left stale** (42/100) after the wallet release — `releaseAllParticipantHolds` zeroes the wallet hold but never zeroes `booking_participant.held_amount`.
7. Holds-only sweeper writes no state history; re-run is a no-op (`released: 0`).

## Test results

```
bun test --env-file apps/server/.env packages/api/src/tests/integration/scheduler-expiry.test.ts packages/api/src/tests/integration/scheduler-holds.test.ts
14 pass / 0 fail / 64 expect() calls

bun test --env-file apps/server/.env packages/api/src/tests/integration/
85 pass / 0 fail (10 skip = redis-real without REDIS_URL) — full integration dir regression clean
```

Postgres `cogito-app-postgres` (localhost:6767), Redis `cogito-app-redis-test` (localhost:6379) up. The scheduler service methods take no arguments and don't depend on BullMQ/Redis, so they're called directly on `services.booking` (as `apps/server/src/scheduler.ts:22-23` does).

## Findings (bugs the tests document — NOT fixed, out of scope)

### N1 (critical) — `expireBookings()` can never succeed

`packages/api/src/modules/booking/booking.service.ts:1207` passes `actorId: "system"` to `transition()` → `recordTransition()` → `repo.insertStateHistory()`. `booking_state_history.actor_id` is a hard FK to `user.id` (`packages/db/src/migrations/0000_silly_thunderbolts.sql:409`; schema `booking.ts:197`), so the insert violates the FK and the entire expiry transaction rolls back:
`Failed query: insert into "booking_state_history" ... actor_id ... params: ..., system, system, {}`.

Consequence: the 5-minute `expire-bookings` scheduler job has been failing since it was introduced (d27e478, "expiry sweeper" Phase 4) — bookings never transition to `expired`/`no_show`/`cancelled` and holds are never released by that path. Every attempt logs `expire_booking_failed` and increments `failed`. The same bug would affect **any** future caller that uses `actorId: "system"` with `transition()`/`recordTransition()`.

### N3 (data inconsistency) — participant.held_amount not zeroed on hold release

`releaseAllParticipantHolds()` (`booking.service.ts:189-224`) calls `wallet.release()` (correctly frees the wallet hold and writes a ledger `release`) but `updateParticipantState` only sets `confirmation_state`/`withdrawn_at`/`withdrawn_reason` — `booking_participant.held_amount` keeps its old value (verified 42/100 in this suite). Affects `expireBookings`, `releaseExpiredHolds`, `cancel`, `tutorDecline`, `withdraw`. A later `releaseAllParticipantHolds` on the same participant would attempt `wallet.release` against a zero held balance → `InsufficientBalanceError` → failed sweeper transaction.

### Notification gap (mentioned in the brief)

`expireBookings()`/`releaseExpiredHolds()` write **no notification** (the PRD and the task spec expect an "expired" notification to the affected user). The test asserts the current absence so the suite stays green.

## What must change when the bugs are fixed

These assertions pin the buggy behavior and **must be inverted** once production is corrected:

1. `scheduler-expiry.test.ts` "N1 pin..." → assert `expired ≥ 1`, booking `currentState === "expired"`, `holdAmount === 0`, wallet held 0/available restored, a ledger `release` entry, participant `withdrawn_pre_h2` with `heldAmount 0`, state-history `toState === "expired"`.
2. `scheduler-expiry.test.ts` "every eligible state fails to transition" → assert `scheduled → no_show`, `awaiting_admin_room_approval → cancelled`, others → `expired`.
3. `scheduler-expiry.test.ts` "no expiry notification is emitted" → assert an expiry notification row exists for the user.
4. `scheduler-holds.test.ts` "N3 pin..." → assert `participant.held_amount === 0` after release.

## Concerns

1. **Critical production bug shipped, untested and undetected:** the booking-expiry scheduler is functionally dead. This test suite is the canary; it cannot pass against the _intended_ behavior until `actorId: "system"` is handled (either mapped to `null`/a real system user in `insertStateHistory`, or the FK relaxed). Flagging for the controller to schedule a fix + follow-up test flip.
2. **`participant.held_amount` staleness** affects the same N-bug family and should be fixed together (zero the field in `releaseAllParticipantHolds`).
3. Regression-pin style: tests assert current (buggy) reality rather than PRD intent — the deliberate trade-off to honor "tests must pass" + "don't modify production code". The exact assertions to flip are enumerated above.
4. `resetDatabase()` truncates shared tables; running the whole `integration/` dir in parallel can interleave `resetDatabase` calls across files (pre-existing pattern, not introduced here).
