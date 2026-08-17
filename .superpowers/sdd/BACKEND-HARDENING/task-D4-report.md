# Task D4 — Broaden integration coverage (room, refund, achievement, admin-override)

## Status

DONE — 4 modules covered with real-Postgres happy-path integration tests. Full integration dir is regression-clean. One minor service return-value staleness observed in `adminBooking.applyOverride` (documented below, NOT fixed per task constraints).

## Files changed

- **New:** `packages/api/src/tests/integration/room-flow.test.ts` (7 tests)
- **New:** `packages/api/src/tests/integration/refund-flow.test.ts` (3 tests)
- **New:** `packages/api/src/tests/integration/achievement-flow.test.ts` (5 tests)
- **Modified:** `packages/api/src/tests/integration/admin-override.test.ts` (+4 happy-path tests in a new `Admin Override happy path` describe)

No production code touched. `oxfmt --write` applied to all four files.

## How the tests seed state

All files follow the existing harness: `resetDatabase()` in `beforeAll`, real `db` from `@cogito-app/db` (Postgres localhost:6767), `signUpAndSignIn` + `setUserRole(role, "admin"/"tutor")` for role-bearing sessions, and `createTestClient(await createTestContext(cookie))` re-fetched **after** the role change so the ORPC `requireAdmin`/`requireTutor` middleware sees the promoted role (this was the one subtle footgun — a context captured before `setUserRole` carries a stale `student` role).

Admin-session pattern (mirrors `audit-on-setrole.test.ts`):

```ts
const res = await signUpAndSignIn(email, "Test1234!", name);
const ctx = await createTestContext(res.cookie);
await setUserRole(ctx.session!.user.id, "admin");
adminClient = createTestClient(await createTestContext(res.cookie));
```

Published tutors are seeded via direct `tutorInvite`/`tutorProfile`/`availabilitySlot` inserts (same as `booking-solo.test.ts`).

## What was tested per module

### room-flow.test.ts (7 tests)

Seeds: admin + 2 students (wallet 200 each) + 2 published tutors with modality `both` (offline-capable).

1. Admin `room.create` → `room` row with `isActive: true`.
2. Student1 offline `booking.createSolo` → `awaiting_tutor_review`, hold > 0.
3. Tutor1 `acceptBooking` (offline) → `awaiting_admin_room_approval` (realistic state for room assignment).
4. Student2 creates a same-slot offline booking with tutor2 (allowed — different tutor, no booking-slot conflict).
5. Tutor2 accept → `awaiting_admin_room_approval`.
6. Admin `room.assign` on booking1 → `roomBooking` row `status: "confirmed"`, `startAt`/`endAt` round-trip.
7. Conflicting assign of the same room to booking2 over the same overlapping slot → rejects (`/already booked/i`, `RoomBookingConflictError` → `CONFLICT`); booking2 unchanged (`awaiting_admin_room_approval`), no `roomBooking` row written.

### refund-flow.test.ts (3 tests)

Seeds: admin + student (wallet 200) + payer (wallet 0).

1. Admin `refund.createCorrection` (`compensate_credit`, 25) → wallet 200→225, ledger `compensate_credit` entry (actor `admin`, before 200 / after 225), `refundRecord` row with `paymentId: null`, `marks: 25`, `actorId: adminId`, and `audit_log` `correction_compensate_credit` with exact before/after balance snapshots.
2. `refund.listCorrections` returns only compensating entries.
3. **adminRefund happy path:** payer purchases `starter` via `services.payment.createIntent` + stub `confirmFromWebhook(PAID)` (paymentRecord PAID, marks 50) → `adminBooking.adminRefund` → payment `REFUNDED`, ledger `compensate_credit` (amount 50, `sourceReference: paymentId`), wallet 50→100, `refundRecord` with `paymentId`, `audit_log` `admin_refund` with before/after states.

