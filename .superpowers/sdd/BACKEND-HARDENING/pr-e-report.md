# PR E Report — Spec / Docs Sync

**Status:** DONE
**Branch:** `docs/plan-sync`
**Base:** main @ 9e20f2a

## Commits

- `5671c53` — `docs(plans): sync PRD-GAPS-SPEC with verified code state; add G20 scheduler boot` (E1)
- `89d3388` — `docs: sync CONTEXT and DEFERRED-OPS with backend hardening PRs` (E2)

## Files Changed

- `docs/plans/active/PRD-GAPS-SPEC.md` (E1)
- `docs/CONTEXT.md` (E2)
- `docs/plans/active/DEFERRED-OPS-TASKS.md` (E2)

Docs-only. No source code touched. No other plan files modified.

## Task E1 — PRD-GAPS-SPEC.md edits

All "current state" claims verified against code on main before editing:

| Gap | Edit applied                                                                                                                                                                                                                                                                                               | Verification                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| G2  | Current state: 5-min `expireBookings` repeatable job IS wired (`scheduler.ts:86` → `scheduleBookingExpiryCheck`, `expire-bookings.job.ts:4`), gated on scheduler boot (G20). Added "Notification sent when booking expires — remaining gap" to acceptance tests.                                           | `expire-bookings.job.ts:4` `REPEAT_INTERVAL_MS = 5*60*1000`; `scheduler.ts:86` schedules it                           |
| G5  | Current state: H-2 window IS enforced on whole-booking cancel (`booking.service.ts:391-398` → `LATE_CANCELLED`); real gap is per-session `cancelSession`.                                                                                                                                                  | Verified `LATE_CANCEL_THRESHOLD_MS` logic at `booking.service.ts:391-398`; no `cancelSession` exists                  |
| G7  | Current state: no `_sessionNote` column; dead `sessionNote` input on `completeSessionInput` (`booking.types.ts:107`) discarded by handler (`booking.handler.ts:300-315` passes only `input.bookingId`).                                                                                                    | Verified `completeSessionInput` has `sessionNote`; handler calls `booking.completeSession(input.bookingId, ...)` only |
| G8  | Current state: pagination FIXED by PR #28 — `listBookingsByState` consumes cursor (`admin-booking.repo.ts:31-33`); urgency/SLA/filters still missing.                                                                                                                                                      | Verified `gt(booking.id, cursor)` in `admin-booking.repo.ts:31-33`                                                    |
| G11 | Current state: link created on **tutor accept** (`booking.service.ts:440+` `tutorAccept` → `meeting.createEvent`), not confirmation; gating satisfied by state machine; gap = placeholder UX.                                                                                                              | Verified `tutorAccept` creates event at `booking.service.ts:440-473`                                                  |
| G14 | Current state: `room.assign` exists as approve-equivalent (`room.router.ts:29`, `room.handler.ts:25`); relocate/cancel missing.                                                                                                                                                                            | Verified `room.assign` route + handler                                                                                |
| G19 | Added status note: IMPLEMENTED by BACKEND-HARDENING PR C (task C7); original bug description retained as historical reference, labeled "(as of v1.2)".                                                                                                                                                     | Confirmed via `task-C7-report.md` (commit 607b8c2)                                                                    |
| G20 | NEW. "Scheduler never boots" — `initScheduler()` defined (`scheduler.ts:11`) but never called in `apps/server/src/index.ts` (only `shutdownScheduler` imported). Status: FIXED by PR C (task C1). Depends: G2/G3 need scheduler running. Added summary-table row + detailed section with acceptance tests. | Verified `index.ts` imports only `shutdownScheduler`; `initScheduler` never invoked                                   |

Summary table: added G20 row, updated total-effort note (G19 done, G20 was boot fix).
Version notes: added v1.3 (2026-08-12) documenting the audit.

## Task E2 — CONTEXT.md edits

- Removed the stale "N9 (nextCursor) — NOT fully fixed" blockquote (it was wrong on main — PR #28 fixed it). Repaired the fixed-bugs paragraph to include N9, referencing `admin-booking.repo.ts:31-33`.
- Removed 1.4/1.5/1.7/1.8 from "Remaining deferred items" list (they landed in PRs B/C); kept Redis session caching (2.2) and DLQ as remaining.
- K3 row: updated from "Partial — attempts: 3 set, no backoff/DLQ" to "Fixed — all 3 jobs have attempts: 3 + exponential backoff (no DLQ)". Verified all 3 job files (`expire-bookings`, `release-holds`, `send-notification-email`) have `attempts: 3, backoff: exponential`.
- CI/CD section: added "Scheduler boot" note — `SCHEDULER_ENABLED=true` + `REDIS_URL` required for jobs to run (via `initScheduler()`).
- Plans table: updated DEFERRED-OPS row (1.4/1.5/1.7/1.8 done in PRs B/C) and PRD-GAPS row (G19 implemented, G20 fixed by PR C).

## Task E2 — DEFERRED-OPS-TASKS.md edits

- 1.4 Booking repo columns → ✅, PR C / task C3 (verified `task-C3-report.md`, commit 5c04351).
- 1.5 Webhook IP allowlisting → ✅, PR C / task C5 — `WEBHOOK_ALLOWED_IPS` config (verified `task-C5-report.md`, commit 7d6c81b).
- 1.7 JSDoc → ✅, PR C / task C4 (verified `task-C4-report.md`).
- 1.8 Docker test DB → ✅, PR B / task B2 (verified `progress.md` PR B section).
- §2 Redis session caching: added "> Deferred / needs separate plan. Not implemented." note — remains unimplemented.
- Version notes: added v1.2 (2026-08-12).

## Concerns

- None blocking. Minor: PR C references assume PR C (branch `improvement/backend-correctness`) merges to main; if PR C is ever rejected/reworked, the G19/G20/1.4/1.5/1.7 statuses in these docs would need re-sync. G2's "fixed by PR C" phrasing and G20's "FIXED" status both depend on C1 (scheduler boot) landing.
- `CONTEXT.md` plans-table rows were widened beyond the ~50-char column style; cosmetic only, table still renders.

## Verification

- Code fences balanced in all 3 files; headings/links intact.
- No test run (docs-only). `bun run check-types` skipped per brief.
- Lefthook pre-commit hooks (lint/format) passed on both commits (no files for inspection).
