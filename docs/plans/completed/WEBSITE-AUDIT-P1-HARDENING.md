# Website Audit P1 Hardening

**Status:** Completed 2026-08-29

## Scope

Close the three highest-risk correctness findings from the cross-website audit:

1. Reject a series no-show mutation when `sessionId` belongs to another booking.
2. Serialize reschedule decisions and revalidate expiry, tutor conflicts, and target-series state at final acceptance.
3. Prevent concurrent confirmed room overlap with per-room advisory locks plus a PostgreSQL GiST exclusion constraint.

The same pass repairs the two pre-existing sidebar `className` type errors so the global typecheck can become a meaningful release gate again.

## Delivered

- Booking service parent checks and decision-time locks/revalidation.
- Room service advisory locking and migration `0038_room_booking_overlap_guard.sql` (`btree_gist`, half-open ranges, confirmed rows only).
- Regression coverage for cross-series no-show, expired reschedule decisions, final-accept overlap, and locked room service paths.
- API/module/context/runbook documentation synchronized with behavior.

## Verification

- Focused booking + room unit suites: 290 passing.
- Focused stale-contract integration suites: 45 passing.
- Full API suite: 2,250 passing, 0 failing across 194 files.
- Global `check-types` (including the production web build): passing.
- Migration 0038 applied successfully to the PostgreSQL test database.