Note on "paid booking": bookings themselves never create `payment_record` rows in this codebase — payments exist only for mark-package purchases (`modules/payment`). The adminRefund flow operates on a PAID `paymentRecord` (`admin-booking.service.ts:232-288`), so the "paid booking" from the brief is realized as a paid purchase on a real user wallet.

### achievement-flow.test.ts (5 tests)

Seeds: student + admin.

1. Student `achievement.create` → row `pending`, `version 1`, `userId` set.
2. `achievement.list` returns the pending row.
3. Admin `adminReview` approve → `approved` + `adminNote`, `audit_log` `achievement_approved` (actor admin, `details.previousStatus: pending`).
4. Admin `adminReview` reject on a second achievement → `rejected`, `audit_log` `achievement_rejected`.
5. `adminList` filtered by status returns the right rows for `approved`/`rejected`.

Note: the brief mentions "approve → approved + **notification**"; the achievement module writes an audit log only, no notification (verified — no notification write in `achievement.service.adminReview`). The test asserts the audit trail, which is the observable side effect.

### admin-override.test.ts (+4 happy-path tests)

Seeds: admin + student (wallet 200) + published online tutor; student creates a solo booking → `awaiting_tutor_review`, hold 42 (default solo price; observed 50 with profile price), participant `heldAmount` > 0.

1. `applyOverride({ category: "force_cancel", marksAction: "release_holds", affectedParticipants: [studentId] })` → booking DB row `cancelled` / `previousState: awaiting_tutor_review` / `holdAmount: 0` / `stateReason` set / `overrideMeta.category: force_cancel`.
2. `bookingStateHistory` row: `fromState awaiting_tutor_review → toState cancelled`, actorType `admin`, actorId admin, `metadata.category force_cancel`.
3. Wallet impact: student `heldBalance 0`, `availableBalance 200` (restored), ledger `release` entry with `eventKey override.release.{bookingId}...`, actor `admin`, afterBalance 200.
4. Second override on the now-terminal booking rejects (guard `TERMINAL_STATES`).

## Test results

```
bun test --env-file apps/server/.env packages/api/src/tests/integration/room-flow.test.ts \
  packages/api/src/tests/integration/refund-flow.test.ts \
  packages/api/src/tests/integration/achievement-flow.test.ts \
  packages/api/src/tests/integration/admin-override.test.ts
23 pass / 0 fail / 116 expect() calls

bun test --env-file apps/server/.env packages/api/src/tests/integration/
104 pass / 10 skip (redis-real without REDIS_URL) / 0 fail / 360 expect() calls — full dir regression clean

bun run check-types  →  Tasks: 3 successful, 3 total
```

Postgres `localhost:6767` and Redis `localhost:6379` both reachable. Redis primitives suite skips because `REDIS_URL` is unset in `apps/server/.env` (pre-existing, unchanged).

## Concerns

1. **`applyOverride` returns a stale snapshot for `holdAmount`** (`admin-booking.service.ts:97-203`): the method returns `updateResult.updated` — the row produced by `updateBookingWithOverride`, which runs **before** `updateBookingHoldAmount(tx, id, 0)`. The DB row is correctly zeroed (`hold_amount = 0`, verified directly), but the return value still shows the pre-release `holdAmount` (observed 50). Cosmetic, not data corruption — callers that trust the returned `holdAmount` after a `release_holds`/compensate override get a stale number. Would be a clean one-line fix (re-read the booking after the marks action or return `{...updated, holdAmount: 0}`), left for the controller per "do NOT modify production code".
2. **"Paid booking" realization** for adminRefund is a mark-package purchase, since bookings don't create `payment_record`s — documented above so the brief intent isn't lost.
3. Achievement approval writes no notification (audit log only) — matches current production, noted in case the PRD expects one.
4. `resetDatabase()` truncates shared tables and the integration dir runs files sequentially by default; parallel across files could interleave resets (pre-existing pattern, not introduced here).
