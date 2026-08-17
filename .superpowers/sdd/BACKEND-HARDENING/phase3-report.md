# PRD-GAPS Phase 3 — G8, G9, G10 (Admin override queue, wallet/ledger views, override preview)

Branch: `feat/prd-gaps-admin` (stacked on `feat/prd-gaps-booking` → `feat/prd-gaps-support-lateness` → `test/backend-realignment` → main).
Base for this phase: `2845a15`.

## Summary

Implemented the three backend gaps with conventional commits (one per gap):

| Commit    | Message                                                                      |
| --------- | ---------------------------------------------------------------------------- |
| `7705e8c` | `feat(admin-booking): urgency-sorted override queue with SLA + filters (G8)` |
| `c4ce47a` | `feat(admin): admin wallet and ledger views (G9)`                            |
| `f15f4a7` | `feat(admin-booking): before/after override preview (G10)`                   |
| `d5792d8` | `style: apply oxfmt to phase3 gap files`                                     |
| `f061ba0` | `style: hoist pure helpers to module scope`                                  |

Full phase diff `2845a15..HEAD`: 21 files changed, 1693 insertions(+), 127 deletions(-).

## G8 — Urgency-sorted override queue with SLA + filters

**What was built**

- **Urgency ordering** (repo, `admin-booking.repo.ts`): `listBookingsByState` now always orders by a SQL `CASE` urgency rank (band 0 = pending-action states `awaiting_tutor_review`, `awaiting_participant_confirmation`, `awaiting_reconfirmation`, `reschedule_proposed`, `awaiting_admin_room_approval`; band 1 = `confirmed`, `scheduled`; band 2 = terminal), then `scheduledStartAt ASC`, then `id ASC` (stable tiebreak). `URGENCY_BANDS` / `URGENCY_RANK` exported for reuse.
- **SLA escalation** (service, computed — no migration): a booking is `escalated: true` in the queue response when its `booking.override_meta.overriddenAt` is older than `RESPONSE_WINDOW_MS` (12h). `computeEscalated` is a pure helper; enrichment happens in the service (`toOverrideQueueItem`). The `escalated` filter is a SQL condition on `override_meta->>'overriddenAt' < now()-12h`, consistent with the service flag.
  - **Interpretation decision (documented):** there is no "override request" entity in the schema (verified by grep — `override_meta` is only written by `applyOverride`). Per the brief's guidance to read SLA from `override_meta`, escalation is computed from `overriddenAt`. If a dedicated override-request record is added later, escalation should be recomputed from it.
- **Filters** (`listOverridesInput` extended): optional `category` (enum from `OVERRIDE_CATEGORIES`), `urgency` (`high|medium|low`, mapped to `URGENCY_BANDS` via `inArray` on state), `escalated` (boolean). Wired through handler → service → repo conditions. The service keeps the legacy 4-arg repo call (`listBookingsByState(db, [], limit, cursor)`) when no filters are present so existing callers/tests are untouched; passes a 5th `opts` arg only when filters are set.
- **Pagination**: composite keyset cursor `"<rank>~<scheduledStartAt ISO>~<id>"` produced by the service (`toOverrideCursor`) and consumed in the repo via a Postgres row-value comparison `(rank, scheduled_start_at, id) > (cursor...)`. Legacy plain-id cursors (`id > cursor`) are still accepted for backward compatibility. N9-style cursor consumption remains fixed.

**Tests**

- Integration `admin-override-queue.test.ts` (5 tests): urgency order (pending-action before scheduled before terminal; soonest-session-first within band), escalation flag for a 13h-old override record vs fresh/no override, category filter, urgency filter, escalated filter.
- Unit: updated `admin-booking.service.test.ts` item-shape assertions (`escalated: false`) and mock rows gain `scheduledStartAt` for cursor building; added filter-pass-through and escalation unit tests.
- All existing repo/service unit tests unchanged and green (mock chains preserved `.where().orderBy().limit()`).

## G9 — Admin wallet and ledger views

**What was built**

- **`admin.getWallet`** (`POST /rpc/admin.getWallet`, adminProcedure): input `{ userId }` → any user's wallet `{ id, totalBalance, heldBalance, availableBalance }`. Throws `WalletNotFoundError` → 404 when the user has no wallet.
- **`admin.listLedgerEntries`** (`POST /rpc/admin.listLedgerEntries`, adminProcedure): input `{ walletId?, userId?, limit?, cursor?, bookingId?, entryType?, dateFrom?, dateTo? }`. Requires `walletId` or `userId` (not both). Resolves `userId → walletId` via the wallet port, then delegates to the wallet service's `listLedger` with all filters. Date filters validated (invalid → `InvalidLedgerFilterError` → 400); `dateFrom > dateTo` rejected.
- **Consumer-driven port**: `AdminWalletPort` (`getByUserId`, `listLedger`) defined in `admin/index.ts`, wired in `services.ts` (`createAdminModule({ db, audit, wallet: wallet.service })`).
- **Wallet service/repo extension (additive, no caller breakage)**: `LedgerQueryOptions` gained `entryType`, `dateFrom`, `dateTo`; `findLedgerEntries` gained the matching conditions. `listLedger` return type tightened from `items: unknown[]` to `items: LedgerEntryRow[]` (new exported type `typeof ledgerEntry.$inferSelect`).
- **Bug found & fixed in scope**: `findLedgerEntries` never consumed the cursor (wallet `listLedger` pagination was broken, same class as N9 for bookings). Added keyset consumption `(created_at, id) < (SELECT created_at, id FROM ledger_entry WHERE id = cursor)` and a `desc(id)` tiebreak. The G9 integration test exercises two-page pagination with no overlap.
- Non-admin → 403 via the existing `requireAdmin` middleware (no code needed).

