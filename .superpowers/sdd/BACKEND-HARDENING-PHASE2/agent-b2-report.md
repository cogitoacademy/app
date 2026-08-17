# Agent B2 — Backend Hardening Phase 2 Report

**Worktree:** `/Users/miapalovaara/cogito/wt-money` (branch `fix/prd-money-correctness`)
**Date:** 2026-08-14
**Commit range:** `4d8d682..83b5845` (10 commits, all local, never pushed)

## Status: DONE

---

## Global Constraints (adopted verbatim)

- Import from `@cogito-app/...` package paths; modules use `../../lib`, `../../shared`, `../../procedures`.
- 4-layer pattern (Router → Handler → Service → Repository); consumer-driven ports for cross-module deps.
- `DbOrTx` (`packages/api/src/lib/tx.ts`) used for all transaction-scoped operations.
- `DomainError` + `withDomainMap` used for all error paths (no new bare throws; existing `mapBookingError`/`mapRoomError` reused).
- Bounded zod (`.max()`, `.min()`, `.int()`); new `createGroupSeriesInput` fully bounded.
- Conventional commits (`fix`/`feat`/`refactor`/`test`/`style`) — one per green step, each verified with `check-types` + `lint` + targeted tests.

---

## Per-task status

### Task 5.1 — Group deadline repricing headcount branch in `expireBookings` (B3/FR-16/TC-18) — DONE

**Changes** (`booking.service.ts`):

- In `expireBookings`, per-booking tx now first checks `AWAITING_PARTICIPANT_CONFIRMATION && confirmed.length >= MIN_GROUP_HEADCOUNT && confirmed.length < targetGroupSize`; when true it:
  - calls the shared `repriceGroupForHeadcount(tx, b, confirmed, ACTOR_TYPE.SYSTEM)` (settles each participant to the final per-student rate and `holdAmount = perStudent × confirmed`),
  - advances `deadline_at` by `RESPONSE_WINDOW_MS` (12h),
  - transitions `AWAITING_PARTICIPANT_CONFIRMATION → AWAITING_RECONFIRMATION` (legal per transitions table),
  - writes per-participant `deadline_reprice.{userId}` notifications with `emailRequired: true`, then `return`s (skips the expire/release path).
- Groups with headcount `< 2` (and all other states) keep the existing expire + `releaseAllParticipantHolds` behavior.

**Tests:**

- New `booking-reprice-deadline.test.ts` (2 tests): 3-of-5 group reprices to `awaiting_reconfirmation` (holdAmount 120 = 3×40, each participant held 40, deadline advanced ~12h, notifications with `severity: action`); 1-of-5 group still expires with holds released.
- `scheduler-expiry.test.ts` unchanged — verified no existing test asserted the old 3-of-5-expires behavior (the "mapping applied" test seeds solo bookings only).

### Task 5.4 — Group-series creation (B8/FR-20, TC-24/25) — DONE

**Changes:**

- `booking.types.ts`: new `createGroupSeriesInput` (extends series shape with `targetGroupSize: int 2-6`, `inviteeUserIds: 1-5`).
- `booking.repo.ts`: new `findUsersByIds` (invitee registration validation).
- `booking.service.ts`: new `createGroupSeries` service method — validates invitees are registered, computes per-session per-student price via `computeSplit`, holds the proposer's full package up front (`perSession × sessionCount`), creates the booking in `AWAITING_PARTICIPANT_CONFIRMATION` with `targetGroupSize > 1`, inserts invitee participants (`PENDING`), per-session rows (`holdAmount = perSession`), sends invitation notifications whose body includes `GROUP_SERIES_DISCLAIMER` (G15/TC-25), and returns the booking with `disclaimer` computed.
- **P1-8 per-participant deduct on completion**: `completeSeriesSession` now branches on `targetGroupSize > 1` and deducts each confirmed participant's per-session share (per-participant `wallet.deduct` + `heldAmount` decrement + booking `holdAmount` decrement), with a residual-release sweep on series completion. Solo-series path unchanged.
- Invitee accept/decline reuses the existing `confirmInvite`/`declineInvite` (their `isGroupSeries` branch already holds the full package per invitee and settles proposer holds correctly).
- Handler + router route `POST /booking/group-series/create` (idempotency-key supported).

