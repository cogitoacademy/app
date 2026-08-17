# PRD-GAPS Phase 1 — G1 (support tickets), G2 (12h deadline enforcement), G3 (15-min lateness auto-cancel)

Branch: `feat/prd-gaps-support-lateness` (base main @ 9e20f2a).

Read the gap specs:

- G1: .superpowers/sdd/BACKEND-HARDENING/gap-G1.md
- G2: .superpowers/sdd/BACKEND-HARDENING/gap-G2.md
- G3: .superpowers/sdd/BACKEND-HARDENING/gap-G3.md

## Verified code state (facts to build on)

### G2 — MOSTLY DONE, remaining = notification on expiry

- `expireBookings()` IS implemented and now WORKS (fixed by PR D: system actorId → null). It transitions eligible bookings to `expired`/`no_show`/`cancelled`, releases holds, handles series. Scheduler boots (PR C). So G2's core is DONE.
- **Remaining G2 gap:** no notification is written when a booking expires. Add notification writes in `expireBookings` (and ideally `releaseExpiredHolds`) for affected users using the notification service (check how booking.service.ts writes notifications elsewhere, e.g. `deps.notification.write(...)`).

### G3 — attendance + auto-cancel

- `bookingParticipant.attendanceState` column EXISTS (schema booking.ts:154, CHECK allows present/late/absent/unknown). `ATTENDANCE_STATE` consts exist (constants.ts:175-182). But nothing sets/reads it.
- `BOOKING_STATE` has NO `auto_cancelled` state. PRD wants a 15-min lateness auto-cancel. Use existing states where possible: the closest PRD semantics = mark tutor participant attendance `absent`, transition the booking to `no_show` (existing state) or add a new `auto_cancelled` state to the state machine. Prefer minimal: reuse `no_show` for "tutor didn't join" unless the state machine rejects it. Decide and document.
- New scheduler job: `check-tutor-lateness` — every 5 min, find bookings where `scheduled_start_at + 15min < now()` AND tutor participant `attendance_state = 'unknown'`, set `absent`, transition, release holds, notify.

### G1 — new support module (full 4-layer)

- No `support` module, no `supportTicket` table. Build the full module following the codebase patterns:
  - `packages/db/src/schema/support-ticket.ts` + export from `schema/index.ts` + migration via `bun run db:generate`
  - `packages/api/src/modules/support/` with support.types.ts, support.errors.ts, support.repo.ts, support.service.ts, support.handler.ts, support.router.ts, index.ts
  - 4 procedures: `support.createTicket` (protected, student), `support.listTickets` (protected, own), `admin.listTickets` (admin, sorted by SLA urgency), `admin.resolveTicket` (admin)
  - SLA deadline = createdAt + 12h for lateness categories; `slaDeadline` column
  - Business rule: student can report lateness/no-show only if `booking.scheduled_start_at + 15min < now()`

## Architecture patterns you MUST follow (from CONTEXT.md + existing modules)

- 4-layer: router → handler → service → repo. Consumer-driven ports inline in `index.ts`.
- `DbOrTx` from `packages/api/src/lib/tx.ts` (db for reads, tx in transactions).
- `DomainError` subclasses in support.errors.ts, mapped via `withDomainMap()` in handler.
- Bounded Zod schemas: `.max()` on strings, `.refine()` on dates. No unbounded inputs.
- Reference an existing module end-to-end: read `packages/api/src/modules/achievement/` (has admin review flow + createModule) and `packages/api/src/modules/invite/` (public+protected) as templates. Read `services.ts` + `routers.ts` to see wiring.
- Notifications: use the notification service the way booking.service.ts does (`deps.notification.write` or a `NotificationWriteParams` port). Check the exact API in booking.service.ts.
- Scheduler jobs: follow `expire-bookings.job.ts` exactly (upsertJobScheduler, JOB_NAME, REPEAT_INTERVAL_MS). Wire new job in `apps/server/src/scheduler.ts` via a new `scheduleCheckTutorLateness` and add a handler to the `onXxx` callbacks in `createSchedulerService(...)`. Also add the case to the worker switch in `scheduler.service.ts` and to `SchedulerHandlers` interface.

## Migration

- After adding schema, run `bun run db:generate` from repo root, then `bun run db:migrate`. Commit the generated migration.
- For the supportTicket table follow `uuidPrimaryKey` pattern + timestamps.

## Tests (TDD — real DB)

- Add unit tests for support service/repo/handler following existing patterns (fake DbOrTx chain mocks for repo, service tests with mock ports).
- Add integration tests `packages/api/src/tests/integration/support-flow.test.ts`: createTicket → listTickets (own only), admin listTickets sorted by SLA, admin resolveTicket.
- G3: integration test for the lateness job logic (call the service method directly, not via BullMQ): seed a booking with tutor attendance unknown + start_time 20min ago → assert attendance absent + hold released + notification.
- G2: extend scheduler-expiry.test.ts or add assertion that expiry writes a notification.

## Constraints

- Conventional commits per gap: `feat(support): add support ticket module (G1)`, `feat(booking): notify on booking expiry (G2)`, `feat(scheduler): tutor lateness auto-cancel job (G3)`.
- Backend only. No frontend.
- Verify: `bun run check-types`, `bun test --env-file apps/server/.env packages/api/src/tests/` (should be ~1360 pass, 0 fail with REDIS_URL=redis://localhost:6379). Redis + Postgres are up (colima + docker).
- DO NOT modify booking state machine more than necessary. If you add `auto_cancelled`, update booking-state.types.ts + any CHECK constraint in schema + migrations; otherwise reuse `no_show`.
