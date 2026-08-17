# PRD-GAPS Phase 1 Report — G1 (support tickets), G2 (expiry notification), G3 (tutor lateness auto-cancel)

Branch: `feat/prd-gaps-support-lateness` (base main @ 9e20f2a).
Date: 2026-08-12.

## Summary

All three gaps implemented, migrated, tested, and committed. Full API suite is green (**1331 pass / 1 skip / 0 fail**, verified twice) and `bun run check-types` passes. Backend only.

## Commits

| SHA       | Subject                                                    |
| --------- | ---------------------------------------------------------- |
| `55eb589` | `test: fix mock.module leaks breaking the full test suite` |
| `a3e59ce` | `feat(support): add support ticket module (G1)`            |
| `763b5f5` | `feat(booking): notify on booking expiry (G2)`             |
| `2773833` | `feat(scheduler): tutor lateness auto-cancel job (G3)`     |

## G1 — Support ticket module

**Schema/migration:** `packages/db/src/schema/support-ticket.ts` → `support_ticket` table (uuid PK, `reporterId`, `bookingId`, `category`, `description`, `status`, `slaDeadline`, `assignedTo`, `resolution`, timestamps) with CHECK constraints on category/status and indexes on `reporterId`, `bookingId`, `(status, slaDeadline)`. Exported from `schema/index.ts`. Migration `0013_grey_sphinx.sql` generated + applied.

**Module** (`packages/api/src/modules/support/`): `support.types.ts`, `support.errors.ts`, `support.repo.ts`, `support.service.ts`, `support.handler.ts`, `support.router.ts`, `index.ts` — 4-layer, consumer-driven ports (`SupportNotificationPort`, `SupportAuditPort`) inline in `index.ts`, `DbOrTx` everywhere, `DomainError` + `withDomainMap`.

**Procedures** (exposed under `appRouter.support`, paths follow existing `/support/...` + `/admin/support/...` conventions; the brief's `admin.listTickets`/`admin.resolveTicket` map to `support.adminListTickets`/`support.adminResolveTicket` to match the achievement module's admin-sub-procedure pattern):

- `support.createTicket` (protectedProcedure) — validates booking access (proposer/tutor/participant) and the 15-minute rule (`scheduledStartAt + LATENESS_TOLERANCE_MS < now`) for `tutor_late`/`tutor_no_show`; sets `slaDeadline = now + 12h`.
- `support.listTickets` (protectedProcedure) — own tickets only.
- `support.adminListTickets` (adminProcedure) — all tickets sorted by `slaDeadline` ascending (SLA urgency).
- `support.adminResolveTicket` (adminProcedure) — sets `resolved` + `resolution` + `assignedTo`, writes a notification to the reporter (`support.<id>.resolved`) and an audit record.

**Design decisions (documented):**

- `bookingId` is nullable (`ON DELETE SET NULL`) so technical/payment/other tickets don't require a booking; lateness categories require it and enforce the 15-min rule + access check.
- SLA is 12h for all categories (constant `SUPPORT_SLA_MS`, configurable) — the spec only mandates 12h for lateness; non-lateness defaults to the same window.
- Ticket auto-escalation on SLA breach is **not** implemented (no scheduler job was scoped for it in the brief); only the `slaDeadline` is persisted. Flagged as future work.
- Creating a `tutor_no_show` ticket does **not** transition the booking — the state transition belongs to the G3 lateness job. Documented divergence from the G1 acceptance text ("booking status updated"), to avoid duplicating G3.

**Tests:** `unit/support.service.test.ts` (13), `unit/support.handler.test.ts` (5), `integration/support-flow.test.ts` (9: create → list own → SLA-sorted admin list → resolve + notification + already-resolved conflict + access/too-early negatives).

## G2 — Booking expiry notification

The brief claimed `expireBookings` "now works". **It did not**: the state-history insert passed `actor_id = 'system'`, which violates the `booking_state_history.actor_id` FK → every eligible booking failed inside the transaction (caught and counted as `failed`). Fixed in `booking.service.ts` `recordTransition` to store `actorId = null` for `actorType = SYSTEM` (repo signature widened to `string | null`). This is the real remaining G2 bug; the notification was the other half.

- `expireBookings` now writes notifications to the proposer and tutor (`booking.<id>.expired.student` / `.tutor`) with a no-show-specific title for `scheduled → no_show`.
- `releaseExpiredHolds` writes a hold-release notification (`booking.<id>.hold_released_expiry`) as the brief suggested.
- Existing `expireBookings`/`releaseExpiredHolds` unit tests extended with notification assertions + new tests. New `integration/booking-expiry.test.ts` (real DB): createSolo → backdate deadline → `expireBookings()` → assert `expired` state, hold 0, ledger release, student+tutor notifications; same for `releaseExpiredHolds`.

## G3 — Tutor lateness auto-cancel

**State-machine decision: reused `no_show`, no new `auto_cancelled` state.** `scheduled → no_show` already exists in `booking-transitions.ts`, so no state-machine or `booking_state_check` change was needed (minimal-change per brief).

