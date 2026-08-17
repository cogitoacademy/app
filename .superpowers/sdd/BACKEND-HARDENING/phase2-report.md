# PRD-GAPS Phase 2 — G4 / G5 / G6 / G7 Report

Branch: `feat/prd-gaps-booking` (stacked on `feat/prd-gaps-support-lateness` → `test/backend-realignment` → main)
Date: 2026-08-12

## Summary

All four gaps implemented backend-only with the 4-layer pattern (types → router → handler → service → repo), `DbOrTx`, `DomainError` + `withDomainMap`, and bounded zod inputs. No computeSplit/pricing signature changes. One migration (0015, `session_note` table). Full suite green: **1448 pass / 0 fail / 1 pre-existing skip** (baseline was 1394; +54 new tests).

## Commits

| SHA     | Subject                                                    |
| ------- | ---------------------------------------------------------- |
| 1957246 | feat(booking): group repricing on headcount change (G4)    |
| db19069 | feat(booking): series session cancellation rules (G5)      |
| 03235bb | feat(booking): tutor reschedule with student approval (G6) |
| a7eaa04 | feat(booking): session notes with sanitization (G7)        |
| 87ba403 | style: apply oxfmt to gap integration tests                |

## G4 — Group repricing on headcount change

**What was built**

- `repriceGroupForHeadcount()` helper in `booking.service.ts`: recomputes per-student price from the tutor's price map for the **new** confirmed headcount, adjusts each remaining participant's hold (increase via `wallet.hold(delta)` or release excess via `wallet.release`), updates `booking.priceSnapshot` + `booking.holdAmount` (via new `repo.updateBookingPriceSnapshot`), and best-effort-notifies every remaining participant ("Group price updated").
- Hooked into `withdraw()` on the pre-H-2 group branch (the AWAITING_RECONFIRMATION path) and defensively into `reconfirm()` when all participants have reconfirmed (no-op when price is unchanged).
- Withdrawn participant's `heldAmount` is now zeroed in `updateParticipantState` (was previously left stale while the wallet hold was released).
- Added missing state-machine edge `awaiting_tutor_review → awaiting_reconfirmation` (the withdraw-repricing flow depends on it; it was previously an implicit dead edge).

**Decision — insufficient balance (documented per brief):**
If repricing raises a remaining participant's hold beyond their available balance, `InsufficientMarksError` is thrown **inside the transaction**, rolling back the entire withdrawal (withdrawal + any repricing holds are undone). This is the minimal safe choice from the brief. Documented in this report.

**Scope note — join/headcount-increase repricing:** PRD's "3@35 → 4@28" join case is **not reachable** because no endpoint exists to join an already-created group (waitlist/invitation flow doesn't exist). The `repriceGroupForHeadcount` helper handles both increase and decrease directions, so it will work when such an endpoint lands; the excess-release path is covered by unit tests.

**Tests:** 4 unit (price-up on withdraw, insufficient-balance rollback, price-down excess release, non-group no-op) + 5 integration (create 4@28 → all confirm → proposer withdraws → 3@35, holds 35 each, proposer hold released, reprice notifications written).

## G5 — Series cancellation rules

**What was built**

- `booking.cancelSession` (student, `protectedProcedure`, path `/booking/session/cancel`, input `{ sessionId }`): validates the session belongs to a SERIES booking, booking is solo-series (`targetGroupSize === 1`), session is `scheduled`, and session start is > 2h out (`LATE_CANCEL_THRESHOLD_MS`). Cancels the single `booking_session` row (state `cancelled`, `holdAmount` 0), releases that session's share of the series wallet hold (series holds are a single wallet hold = perSession × N; we release `session.holdAmount`, decrement the participant's `heldAmount` and the booking's `holdAmount`), and notifies the tutor.
- Group series (`targetGroupSize > 1`) → `BookingSessionNotCancellableError` (badRequest). (No group-series creation flow exists in the API; enforced at service level and via an integration test that inserts a group series directly.)
- **G15 backend piece:** added `disclaimer` field to series booking responses — a new `GROUP_SERIES_DISCLAIMER` constant returned on `get` (`booking.get`) and `createSeries` when `type === series && targetGroupSize > 1`, else `null`. Full G15 lives in Phase 5; this is the response-field portion.
- Removed the dead `sessionNote` input from `completeSessionInput` (was discarded by the handler).