**Tests**

- Integration `admin-wallet.test.ts` (8 tests): getWallet balances, getWallet 404 for missing user, paginated ledger (2 pages, no overlap, nextCursor lifecycle), entryType filter, date-range filter, userId+bookingId filter, missing walletId/userId → 400, non-admin → 403 on both endpoints.
- Unit `admin.service.test.ts`: getWallet happy/missing, listLedgerEntries userId-resolution, both/neither filter conflicts, missing wallet, invalid date, inverted date range. `admin.handler.test.ts` call sites updated for the new `wallet` dep (mock port).

## G10 — Before/after override preview

**What was built**

- **`adminBooking.previewOverride`** (`POST /rpc/admin/booking/override/preview`, adminProcedure, same input as `applyOverrideInput`): returns the projected outcome WITHOUT persisting anything — booking `currentState` → `projectedState` (per `CATEGORY_STATE_MAP`), `affectedParticipants`, `marksAction`, and per-participant wallet impact (action, before/after balances computed via `projectWalletAfter`, no writes).
- **`planOverride` refactor**: extracted the planning logic from `applyOverride` into a pure (read-only) async helper `planOverride(conn, bookingRow, input)` returning `{ newState, affectedParticipantIds, projectedMarksAction, perParticipantImpact, overrideMeta }`. `applyOverride` now calls `planOverride` inside its transaction and executes the plan (state update, history, wallet release/compensate using each impact entry — eventKeys/amounts/reasons byte-identical to the old inline loop, verified by the unchanged unit tests); `previewOverride` calls the same helper against `db` (no transaction, no audit, no state history, no ledger writes). Existing behavior is preserved: `admin-override.test.ts` still 8/8 green, including hold release + ledger assertion and terminal-state rejection.
- **Best-effort notifications** (cheap + consistent with existing patterns): added optional `AdminBookingNotificationPort` (`writeBestEffort`) to the admin-booking module, wired to `notification.service` in `services.ts`. On `applyOverride`, a best-effort in-app/email notification (`category: "override"`, severity `action`, idempotent eventKey `override.applied.<bookingId>.<userId>`) is written for each affected participant. Optional dep → existing unit tests that construct the service without a notification port are unaffected. Preview writes no notification.

## Constraints / architecture compliance

- Backend only. 4-layer per module (router → handler → service → repo) respected for both modified modules.
- `DbOrTx` threading: `planOverride` takes a connection (tx inside `applyOverride`, `db` in `previewOverride`); wallet port reads/writes flow through the same connection.
- `DomainError` + `withDomainMap` for all new failures (`WalletNotFoundError`, `InvalidLedgerFilterError`, reuse of `BookingNotFoundError`/`TerminalStateOverrideError`).
- Bounded zod: all new inputs bounded with `.max()`, enums, `.min(1).max(100)` limits; no unbounded strings/arrays introduced.
- No migrations: escalation is computed; wallet filter columns already exist; no schema changes.
- Consumer-driven ports (`AdminWalletPort`, `AdminBookingNotificationPort`) declared in the consuming module's `index.ts`; structural compatibility checked at the `services.ts` wiring site.

## Test results

- `bun run check-types` → 3/3 tasks success (repo baseline: passes; api package is not part of the check-types task set).
- Full suite `REDIS_URL=redis://localhost:6379 bun test --env-file apps/server/.env packages/api/src/tests/ apps/server/src/openapi.test.ts` → **1487 pass / 1 skip / 0 fail** (was 1455 pass on the phase-2 baseline; +32 tests).
  - The 1 skip (`TC-09 email mismatch`) is pre-existing and unrelated.
- `oxlint` → 0 errors (repo-wide warnings pre-existing); my changed module files lint clean (0 warnings) after the two style commits.
- `bunx tsc --noEmit -p packages/api/tsconfig.json` — no errors in any modified **source** file. The package-level tsc reports only pre-existing strict-null errors in legacy test files (verified identical set on the clean base with `git stash`); `bun run check-types` (the required gate) is green.

## Files changed