**Attendance modeling decision:** the tutor is **not** a `booking_participant` row today (participants are `proposer`/`invitee` only), so the existing `bookingParticipant.attendanceState` column could not represent tutor attendance. I made the tutor a participant: added `'tutor'` to the `booking_participant_role_check` CHECK (migration `0014_melted_devos.sql`). The lateness job creates (or updates) a `role='tutor'` participant row with `attendanceState='absent'`.

**Job + service:**

- `findBookingsWithTutorLateness` (repo): bookings in `scheduled` state where `scheduledStartAt + 15min < now()` (uses `LATENESS_TOLERANCE_MS`) AND `NOT EXISTS` a tutor participant with attendance in `present/late/absent` (treats "no row" and `unknown` identically).
- `checkTutorLateness()` (service): per booking, in a transaction — release student holds (`releaseAllParticipantHolds`), zero `holdAmount`, upsert tutor participant `attendanceState='absent'`, transition `scheduled → no_show` (system actor), notify proposer (ACTION) and tutor (INFO) with `booking.<id>.tutor_no_show(.tutor)`. Returns `{ autoCancelled, failed }`, per-booking try/catch like `expireBookings`.
- Scheduler: new `check-tutor-lateness.job.ts` (every 5 min, 3 attempts, exponential backoff), added to `SchedulerHandlers` + worker switch in `scheduler.service.ts` + `scheduler/index.ts`, wired in `apps/server/src/scheduler.ts` (`onCheckTutorLateness` + `scheduleCheckTutorLateness`).

**Tests:** `unit/booking.service.test.ts` (4 new `checkTutorLateness` cases), `unit/scheduler.service.test.ts` (2 new job-handler cases), `unit/check-tutor-lateness.job.test.ts` (2), `integration/tutor-lateness.test.ts` (2: auto-cancel path asserting `no_show` + attendance `absent` + hold released + notification; and "already attended" booking is skipped). Integration calls the service directly (not BullMQ) per the brief.

## Migration outcome

- `0013_grey_sphinx.sql` — `support_ticket` table (+ indexes, FK `reporter_id`/`booking_id`/`assigned_to`).
- `0014_melted_devos.sql` — widen `booking_participant_role_check` to include `'tutor'`.
- Both generated via `bun run db:generate` and applied via `bun run db:migrate` successfully; snapshots/journal committed.

## Test results (final, twice)

```
1331 pass / 1 skip / 0 fail  (2738 expect) — packages/api/src/tests/
bun run check-types → all 3 packages pass
```

## Pre-existing issue fixed (separate commit)

The full suite had **13 failures on clean main** caused by `mock.module()` leakage: `db.test.ts`, `db-health.test.ts`, and `google-meeting.provider.test.ts` register process-global module mocks (`postgres`, `drizzle-orm/postgres-js`, `@cogito-app/db`, `@cogito-app/db/schema`) that poisoned every later test file in the same bun process (`db.insert is not a function`, missing schema tables). Fixes:

- `db.test.ts` — removed module mocks; tests the real module.
- `db-health.test.ts` — removed module mocks; `healthCheck` gained an optional injected-db param (backward compatible; production callers unchanged).
- `google-meeting.provider.test.ts` — dropped the unnecessary `@cogito-app/db/schema` mock (kept the `googleapis` mock, which is scoped to meeting code only).

## Files changed

- `packages/db/src/schema/{support-ticket.ts (new), index.ts, booking.ts}`
- `packages/db/src/migrations/{0013_grey_sphinx.sql, 0014_melted_devos.sql (new)}` + meta snapshots/journal
- `packages/api/src/modules/support/*` (7 new files)
- `packages/api/src/modules/booking/{booking.service.ts, booking.repo.ts}`
- `packages/api/src/modules/scheduler/{scheduler.service.ts, index.ts, jobs/check-tutor-lateness.job.ts (new)}`
- `packages/api/src/{services.ts, routers.ts, shared/constants.ts, lib/db-health.ts}`
- `apps/server/src/scheduler.ts`
- Tests: `unit/support.{service,handler}.test.ts`, `unit/check-tutor-lateness.job.test.ts`, `unit/booking.service.test.ts`, `unit/scheduler.service.test.ts`, `unit/db.test.ts`, `unit/db-health.test.ts`, `unit/google-meeting.provider.test.ts`, `integration/{support-flow, booking-expiry, tutor-lateness}.test.ts`, `helpers/test-client.ts`

## Concerns / follow-ups

1. **G1 ticket auto-escalation** is not implemented (only `slaDeadline` persisted). Needs a scheduler job if required by the PRD.
2. **Tutor-attendance marking** (setting `present`/`late` when the tutor actually joins) has no endpoint yet; the lateness job treats "no row / unknown" as unattended, so any tutor who never joins an online `scheduled` booking gets auto-cancelled after 15 min. Adding a "mark attendance" RPC or meeting-join hook is recommended.
3. `scheduled → no_show` reuse means a lateness auto-cancel is indistinguishable from a student no-show in the booking state; the audit trail + notification body + `booking_state_history.metadata.latenessMinutes` disambiguate it.
4. The `healthCheck` optional-param change and the two test-file refactors were required to make the mandated full-suite verification possible; they are behavior-preserving.
5. Full-suite totals (1331) differ from the brief's ~1360 estimate — the brief's expectation predates the pre-existing mock leak and current test count; 0 fail is now achieved.
