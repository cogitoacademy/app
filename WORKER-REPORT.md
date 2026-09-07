# Worker Report — per-session reschedule for series bookings

Branch: `agent/fix-series-reschedule-per-session`

## What changed (frontend only, 3 files)

1. `apps/web/src/components/booking/booking-reschedule-action.tsx`
   - `BookingRescheduleAction` accepts new optional props `sessionId` and
     `sessionStartAt` (both backward-compatible; solo/group callers unchanged).
   - New exported pure helpers (covered by tests):
     - `buildProposeRescheduleInput()` — builds the propose payload and
       includes `sessionId` when present. Used for both routes:
       student `orpc.booking.proposeReschedule` and tutor
       `orpc.tutorActions.proposeReschedule` (route selection unchanged).
     - `resolveRescheduleCurrentStart()` — per-session current-vs-proposed
       validation, custom-time prefill, and Current→Proposed preview now use
       the session's own start time when `sessionStartAt` is given, falling
       back to the booking start otherwise.
   - Timezone (`Asia/Jakarta`), fixed 90-minute session, and existing
     validation (different-from-current, different-from-pending, non-blank
     reason) preserved.

2. `apps/web/src/components/booking/booking-detail-page.tsx`
   - Booking-level (header) reschedule button is now hidden for
     `booking.type === "series"` (covers solo series + group series);
     solo/group behaviour unchanged.
   - Series sessions list renders a per-session `Propose new time` drawer
     button for every non-completed/non-cancelled session whenever the viewer
     is eligible (`canProposeReschedule`), passing `sessionId` +
     `sessionStartAt`. The pending-proposal guard is scoped per session
     (only the session matching `activeRescheduleProposal.sessionId` gets
     `pendingStartAt`). Complete-session flow untouched.
   - Header action-group render condition uses the same flag so a series
     booking with no other actions does not render an empty group.

3. `apps/web/src/components/booking/booking-reschedule-action.test.ts`
   - TDD: 4 new tests (written first, watched fail with
     `Export named 'resolveRescheduleCurrentStart' not found`, then
     implemented). Covers: sessionId included per-session, sessionId
     undefined booking-level, session-start preferred for validation,
     booking-start fallback.

Not touched: backend, `booking-lifecycle-actions.tsx` (accept/reject via
`proposalId` unchanged — verified the single pending-proposal card and
vote flow work for per-session proposals since they also move the booking
to `reschedule_proposed`), honorarium/pricing display.

## Verification evidence

- `bun test apps/web/src/components/booking/` → 26 pass, 0 fail (5 files).
- `bun run check-types --filter=web` (`tsgo --noEmit`) → success.
- `oxlint` on the 3 touched files → clean; `oxfmt --check` → correct format.
- `git diff --stat` shows only the 3 in-scope files.
- Backend semantics confirmed from source (no escalation needed):
  `proposeRescheduleInput.sessionId` optional (`booking.types.ts:124-131`);
  per-session accept moves only the session via `updateSessionSchedule`
  (`booking.service.ts:2242-2246`) with sibling-overlap guard
  (`booking.service.ts:2036-2055`); offline room sync applies only to
  booking-level proposals (`!proposal.sessionId`), so per-session moves do
  not touch rooms.

## What remains

- Nothing in scope. Suggested follow-ups for the orchestrator (not done here):
  manual UI smoke of a series booking (per-session drawer, propose, accept),
  and full `bun test` / CI gate at merge time.