**Tests:**

- Integration (`booking-group-series.test.ts`): 3-person/3-session creation with proposer upfront package hold (120), per-session `holdAmount = 40`, disclaimer in invite notification; invitee confirm holds full package (120) + headcount increments; full confirm → tutor accept → each completed session deducts per participant (final total 380 = 500−120, held 0, booking `completed`).
- Unit (`booking.service.test.ts`): `createGroupSeries` rejects unknown invitees; creates with package hold, 3 participants, 2 sessions, correct notifications + disclaimer.

### Task 5.5 — `cancelSession` post-H2 forfeit (B9/TC-30) — DONE

**Changes** (`booking.service.ts`):

- `cancelSession` no longer throws `BookingCancellationDeadlinePassedError` on post-H2 cancel. It now deducts the session `heldAmount` (forfeit, eventKey `booking.{bookingId}.session.{sessionId}.forfeit`, reason "Session cancelled after cancellation deadline (forfeit)"), cancels the session, decrements holds, and returns `{ cancelled: true, sessionId, forfeited: isLate }`. Pre-H2 path unchanged (release).
- Removed the now-unused `BookingCancellationDeadlinePassedError` import from the service (class kept in `booking.errors.ts` + error map + error tests).

**Tests:**

- Integration (`booking-g5.test.ts`): replaced the "rejected inside H-2" test with a forfeit test asserting `forfeited: true` and `totalBalance −= session hold` / `heldBalance −= session hold`.
- Unit (`booking.service.test.ts`): pre-H2 result now `{cancelled, sessionId, forfeited: false}`; new TC-30 forfeit test asserting `wallet.deduct` with the forfeit eventKey and no `release`.

### Task 5.7 — Bound reason inputs + HTML-escape (M5) — DONE

**Changes:**

- `booking.types.ts`: new `cancelBookingInput` and `declineBookingInput` bounding `cancellationReason`/`reason` to `.max(500)`.
- `booking.router.ts`: cancel and tutor-decline routes now use the bounded schemas (moved out of inline `.extend`), removed unused `z` import.
- `lib/sanitize.ts`: added exported `escapeHtml(value)` (escapes `&<>"'`).
- `booking.service.ts`: `tutorDecline` notification body now wraps the user-supplied reason in `escapeHtml`. Audited other booking notification bodies — no other user-input interpolation exists (the rest interpolate constants/numbers).

**Tests:**

- `sanitize.test.ts`: `escapeHtml` cases (metachars, ampersand/apostrophe, safe text, no raw `<script>`).
- `validation-bounds.test.ts`: 501-char `cancellationReason`/decline `reason` rejected.
- `booking.service.test.ts`: decline body HTML-escaped.

### Task 6.3 — Meeting event lifecycle (FR-21/OQ-05/G12) — DONE

**Changes:**

