# PRD-GAPS Phase 4 — Report (G11, G12, G13, G14)

Branch: `feat/prd-gaps-meeting-room` (stacked on `feat/prd-gaps-admin` → ... → main).
Dates: 2026-08-12.

## Summary

Implemented the four Phase 4 gaps backend-only, one commit per gap, on the 4-layer
module architecture (repo / service / handler / router) with DbOrTx transactions,
`DomainError` + `withDomainMap`, and bounded zod inputs. No migrations needed.

Final test run (full suite):

```
REDIS_URL=redis://localhost:6379 bun test --env-file apps/server/.env \
  packages/api/src/tests/ apps/server/src/openapi.test.ts
1516 pass | 1 skip | 0 fail   (baseline was 1489 → +27 new tests)
bun run check-types → 3/3 tasks successful
```

## G11 — Meeting link status on booking GET responses

**What built**

- `booking.service.ts`: module-scope `computeMeetingInfo()` derives a
  frontend-facing `meetingStatus: "pending" | "ready" | "failed"` plus
  `meetingUrl: string | null` from the existing `booking.meeting` relation.
  Mapping: no row / `pending` / `manual` → `pending`; `failed` → `failed`;
  `created` → `ready` + url. `getById` now returns
  `{ ...b, disclaimer, meetingStatus, meetingUrl }`.
- No trigger change: `meeting.createEvent` still fires only on tutor accept
  (online); for groups tutor accept only occurs after full confirmation, so the
  PRD gating is satisfied by construction. Withdrawal post-creation does not
  revoke the link (no revoke path exists).

**Tests**

- Unit: updated two `getById` shape assertions; added `ready` (created) and
  `pending` (manual) mapping cases.
- Integration `meeting-g11.test.ts`: before accept → `pending`/null; after
  accept → meeting row exists (manual provider in test env) → `pending`; row
  flipped to `created`+url → `ready`+url; row flipped to `failed` → `failed`.

**Decisions / notes**

- The raw `meeting` object (incl. `attendeeEmails` after G12) stays in the
  response for back-compat (existing booking-solo test asserts
  `b.meeting.status === "manual"`); the new fields are additive.
- In the test env Google is disabled, so the fallback provider creates a
  `manual` row — the "ready" path is verified by updating the row directly.

## G12 — Google Meet attendee automation (creation)

**What built**

- `meeting.types.ts`: new `MeetingAttendee { email, name? }`; `MeetingPort.createEvent`
  gains a 4th optional `attendees` param. `BookingMeetingPort` mirrored.
- `google-meeting.provider.ts`: `attendees` added to the calendar `insert`
  `requestBody` as `{ email, displayName }`; `attendeeEmails` persisted on the
  `meetingEvent` row in both success and failure paths. Fallback-through wrapper
  forwards attendees.
