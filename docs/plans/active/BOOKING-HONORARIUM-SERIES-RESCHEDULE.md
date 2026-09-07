# Booking Honorarium Total + Per-Session Series Reschedule (Frontend)

Status: In review (integration branch `fix/booking-honorarium-series-reschedule`)
Date: 2026-09-07
Wave: lead + 2 workers (herdr isolated worktrees)

## Concerns (user-reported)

1. Tutor honorarium not summed for group/series bookings (solo series + group series).
   - Backend verified correct: `computeEconomics` bakes group increments into
     `tutorHonorariumIdr`; series stores per-session snapshots; `aggregateTutorPayouts`
     sums per completed session (G16 integration test green).
   - Frontend bug: `booking-detail-page.tsx` + `booking-card.tsx` showed only
     `booking.priceSnapshot.tutorHonorariumIdr` (one session) for `type === "series"`.
2. Series booking could only reschedule the earliest session.
   - Backend verified correct: `proposeRescheduleInput.sessionId` optional,
     per-session `updateSessionSchedule` + sibling-overlap guard.
   - Frontend bug: single booking-level `BookingRescheduleAction` with
     `booking.scheduledStartAt` (earliest), never sent `sessionId`; series
     sessions list had no reschedule button.

## Implementation (frontend-only, no RPC/schema change)

- `booking-pricing.ts`: new `getTotalHonorariumIdr` + `getSeriesSessionCount`
  (legacy `tutorShare*7000` fallback, derived-count fallback mirroring backend).
- `booking-detail-page.tsx`: series shows `Total honorarium (N sessions)` +
  per-session breakdown; header reschedule hidden for series.
- `booking-card.tsx`: list cards use total helper (fallback path, no session rows).
- `booking-reschedule-action.tsx`: optional `sessionId`/`sessionStartAt`,
  `buildProposeRescheduleInput` + `resolveRescheduleCurrentStart` helpers;
  per-session drawer buttons in series sessions list with per-session pending guard.

## Verification

- `bun test ./src/components/booking/booking-pricing.test.ts ./src/components/booking/booking-reschedule-action.test.ts ./src/components/booking/booking-reschedule-routing.test.ts ./src/components/booking/booking-session-time.test.ts` → 28 pass, 0 fail.
- `bun run check-types` (web, tsgo) → clean.
- `oxlint` + `oxfmt --check` on touched files → clean.
- Workers: TDD RED→GREEN evidence in per-branch WORKER-REPORT.md (retained on
  worker branches, removed from integration branch).

## Docs updated in same PR (rule 11)

- `docs/MODULE-REFERENCE.md`, `docs/RUNBOOK.md`, `docs/CONTEXT.md`,
  `docs/API-REFERENCE.md` (this plan file satisfies planning-first).

## Follow-ups (out of scope)

- Visual smoke of tutor sidebar for 2–4 session series (solo + group) and legacy snapshots.
- Manual UI smoke of per-session propose/accept flow + offline room alignment.
- Full CI gate at merge time (`gh pr checks --watch`).