- `meeting.types.ts`: `MeetingPort` gains `updateEvent(bookingId, { startAt, endAt })` and `cancelEvent(bookingId)`.
- `google-meeting.provider.ts`: implements both via `events.update`/`events.delete` for the service-account path and `PUT`/`DELETE` (with OAuth token refresh) for the OAuth path, routed through the existing circuit breaker; `findLiveProviderEvent` picks the newest non-failed/non-cancelled `google_meet` row; `cancelEvent` also marks the local row `cancelled`. Both are best-effort (never throw).
- `fallback.provider.ts`: `updateEvent` is a pure no-op (manual links can't be auto-moved); `cancelEvent` marks the local row `cancelled` (no external event).
- `booking/index.ts`: `BookingMeetingPort` extended.
- `booking.service.ts`: `acceptReschedule` calls `meeting.updateEvent` after the schedule is committed (post-tx); `cancel`, `tutorDecline`, `expireBookings`, and `checkTutorLateness` call `meeting.cancelEvent` after their transactions commit. `computeMeetingInfo` treats `cancelled` status as pending so a cancelled meeting no longer surfaces a stale link.

**Tests:**

- Unit (`google-meeting.provider.test.ts`): updateEvent moves start/end via `events.update`; no-op without a live event; cancelEvent calls `events.delete` + marks row cancelled; fallback update no-op / cancel marks local row. Also `booking.service.test.ts`: acceptReschedule calls `updateEvent` with the new times; cancel/tutorDecline/expireBookings call `cancelEvent`.
- Integration (new `meeting-lifecycle.test.ts`): tutor accept creates a meeting row; booking cancel marks the meeting event `cancelled` and GET reports `meetingStatus: pending` with no URL.

### Task 6.4 — `applyOverride` stale holdAmount (P1-5) — DONE

**Changes** (`admin-booking.service.ts`): `applyOverride` now `await`s the tx, then re-reads the booking via `repo.findBookingById(db, …)` and returns the refreshed record (post-override `holdAmount`), instead of returning the pre-update `updateResult.updated`.

**Tests** (`admin-override.test.ts`): existing happy-path test now asserts the response `holdAmount === 0` (matches post-override DB value).

### Task 6.5 — Offline room email notifications (P1-3) — DONE

**Changes:**

- `room/index.ts`: new `RoomNotificationPort` (consumer-driven into notification module); `RoomBookingPort` extended with `getBookingRecipients`.
- `booking.service.ts`: new `getBookingRecipients(tx, bookingId)` returning `{ tutorId, participantUserIds }` (tutor + confirmed participants), exported on the service.
- `room.service.ts`: `notifyBookingRecipients` helper writes `emailRequired: true` in-app+email notifications (category `booking`, severity `action`) to tutor + confirmed students on `assignRoom` (confirmed), `relocateRoom` (relocated), and `cancelRoomBooking` (cancelled); deduped userIds.
- `services.ts`: `createRoomModule({ db, bookingPort, notificationPort: notification.service })` (room wiring line only).

**Tests:**

- Unit (`room.service.test.ts`): assign/relocate/cancel each notify tutor + confirmed students with `emailRequired` and correct eventKey prefixes.
- Integration (`room-g14.test.ts`): assign + relocate produce `Offline session confirmed`/`Offline session relocated` notifications for tutor1 + student1; cancel path covered by the existing flow.

---

## Verification

- `bun run check-types` — 3/3 tasks pass.
- `bun run lint` — 0 errors (56 pre-existing warnings; all warnings in changed code match existing repo patterns).
- Full suite (`REDIS_URL=redis://localhost:6380 bun test --env-file apps/server/.env.test.local packages/api/src/tests/ apps/server/src/openapi.test.ts`): **1596 pass / 1 skip / 0 fail** (baseline at fork: 1566 pass / 1 skip / 0 fail; +30 tests, 0 failures).

## Deviations

- **Task 5.4** — Reused the existing `confirmInvite`/`declineInvite` for group-series accept/decline instead of adding dedicated `confirmGroupSeriesInvite`/`declineGroupSeriesInvite` methods; the existing flows already handle the series-group branch (full-package hold, proposer excess-release target) and are gated by `AWAITING_PARTICIPANT_CONFIRMATION` + `role === "invitee"`. No behavior gap.
- **Task 6.3** — `cancelEvent`/`updateEvent` are invoked after the DB transaction commits (best-effort), rather than inside it, to avoid a partial-commit edge case where a Google failure (or later tx rollback) would leave the local meeting row marked cancelled without a cancelled booking.
- **Task 6.3** — Fallback (manual-link) `cancelEvent` marks the local `meeting_event` row `cancelled` (the task's "Manual links no-op" is interpreted as no external-provider action); `updateEvent` remains a pure no-op for manual links.
- **Task 5.1** — For a group-series in `AWAITING_PARTICIPANT_CONFIRMATION` at deadline, `repriceGroupForHeadcount` returns early (it guards `type === group`), so holds are not headcount-repriced for series; the booking still moves to `AWAITING_RECONFIRMATION` with the 12h window. This matches the plan's instruction to reuse `repriceGroupForHeadcount`; series repricing is out of scope.

## Concerns

- `apps/web/src/routeTree.gen.ts` was regenerated by the `bun run check-types` web build during this session; it is not in my owned file list, so I restored it to HEAD (working tree is clean).
- `BookingCancellationDeadlinePassedError` is retained in `booking.errors.ts` and its error-map/test entries, but is no longer thrown by any service path (kept for API-surface compatibility).
- New tests/lines introduce the same `no-await-in-loop` / `consistent-function-scoping` warnings already pervasive across the booking/room test suites (warnings only; oxlint config treats them as non-blocking).