- `fallback.provider.ts`: accepts attendees and now **also persists**
  `attendeeEmails` (deviation from the brief's "accept + ignore" — see below).
- `booking.repo.ts`: new `findUserEmails(userIds)` repo method.
- `booking.service.ts` `tutorAccept`: gathers tutor + confirmed participant
  emails via `findConfirmedParticipants` + `findUserEmails` and passes them as
  attendees to `createEvent` (online path only, matching where the event fires).

**Tests**

- Unit: `google-meeting.provider.test.ts` asserts `requestBody.attendees`
  contains `{ email, displayName }` (and bare `{ email }` when no name) and the
  persisted `attendeeEmails`; `fallback.provider.test.ts` asserts
  `attendeeEmails` persistence; `booking.service.test.ts` asserts the 4th arg
  with tutor + both confirmed participants.
- Integration `meeting-g12.test.ts`: solo → attendeeEmails = [tutor, student];
  group (2/2 confirmed) → [tutor, proposer, invitee].

**Decisions / notes (deferrals)**

- G12 items 2 & 3 (cancel → remove attendees / cancel event; reschedule →
  update event time) are **deferred**: the meeting port has only `createEvent`
  and there is no event update/cancel method on the Google provider or the
  fallback. Documented as out of scope for this phase, per the brief.
- **Deviation from brief**: the brief said "fallback provider unaffected
  (accept + ignore attendees)", but the G12 integration test requires the
  `meetingEvent` row to have `attendeeEmails` populated after accept, and the
  test env runs without Google creds (fallback provider). Persisting in the
  fallback is a one-line change and keeps the data model consistent; noted as a
  deliberate, test-driven deviation.

## G13 — Offline room availability endpoint

**What built**

- `room.checkAvailability` (protected) exposed: bounded zod input
  `{ roomId, startAt, endAt }`, handler returns `{ available }` using the
  pre-existing `room.service.checkAvailability` (conflict detection against
  confirmed room bookings).
- Router path `/rooms/check-availability`.

**Tests**

- Integration `room-availability-g13.test.ts`: offline booking → tutor accept →
  admin assign → overlapping slot returns `{ available: false }`; a free slot
  returns `{ available: true }`.

**Decisions / notes (scope)**

- MINIMAL scope per the brief: endpoint only. Booking-creation auto-assign /
  auto-approve / "suggest alternatives" (PRD FR-22 items 1–3) is **not**
  implemented — booking creation still sends offline bookings to
  `AWAITING_ADMIN_ROOM_APPROVAL` and admin `room.assign` confirms rooms. This
  is documented as out of Phase-0 scope.

## G14 — Admin room relocate + cancel

**What built**

- `room.relocate` (admin): input `{ bookingId, roomId, startAt, endAt }`.
  Validates the target room exists, requires an active (non-cancelled) room
  booking, conflict-checks the target room (row-locked, excluding this
  booking), marks the current room booking `relocated`, inserts a new
  `confirmed` room booking.
- `room.cancelBooking` (admin): input `{ bookingId }`. Finds the most recent
  active room booking and marks it `cancelled`; the booking continues without a
  room (no booking-state change).
- Repo additions: `findActiveRoomBookingByBookingId`, `updateRoomBookingStatus`;
  new `RoomBookingNotFoundError` mapped to 404.

**Tests**

- Unit `room.service.test.ts`: relocate (room-not-found / no-active-booking /
  conflict / frees old + confirms new) and cancel (no-active-booking / sets
  cancelled).
- Integration `room-g14.test.ts`: 3 rooms, 2 offline bookings. assign room A /
  room B → relocate into occupied room rejected (conflict) → relocate to free
  room succeeds (old `relocated`, new `confirmed`) → cancel room → booking
  remains `awaiting_admin_room_approval` with no active room booking.

**Decisions / notes**

- No booking-state transitions from `room.assign` / `relocate` / `cancel` —
  consistent with existing `assignRoom`, which also does not touch booking
  state (that state transition exists in the transitions table,
  `AWAITING_ADMIN_ROOM_APPROVAL → SCHEDULED`, but is not driven by the room
  module today). Flagged as a follow-up: an "approve room" flow that moves the
  booking to `SCHEDULED` is a candidate for a future phase.
- **Notifications**: the room module has no notification/email port
  (`createRoomModule` takes only `db`), so student notifications on
  approve/relocate/cancel are **not** implemented — documented per the brief.
  Wiring a notification port into the room module (or emitting via the
  booking/admin-booking modules) is a follow-up.
- `booking.roomId` (column exists on booking) is not written by assign/relocate/
  cancel; room assignments live entirely in `room_booking` rows. Consistent with
  pre-existing behavior; noted.

## Files changed

- `packages/api/src/modules/booking/booking.service.ts` (G11 status, G12 attendees)
- `packages/api/src/modules/booking/booking.repo.ts` (findUserEmails)
- `packages/api/src/modules/booking/index.ts` (BookingMeetingPort signature)
- `packages/api/src/modules/meeting/meeting.types.ts` (MeetingAttendee, port)
- `packages/api/src/modules/meeting/google-meeting.provider.ts` (attendees)
- `packages/api/src/modules/meeting/fallback.provider.ts` (persist attendeeEmails)
- `packages/api/src/modules/room/room.{types,errors,service,handler,router,repo}.ts` (G13, G14)
- Tests:
  - `packages/api/src/tests/unit/booking.service.test.ts`
  - `packages/api/src/tests/unit/google-meeting.provider.test.ts`
  - `packages/api/src/tests/unit/fallback.provider.test.ts`
  - `packages/api/src/tests/unit/room.service.test.ts`
  - `packages/api/src/tests/integration/meeting-g11.test.ts` (new)
  - `packages/api/src/tests/integration/meeting-g12.test.ts` (new)
  - `packages/api/src/tests/integration/room-availability-g13.test.ts` (new)
  - `packages/api/src/tests/integration/room-g14.test.ts` (new)

## Commits

1. `feat(meeting): expose meeting link status on booking responses (G11)`
2. `feat(meeting): add Google Meet attendees (G12)`
3. `style: use toSorted in G12 integration test` (lint-cleanup follow-up)
4. `feat(room): expose room availability check (G13)`
5. `feat(room): admin room relocate and cancel (G14)`
6. `style: apply oxfmt to G14 room files` (formatter output)

## Concerns / follow-ups

- G12 cancel/reschedule calendar-event mutation not implemented (port lacks
  update/cancel methods).
- G13 creation-flow auto-assign / alternatives not implemented (endpoint only).
- G14: no student notification on approve/relocate/cancel (no room notification
  port); no booking-state transition out of `awaiting_admin_room_approval`;
  `booking.roomId` unused.
- Fallback provider persists `attendeeEmails` (deliberate deviation from brief).
- Multiple `meeting_event` rows can exist per booking (google-failed + manual
  fallback); the `meeting` one-relation returns an unspecified row — status
  mapping tolerates it but ordering is not deterministic.

---

# Review-fix report (Important 1 — G14, Important 2 — G12)

Date: 2026-08-12. Two commits on top of the Phase 4 work, fixing the two
"important" findings from review-8893ca3..f560fa1.

Final test run after fixes (full suite):

```
REDIS_URL=redis://localhost:6379 bun test --env-file apps/server/.env \
  packages/api/src/tests/ apps/server/src/openapi.test.ts
1519 pass | 1 skip | 0 fail   (was 1516 pass → +3 new regression tests)
bun run check-types → 3/3 tasks successful
```

## Fix 1 — G14: `findActiveRoomBookingByBookingId` treated `relocated` rows as active

**What changed**

- `packages/api/src/modules/room/room.repo.ts`:
  `findActiveRoomBookingByBookingId` predicate changed from
  `ne(status, CANCELLED)` to `eq(status, CONFIRMED)` (docstring updated:
  "relocated and cancelled rows are historical").
- Justification: the only active-assignment state produced by the flow is
  `confirmed` (`assignRoom` and `relocateRoom` both insert `CONFIRMED`; no
  code path creates `requested`). This matches the conflict queries
  (`findRoomBookings` / `findRoomBookingsForUpdate`), which already filter
  `eq(status, CONFIRMED)`. Callers checked in `room.service.ts`:
  `relocateRoom` (only a confirmed assignment may be marked `relocated`) and
  `cancelRoomBooking` (only a confirmed assignment may be cancelled) both
  behave correctly under the tighter predicate.

**Tests added**

- Integration `room-g14.test.ts` (regression, RED before fix — the second
  cancel resolved against the stale `relocated` row instead of rejecting):
  relocate → cancel → second `cancelBooking` rejects with
  `RoomBookingNotFoundError` (`/no active room assignment/i`), and
  `relocate` after cancel is also rejected.

## Fix 2 — G12: non-deterministic `meeting` relation / duplicate `meeting_event` rows

**Root cause**
`createGoogleMeetingProviderWithFallback` inserted a `failed` google row and
then a second `manual` row; the `one` relation returned an arbitrary row, so
G11 status could flip between `failed`/`pending` across reads.

**What changed**

- `packages/api/src/modules/meeting/google-meeting.provider.ts`:
  `createGoogleMeetingProviderWithFallback` no longer inserts a second row.
  When google returns `failed`, the failed row is **updated in place** to
  `provider=manual, status=manual, errorReason=null` (keeps the same
  `id`/`attendeeEmails`/`meetingUrl=null`); the `meeting_manual_created` warn
  log is preserved. A booking now has exactly one `meeting_event` row.
- `packages/api/src/modules/booking/booking.repo.ts`:
  `findBookingWithParticipants` no longer relies on the unordered `one`
  relation; it fetches the newest `meeting_event` explicitly
  (`orderBy createdAt desc, id desc limit 1`) and attaches it as `meeting`.
  This makes reads deterministic even for pre-fix rows that already carry a
  stale `failed` + `manual` pair.
- `packages/db/src/schema/booking.ts`: unchanged in the end — drizzle-orm
  0.45.2 does **not** support `orderBy` on `one` relation configs
  (`RelationConfig` accepts only `relationName`/`fields`/`references`; TS2353
  confirmed by `bun run check-types`). The explicit newest-row read in the
  repo replaces the suggested relation `orderBy`; this is the least-invasive
  correct option given the framework constraint.

**Tests added / updated**

- Unit `google-meeting.provider.test.ts` (RED before fix — the wrapper
  inserted a second row, so `insert` was called twice): the fallback test now
  mocks the `update` chain, asserts `insert` is called exactly once, `update`
  once, and the set values are `{ provider: "manual", status: "manual" }`.
- Unit `booking.repo.test.ts`: `findBookingWithParticipants` tests updated
  for the explicit meeting fetch — attaches the newest meeting row / attaches
  `null` when no row exists (mock gains the `db.select()` chain).
- Integration `meeting-g11.test.ts` (regression, RED before fix — `booking.get`
  returned the older `failed` row): inserts a stale `failed` row (older
  `createdAt`) plus a newer `manual` row, then asserts `booking.get` returns
  the `manual` row, `meetingStatus === "pending"`, `meetingUrl === null`.
- `meeting-g11`/`meeting-g12`/`booking-solo` integration tests still pass
  (row-count semantics unchanged — they assert a single manual row / attendee
  emails, which the fix preserves).

## Commits

1. `fix(room): active room booking predicate excludes relocated rows (G14)`
2. `fix(meeting): deterministic meeting relation ordering (G12)`

## Residual note

The `meeting` `one` relation itself remains unordered (framework limitation);
read determinism is guaranteed by (a) single-row-per-booking going forward and
(b) the explicit newest-row query in `findBookingWithParticipants`. No DB
migration was needed for either fix.
