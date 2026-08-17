# PRD-GAPS Phase 3 — G8 (admin override queue), G9 (admin wallet/ledger view), G10 (override preview)

Branch: `feat/prd-gaps-admin` (stacked on `feat/prd-gaps-booking` → `feat/prd-gaps-support-lateness` → `test/backend-realignment` → main).

Read the gap specs:

- G8: .superpowers/sdd/BACKEND-HARDENING/gap-G8.md
- G9: .superpowers/sdd/BACKEND-HARDENING/gap-G9.md
- G10: .superpowers/sdd/BACKEND-HARDENING/gap-G10.md

## Verified code state (facts to build on)

### G8 — Admin override queue with urgency

- `adminBooking.listBookings` EXISTS (`admin-booking.router.ts:24-33`, `admin-booking.service.ts:237-252`). Pagination IS fixed (cursor consumed, `gt(booking.id, cursor)` in repo). Input: `{ bookingId?, limit?, cursor? }` (`admin-booking.types.ts`).
- MISSING per PRD: (1) urgency sorting — currently `orderBy(asc(booking.id))` (admin-booking.repo.ts:39); should sort by state urgency then time-to-session; (2) SLA tracking — override requests not addressed within 12h escalate; (3) exception filters — filter by override category / urgency level / SLA status.
- State urgency ordering (define + document): pending-action states (awaiting_tutor_review, awaiting_participant_confirmation, awaiting_reconfirmation, reschedule_proposed) first, then scheduled/confirmed, then terminal last. Within urgency band, sort by `scheduledStartAt` ascending (soonest first).
- SLA: bookings with an active override request older than 12h (RESPONSE_WINDOW_MS exists in constants) are flagged `escalated: true` in the response (computed, not stored — or store if you prefer a column; prefer computed to avoid migration).
- Filters: extend `listOverridesInput` with optional `category?`, `urgency?` (high/medium/low), `escalated?` (boolean). Wire into service + repo query conditions.
- IMPORTANT: `listBookingsByState(db, states, limit, cursor)` currently takes `states: string[]`. Extend the repo method (or add a new one) to accept sort/filter options WITHOUT breaking existing callers. `applyOverride` currently writes `overrideMeta.category` into `booking.override_meta` jsonb — SLA/escalation filter can read from there.

### G9 — Admin wallet/ledger view

- Admin module has only `listUsers`/`setRole`. Wallet module's `get`/`listLedger` are self-scoped (protectedProcedure, use `session.user.id`).
- ADD to admin module: `admin.getWallet` (adminProcedure, input `{ userId }`) → returns any user's wallet (balance/held/available); `admin.listLedgerEntries` (adminProcedure, input `{ walletId?, userId?, limit?, cursor?, entryType?, dateFrom?, dateTo?, bookingId? }`) → paginated ledger entries with filters.
- Reuse the wallet service's `getByUserId`/`listLedger` if the admin service can access a wallet port — check `packages/api/src/modules/admin/index.ts` for the existing port wiring (admin has audit port; may need to add a `AdminWalletPort`). Follow the consumer-driven port pattern: define `AdminWalletPort` in `admin/index.ts` with only the methods needed (`getByUserId`, `listLedger`), wire in `services.ts`.
- Check `listLedgerInput` in `wallet.types.ts` for the existing filter shape; the admin version extends it with `userId`/`walletId` + date range.

### G10 — Before/after override preview

- `applyOverride` applies directly. ADD `adminBooking.previewOverride` (adminProcedure, SAME input as applyOverrideInput) → returns projected changes WITHOUT persisting:
  - booking currentState → target state (per CATEGORY_STATE_MAP)
  - wallet impact per affected participant: what would be released/credited/deducted (projected holdAmount deltas)
  - participants involved
  - MUST NOT write anything (no tx writes, no audit, no state history)
- Implementation: refactor `applyOverride`'s planning into a pure helper `planOverride(bookingRow, input)` returning `{ newState, affectedParticipants, projectedMarksAction, perParticipantImpact }`, used by both `applyOverride` (then executes) and `previewOverride` (returns only). Reuse `CATEGORY_STATE_MAP`.

## Architecture patterns (MUST follow)

- 4-layer per module; DbOrTx; DomainError + withDomainMap; bounded zod; consumer-driven ports in index.ts.
- Reference `admin-booking.service.ts` (existing override logic), `admin/index.ts` (port wiring), `services.ts` (composition root).
- Notifications: existing override flow doesn't notify — PRD mentions user-visible notification; add a best-effort notification to affected participants on applyOverride IF cheap and consistent with existing patterns (check how booking.service notifies; admin-booking has no notification port yet — add `AdminBookingNotificationPort` if you add notifications; otherwise document why skipped).
- Migrations: only needed if you add columns (prefer computed SLA flags — no migration expected).

## Tests (real DB)

- G8: integration test — create bookings in different states, assert listBookings returns urgency-sorted order; escalated flag appears for stale override requests; category filter works.
- G9: integration test — admin getWallet for a student with a wallet; listLedgerEntries filtered by type/date; non-admin → 403.
- G10: integration test — previewOverride returns projected state + wallet impact but writes NOTHING (assert booking state, wallet balances, state history, audit all unchanged).
- Run full suite at the end: `REDIS_URL=redis://localhost:6379 bun test --env-file apps/server/.env packages/api/src/tests/ apps/server/src/openapi.test.ts` — expect 0 fail (currently 1455).

## Constraints

- Conventional commits per gap: `feat(admin-booking): urgency-sorted override queue with SLA + filters (G8)`, `feat(admin): admin wallet and ledger views (G9)`, `feat(admin-booking): before/after override preview (G10)`.
- Backend only. No frontend.
- Do NOT break existing `applyOverride`/`listBookings` callers (admin-override.test.ts integration tests exist).