**Tests:** 6 unit (pre-H2 cancel+release, H-2 rejection, group-series rejection, non-series rejection, not-found, disclaimer on get) + 4 integration (create solo series → cancel 3h-out allowed + hold released + session cancelled; cancel inside H-2 rejected; group series rejected with disclaimer).

## G6 — Tutor reschedule with student approval

**What was built**

- **Role fix (breaking):** `proposeReschedule` moved from student `protectedProcedure` to `tutorProcedure` (`POST /tutor/booking/reschedule/propose`); service enforces `b.tutorId === userId`, uses `ACTOR_TYPE.TUTOR`, and notifies the student (proposer) with "Tutor proposed a new time…". A student calling it gets FORBIDDEN (403).
- `booking.acceptReschedule` (student, `protectedProcedure`, `/booking/reschedule/accept`): validates `b.proposerId === userId` and state `reschedule_proposed`; finds the pending proposal (`bookingRescheduleProposal.status = pending`), marks it `accepted` + `decidedAt`, updates `scheduledStartAt/EndAt` to the proposed times (new `repo.updateBookingSchedule`), transitions `reschedule_proposed → awaiting_reconfirmation`, resets the deadline to the reconfirmation window (`RESPONSE_WINDOW_MS`), notifies the tutor.
- `booking.rejectReschedule` (student, `/booking/reschedule/reject`): marks the proposal `rejected` + `decidedAt`, transitions back to the previous non-terminal state (added revert edges `reschedule_proposed → awaiting_tutor_review` / `awaiting_admin_room_approval` to the state machine; falls back to `awaiting_reconfirmation` otherwise), booking time unchanged, notifies the tutor.
- Proposal status flows use the existing `bookingRescheduleProposal` columns (`status`, `decidedAt`) — no migration needed.

**Decision — meeting link:** the meeting port only supports `createEvent` (which INSERTs a new manual/pending row and ignores times in the fallback provider), so re-creating on accept would create duplicate rows with no link update. Meeting link is **not auto-updated** on accept — documented as a follow-up for the meeting port (needs an update/refresh method). Regression note: any UI depending on student-initiated reschedule must switch to cancel+rebook; the endpoint is now 403 for students.

**Tests:** 6 unit (accept success, not-proposer, wrong state, no pending proposal, reject success+revert, plus new proposeReschedule tutor-role + student-403 unit tests) + handler tests (accept/reject on booking router, proposeReschedule on tutorActions router) + 5 integration (student propose → 403; tutor propose → student notified; student accept → time updated + both notified; tutor accept/reject → 403; student reject → proposal rejected, time unchanged, tutor notified).

## G7 — Session notes with sanitization

**Decision — storage:** chose a dedicated `session_note` table (id, bookingId FK, authorId FK, content, createdAt, updatedAt) rather than a column on `booking`/`bookingParticipant`, for author tracking and multi-note support. Migration `0015_purple_random` (committed).

**What was built**

- `packages/api/src/lib/sanitize.ts` — minimal dependency-free HTML sanitizer: strips `<script>`/`<style>` blocks with content, drops disallowed/embed tags (img, iframe, object, video, audio, svg, form, …), strips `on*` attributes, neutralizes `javascript:`/`vbscript:`/`data:text/html` URLs, allows a small safe tag whitelist (p, headings, lists, links, strong/em, code/pre, blockquote, br). Scope: plain text + markdown-safe; no rich-text editor in Phase 0.
- `booking.addSessionNote` (protected, either party via `assertBookingAccess`): requires state `completed`, sanitizes content, rejects empty-after-sanitize.
- `booking.getSessionNotes` (protected): requires state `completed`, lists notes newest-first.
- New error `BookingNotCompletedError` (badRequest); new repo methods `insertSessionNote` / `listSessionNotes`.

