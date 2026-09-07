# Worker Report — fix tutor honorarium total for series bookings

Branch: `agent/fix-tutor-honorarium-total`
Worktree: `.worktrees/agent/fix-tutor-honorarium-total`

## What changed (files + lines)

Backend untouched. Only 4 allowed frontend files changed:

1. `apps/web/src/components/booking/booking-pricing.ts` (+66/-0)
   - Added `LEGACY_TUTOR_PAYOUT_RATE_IDR = 7_000`.
   - Added types `HonorariumSnapshotInput`, `HonorariumBookingInput`, `HonorariumSessionInput`.
   - Added `getSeriesSessionCount(booking, sessions?)`: prefers `sessions.length`, else `round(originalMarks / perStudent)` for `type === "series"`, else 1.
   - Added `getTotalHonorariumIdr(booking, sessions?)`: single returns per-session snapshot (`tutorHonorariumIdr ?? tutorShare*7000`); series sums `session.priceSnapshot ?? booking.priceSnapshot` per session; no sessions falls back to booking snapshot × derived count. Mirrors backend `aggregateTutorPayouts` (`s.priceSnapshot ?? b.priceSnapshot`).

2. `apps/web/src/components/booking/booking-pricing.test.ts` (+82/-1)
   - TDD RED first: added `getTotalHonorariumIdr` import + 5 new tests (single, series sum ×4, legacy `tutorShare*7000` ×2, fallback booking snapshot × derived count, legacy fallback × derived count).

3. `apps/web/src/components/booking/booking-detail-page.tsx` (+27/-4)
   - Imports `getSeriesSessionCount`, `getTotalHonorariumIdr`.
   - Computes `isSeriesBooking`, `seriesSessions = sessionsQuery.data ?? undefined`, `totalHonorariumIdr`, `seriesSessionCount`, `perSessionHonorariumIdr`.
   - Tutor sidebar: series shows `Total honorarium (N sessions)` + `Rp… per session` breakdown via `Stack` + `SummaryRow` + `Text`; solo/group single unchanged (`Session honorarium`).

4. `apps/web/src/components/booking/booking-card.tsx` (+2/-6)
   - `BookingFinancialInfo` tutor branch now uses `getTotalHonorariumIdr(booking)` (fallback path, no session rows in list view). Removed local `LEGACY_TUTOR_PAYOUT_RATE_IDR` constant. Student/admin branches unchanged.

Selia compliance: imports only from `@cogito-app/ui/components/selia/*`, `cn()` retained, `Card+Stack+Item` composition, `text-muted` theme token (no hardcoded colors), `use client` directives untouched.

## Verification evidence

- RED (failing test first):
  ```
  bun test apps/web/src/components/booking/booking-pricing.test.ts
  SyntaxError: Export named 'getTotalHonorariumIdr' not found in module '.../booking-pricing.ts'.
  0 pass, 1 fail
  ```
  Fails because feature missing, not typo — correct TDD RED.

- GREEN:
  ```
  bun test ./src/components/booking/booking-pricing.test.ts (apps/web cwd)
  8 pass, 0 fail, 8 expect() calls
  ```
  (3 pre-existing `getBookingPriceSummary` + 5 new `getTotalHonorariumIdr`.)

- Types:
  ```
  apps/web: bun run check-types ($ tsgo --noEmit)
  (clean, no output)
  ```
  Note: initial `check-types` failed with `TS2688: Cannot find type definition file for 'vite/client'` because the worktree had no `node_modules`. Ran `bun install --frozen-lockfile` (850 packages, 2.09s) in worktree, then `check-types` passed clean.

- Lint/format:
  ```
  bunx oxlint <4 files> → clean (no output)
  bunx oxfmt --check <4 files> → 1 file needed fix (booking-pricing.ts); ran --write, re-verified tests + types green
  ```

- Scope guard:
  ```
  git diff --stat → only the 4 allowed files
  git status --short → M booking-card.tsx, M booking-detail-page.tsx, M booking-pricing.test.ts, M booking-pricing.ts (+ untracked WORKER-REPORT.md per output contract)
  No changes under packages/api, no booking-reschedule files touched.
  ```

## What remains

- None for this scope. Acceptance met:
  (1) helper sums sessions with legacy + derived-count fallback — done;
  (2) detail sidebar total + breakdown for series, single unchanged — done;
  (3) list card total for series — done;
  (4) bun tests pass, tsc clean, no backend changes — done.
- Suggested follow-up (out of scope): visual check of tutor sidebar for 2–4 session series (solo + group) and legacy snapshot booking.

No blockers. No ambiguous UX encountered — backend shape matched expectation (`priceSnapshot` per-session, `originalMarks = perSession*N`, sessions each carry `priceSnapshot`).