- `packages/api/src/modules/admin-booking/` — `repo.ts` (urgency rank/CASE, filters, composite cursor), `service.ts` (escalation, filters, planOverride/previewOverride, notifications), `types.ts` (filters), `handler.ts`, `router.ts` (previewOverride), `index.ts` (notification port).
- `packages/api/src/modules/admin/` — `index.ts` (AdminWalletPort), `service.ts` (getWallet, listLedgerEntries), `types.ts`, `handler.ts`, `router.ts`, `errors.ts`.
- `packages/api/src/modules/wallet/` — `service.ts` (LedgerQueryOptions extension, LedgerEntryRow, listLedger return type), `repo.ts` (entryType/date filters + cursor consumption).
- `packages/api/src/services.ts` — wired `wallet.service` into admin module and `notification.service` into admin-booking module.
- Tests — new: `admin-override-queue.test.ts`, `admin-wallet.test.ts`, `override-preview.test.ts`; updated: `admin-booking.service.test.ts`, `admin.service.test.ts`, `admin.handler.test.ts`.

## Concerns / follow-ups

1. **Escalation semantics** are pinned to `override_meta.overriddenAt` because no override-request entity exists. If the product later adds an explicit request record (e.g. from support tickets), `computeEscalated` and the SQL filter should be recomputed from it.
2. **Legacy plain-id cursors** on the queue are accepted but only approximate under urgency ordering (kept for backward compatibility); new cursors are composite and correct. Frontend should use the returned `nextCursor` verbatim.
3. **Wallet `listLedger` cursor fix** (previously unconsumed) is a behavior change for wallet self-scoped ledger pagination too — it only makes pagination correct; no caller depends on the old (duplicate-page) behavior.
4. **`projectWalletAfter`** computes projected balances algebraically; `compensate_deduct`/`release` guard against insufficient balances at execution time only (preview is informational).
5. Notifications on `applyOverride` are best-effort and idempotent by eventKey; email dispatch is subject to the existing notification/email port behavior (queued on action/critical severity).

## Verification commands

```bash
bun run check-types
REDIS_URL=redis://localhost:6379 bun test --env-file apps/server/.env packages/api/src/tests/ apps/server/src/openapi.test.ts
```

Both green (0 fail).

---

## Review finding fix — composite-cursor pagination coverage (G8)

**Commit:** `test(admin-booking): cover composite-cursor pagination across urgency bands (G8)`

### What was added

`packages/api/src/tests/integration/admin-override-queue.test.ts` — new `describe` block
(own `beforeAll` → `resetDatabase`, fresh admin/student/tutor users) seeding **13 bookings
across all three urgency bands** with staggered `scheduledStartAt` values, then paging
`adminBooking.listBookings` with `limit = 3` and echoing `nextCursor` back verbatim until
exhausted:

- Band 1 (scheduled/confirmed) is created **first**, band 0 (pending action) second, band 2
  (terminal) last — so band-0 bookings sort ahead of earlier-created band-1 bookings purely by
  state urgency, and a terminal booking with the _soonest_ session (now+5h) still sorts last.
- A 40h `scheduledStartAt` tie pair exercises the `asc(id)` tiebreaker.
- Asserts: pages count == ceil(13/3); every page is the exact next slice of the expected
  (rank, start, id)-sorted list; union == full expected list (no skips, no overlap); no
  duplicates; and the cursor crosses bands between pages (page 1 ends band 0, page 2 starts
  band 1; page 3 ends band 1, page 4 starts band 2).

### Bug found by the new test

The composite cursor path had never run against the real DB. The repo interpolated a raw
`Date` into the `sql` tuple condition
`(${rank}, ${start}, ${id})`, which postgres-js rejects with `TypeError: ... Received an
instance of Date` (`ERR_INVALID_ARG_TYPE`) — so **every** page-2+ request would crash. Fixed in
`admin-booking.repo.ts` by passing `start.toISOString()`, matching the existing pattern already
used by the escalated filter (`overrideMeta->>'overriddenAt' < $iso`). No behavior change to
the ordering semantics (ISO string round-trips the same instant and Postgres coerces it to
timestamptz in the row comparison).

### Mutation check

Temporarily reverted the composite tuple to the legacy id-only cursor
(`gt(booking.id, cursor)`): the new test fails (5 pass / 1 fail). Restored the fix → 6 pass.

### Verification

```bash
REDIS_URL=redis://localhost:6379 bun test --env-file apps/server/.env \
  packages/api/src/tests/integration/admin-override-queue.test.ts   # 6 pass / 0 fail
REDIS_URL=redis://localhost:6379 bun test --env-file apps/server/.env \
  packages/api/src/tests/unit/admin-booking.*.test.ts               # 68 pass / 0 fail
```

`tsc --noEmit -p packages/api/tsconfig.json`: no new errors (679 pre-existing on base, none in
the two touched files; `bun run check-types` gate unaffected).