**Tests:** 10 sanitizer unit tests + 4 service unit tests + 3 handler tests + 6 integration (add-before-completed rejected; complete → add with `<script>` injection → stored sanitized (no script, safe tags kept); student views tutor's note; student adds note; both see both notes).

## Migration

- `bun run db:generate` → `0015_purple_random.sql` (CREATE TABLE session_note + 2 FKs + 2 indexes). Applied via `bun run db:migrate`. Migration files committed.
- Note: the dev DB had a cluttered `drizzle.__drizzle_migrations` history (stale rows from earlier phases). A stale `drizzle` schema caused `db:migrate` to hang; resolved by resetting the `public` + `drizzle` schemas and re-applying all 15 migrations cleanly. `resetDatabase()` in the test helper truncates via CASCADE, so the new table needs no helper change.

## Verification

- `bun run check-types` — clean (all 3 packages).
- `REDIS_URL=redis://localhost:6379 bun test --env-file apps/server/.env packages/api/src/tests/ apps/server/src/openapi.test.ts` → **1448 pass, 0 fail, 1 skip** (the skip is a pre-existing TC-09 email-mismatch test).
- Per-gap test runs were green at each commit; pre-commit hook (lefthook: oxfmt + oxlint) passes on every commit.

## Files changed

- `packages/api/src/modules/booking/booking.service.ts` — reprice helper, cancelSession, accept/rejectReschedule, session notes, tutor-role propose, disclaimer.
- `packages/api/src/modules/booking/booking.repo.ts` — updateBookingPriceSnapshot, updateBookingSchedule, findPendingRescheduleProposal, updateRescheduleProposal, findSessionById, cancelSession, insertSessionNote, listSessionNotes.
- `packages/api/src/modules/booking/booking.router.ts` / `booking.handler.ts` / `booking.types.ts` — new endpoints + proposeReschedule relocation.
- `packages/api/src/modules/booking/booking.errors.ts` — BookingSessionNotFoundError, BookingSessionNotCancellableError, BookingNotCompletedError (+ maps).
- `packages/api/src/modules/booking/booking-transitions.ts` — `awaiting_tutor_review → awaiting_reconfirmation`; reschedule revert edges.
- `packages/api/src/lib/sanitize.ts` (new) + `packages/api/src/tests/unit/sanitize.test.ts` (new).
- `packages/db/src/schema/booking.ts` + `packages/db/src/migrations/0015_purple_random.sql` + meta.
- `packages/api/src/shared/constants.ts` — GROUP_SERIES_DISCLAIMER.
- Tests: `booking-g4/g5/g6/g7.test.ts` (new integration), `booking.service.test.ts`, `booking.handlers.test.ts` (updated).

## Review-fix report (2026-08-12, stacked on commits 1957246..87ba403)

### Important 1 (G4) — group completion after proposer withdrawal

**Problem:** `completeSession` deducted the whole `b.holdAmount` from the **proposer's** wallet via a single `wallet.deduct`. After a pre-H-2 proposer withdrawal + repricing, the proposer holds 0 and the holds live on each remaining participant's wallet, so completion failed with insufficient-hold. The G4 repricing flow made this load-bearing.

**Fix** (`packages/api/src/modules/booking/booking.service.ts`): group `completeSession` now deducts **per-confirmed-participant** from each participant's own wallet using their individual `heldAmount` (mirrors `releaseAllParticipantHolds`), eventKeys `booking.{id}.complete.{userId}`. Solo keeps the existing single deduct (`booking.{id}.deduct`).

**Related state-machine gap:** exercising the full flow exposed that `reconfirm` transitions `awaiting_reconfirmation → awaiting_tutor_review` (booking.service.ts:1308) but the transitions table only allowed `confirmed`/`expired` — the group could never reach tutor review → scheduled → completed. Added the missing edge to `booking-transitions.ts`.

**Files:** booking.service.ts, booking-transitions.ts, booking-g4.test.ts, booking-transitions.test.ts, booking.service.test.ts.

**Tests added:**

- Unit: `completeSession` group-after-withdrawal deducts each confirmed participant's hold (3 deducts, per-user wallets/eventKeys, proposer untouched).
- Integration (booking-g4.test.ts): reconfirm all 3 → awaiting_tutor_review → tutor accepts → scheduled → tutor completes → each remaining participant's wallet deducted 35 (held 0, total 165), proposer wallet untouched (200/0), `holdAmount` 0.
- Unit (booking-transitions.test.ts): `awaiting_reconfirmation → awaiting_tutor_review` legal.

**Covering command + output:**
`REDIS_URL=redis://localhost:6379 bun test --env-file apps/server/.env packages/api/src/tests/integration/booking-g4.test.ts packages/api/src/tests/unit/booking.service.test.ts packages/api/src/tests/unit/booking-transitions.test.ts` → all pass (7 / 133 / 11).

### Important 2 (G6) — rejectReschedule revert set

**Problem:** `rejectReschedule` used a manually-maintained revert set with a dead entry (`awaiting_reconfirmation` is not a legal source of `reschedule_proposed`) and a fallback to `awaiting_reconfirmation` that could silently lose the pre-proposal state if a legal source were ever missing.

**Verification:** the transitions table shows exactly two legal sources of `reschedule_proposed` — `awaiting_tutor_review`, `awaiting_admin_room_approval` (`awaiting_participant_confirmation` is NOT a legal source; it cannot reach `reschedule_proposed`). Both were already in the set, but the set could drift from the table.

**Fix** (`packages/api/src/modules/booking/booking.service.ts`): derive the revert set from `TRANSITIONS` (sources whose `to` includes `reschedule_proposed`) so it can never drift from the state machine and always reverts to the exact prior state. The `awaiting_reconfirmation` fallback is retained as a documented defensive fallback (unreachable today).

**Files:** booking.service.ts, booking.service.test.ts.

**Tests added:** unit test that `rejectReschedule` reverts a prior `awaiting_admin_room_approval` booking back to `awaiting_admin_room_approval` (second legal source; previously only `awaiting_tutor_review` was covered).

**Covering command + output:**
`bun test packages/api/src/tests/unit/booking.service.test.ts` → 133 pass / 0 fail.

### Minor 1 (G5) — cancelSession terminal-parent guard

**Fix** (`booking.service.ts`): `cancelSession` now rejects with `BookingCancelledError` when the parent series booking is in a terminal state (before any type/state checks), so a cancelled/expired series can't have individual sessions cancelled or holds released.

**Files:** booking.service.ts, booking.service.test.ts.

**Tests added:** unit — session cancellation rejected when parent booking is `cancelled`; `repo.cancelSession` not called. Folded into the G4 commit.

### Minor 2 (G7) — sanitizer `data:text/html` test + bug

**Problem:** the sanitizer's dangerous-URL neutralization produced malformed output `href==""` (double `=`) because `sanitizeAttributeValue` returned `` `${prefix}=""` `` while `prefix` already ends in `=`; existing tests only asserted `not.toContain(...)` so this was invisible.

**Fix** (`packages/api/src/lib/sanitize.ts`): neutralize to `` `${prefix}""` ``; added a `data:text/html` unit test asserting exact output `<a href="">`, plus an embedded-markup variant asserting no `data:`/`<script>` leak.

**Files:** sanitize.ts, sanitize.test.ts. Folded into the G6 commit.

**Covering command + output:**
`bun test packages/api/src/tests/unit/sanitize.test.ts` → 12 pass / 0 fail.

### Final verification (post-commit)

- `bun run check-types` — clean (all 3 packages).
- `REDIS_URL=redis://localhost:6379 bun test --env-file apps/server/.env packages/api/src/tests/ apps/server/src/openapi.test.ts` → **1455 pass / 0 fail / 1 pre-existing skip** (was 1448; +7 tests).
- oxlint — 0 errors; pre-commit hook (oxfmt + oxlint) passes on both commits.

### Fix commits

| SHA     | Subject                                                                                                                           |
| ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| e871baf | fix(booking): deduct per-participant holds on group completion (G4) — + G4 transition edge + cancelSession terminal guard (minor) |
| 2845a15 | fix(booking): reject reschedule reverts to exact prior state (G6) — + sanitizer `data:text/html` fix (minor)                      |
