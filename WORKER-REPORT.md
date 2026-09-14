# Worker Report — backend hygiene (H2, H3, M1, M2)

Branch: `w/backend-hygiene` (worktree `/Users/miapalovaara/cogito/app/.worktrees/w/backend-hygiene`, from `origin/main`).
Scope respected: only `packages/api/src/lib/metrics.ts`, per-module `*.repo.ts` files (SELECT tightening only),
`packages/db/src/schema/booking.ts` + one new migration, `packages/api/src/tests` updates for changed code,
`apps/server/src/routes/health-metrics.ts` caller wiring. No infra/grafana, plan, RUNBOOK, or CONTEXT edits
(no behavior change — see below).

## What changed

### H2 — drop duplicate booking index (kept DEFERRED-OPS name)
- `packages/db/src/schema/booking.ts`: removed `booking_state_deadline_idx` on
  `(current_state, deadline_at)`; kept `idx_booking_status_deadline` on the same columns
  (the name referenced by DEFERRED-OPS §1.1 and the §3 EXPLAIN inventory). Added a short
  comment recording the kept name and the dropping migration.
- Exactly one new migration: `packages/db/src/migrations/0044_drop_duplicate_booking_index.sql`
  (`DROP INDEX "booking_state_deadline_idx";`) + drizzle journal entry + `meta/0044_snapshot.json`
  (generated via drizzle-kit, tag renamed to underscore convention).
- DB verification (local `cogito-test`): `pg_indexes` shows only `idx_booking_status_deadline`
  on booking; `drizzle-kit check` reports "Everything's fine".

### H3 — metrics exposition no longer reads process env
- `packages/api/src/lib/metrics.ts`: `ExpositionInput` gains `version?: string`;
  `resolveExpositionProvider/Mode/Version` are pure (explicit input + safe defaults
  `"stub"`/`"none"`/`"dev"`, stub⇒none enforced, unknown values fall back). All
  `process.env.{GIT_SHA,PAYMENT_PROVIDER,XENDIT_MODE,MIDTRANS_MODE}` reads removed.
  Bare `renderExposition()` output is unchanged (`dev`/`stub`/`none`).
- `apps/server/src/routes/health-metrics.ts` (`/metrics` only; `/health` untouched):
  injects `provider` from validated `env.PAYMENT_PROVIDER`, `providerMode` from the matching
  `env.XENDIT_MODE`/`env.MIDTRANS_MODE` (`"none"` fallback, stub⇒none), `version` from
  `process.env.GIT_SHA?.trim() || "dev"` (Dockerfile-baked SHA; caller layer only).
- `packages/api/src/tests/unit/metrics-exposition.test.ts`: env-stubbing tests replaced with
  explicit-injection tests covering defaults, blank-version fallback, stub⇒none contract,
  and env-free bare defaults.

### M1 — bare-select audit (~40 sites)
- Audited 39 `.select()` sites via `rg`: 35 in per-module `*.repo.ts` files, 4 in
  `modules/meeting/*.provider.ts` (out of scope — untouched, see Remains).
- Tightened all 35 repo sites to explicit table-scoped projections
  (`.select({ ...getTableColumns(table) })`, the established DEFERRED-OPS 1.4 pattern from
  booking.repo C3), preserving return types exactly:
  - `achievement.repo.ts` (3): listByUserId, findByIdForUser, getById
  - `payment.repo.ts` (5): findPackageByCode, findPaymentByProviderReference,
    findLatestPaymentByUserAndPackage, findPaymentById, findPaymentByProviderEventId
  - `room.repo.ts` (3): findActiveRooms, findRoomBookings, findRoomBookingsForUpdate
  - `admin.repo.ts` (2): listUsers, getById
  - `wallet.repo.ts` (2): findLedgerEntries, listActivePackages
  - `notification.repo.ts` (3): listPendingDispatches, findNotificationById, listNotifications
  - `booking.repo.ts` (1): findLatestPaidTutorPayout (remainder already explicit)
  - `economy.repo.ts` (2): getOrCreate (both reads)
  - `admin-booking.repo.ts` (6): findBookingById, listBookingsByState, getStateHistory,
    findParticipantsByBookingId, findPaymentById, listCreditStatePaymentsForUser
  - `support.repo.ts` (5): listByReporter, adminList, findById, findBookingForReporter,
    listPastSla
  - `admin-mark-package.repo.ts` (2): listAll, getById
  - `tutor.repo.ts` (1): listAvailability
- No bare `.select()` remains in any `*.repo.ts`; no one-line intentional-star comments were
  needed (zero bare remain). All converted queries return full rows consumed by services,
  so explicit table scope documents the projection without changing shapes.

### M2 — booking timezone TODO resolved
- `packages/db/src/schema/booking.ts`: removed
  `TODO(production-readiness): use timezone in deadline calculations instead of server time`;
  replaced with a comment documenting the decided semantics: `deadlineAt` values are absolute
  `timestamptz` instants computed from the server clock (`Date.now()` + response window),
  comparisons are timezone-agnostic so no per-booking conversion is needed; `timezone`
  (default `Asia/Jakarta`) is presentation-only for WIB countdown/display. No code behavior changed.

## Files
- `packages/db/src/schema/booking.ts`
- `packages/db/src/migrations/0044_drop_duplicate_booking_index.sql` (new)
- `packages/db/src/migrations/meta/0044_snapshot.json` (new)
- `packages/db/src/migrations/meta/_journal.json` (new entry only)
- `packages/api/src/lib/metrics.ts`
- `apps/server/src/routes/health-metrics.ts`
- `packages/api/src/tests/unit/metrics-exposition.test.ts`
- 12 repo files (list in M1 above)

## Commits
- `6148c5de` `fix(db): drop duplicate booking state-deadline index, document WIB timezone semantics`
- `031119ef` `refactor(metrics): inject provider/mode/version from route caller, stop reading env in exposition`
- `0de2f717` `refactor(api): explicit column lists for repo leaf queries`
- `cf020a06` `docs: add worker report for backend hygiene wave`
- `1c1c1d90` `chore(db): format 0044 snapshot` (lefthook oxfmt normalization of the generated snapshot)

## Verification evidence
- `bun run lint`: 0 errors; the only `metrics.ts` warnings (`no-array-sort`, `no-underscore-dangle`)
  verified pre-existing via `git stash` comparison. No warnings in touched repo/caller/test files
  beyond pre-existing service/test helper notes.
- `bun run check-types` (turbo gate): 4 successful, 0 failed. Direct `tsgo -p packages/api` shows
  only pre-existing `xendit-payment.provider.test.ts` errors (confirmed identical on clean tree).
- `bun test` metrics: 16 pass / 0 fail (exposition + path). Repo suites: 237 pass / 0 fail across
  13 files (metrics ×2 + 11 repo suites incl. booking, admin-booking, payment, wallet, support,
  notification, room, achievement, tutor, admin, admin-mark-package).
- `oxfmt --check` on all 16 touched source files: clean (5 files auto-formatted with `oxfmt --write`).
- Migration: `drizzle-kit migrate` on local `cogito-test` (docker-compose.test.yml) applied
  successfully; `SELECT indexname FROM pg_indexes` confirms only `idx_booking_status_deadline`
  remains; `drizzle-kit check` clean.
- `apps/server/src/health-version.test.ts` fails identically before/after (missing
  `apps/server/.env.test`, env-gated) — pre-existing, unrelated.

## Behavior-change note (AGENTS.md rule 11)
No user-visible behavior change: exposition output identical for the same inputs (caller injects
the same values the lib previously read); index coverage for the expiry sweep unchanged (same
columns, kept name); timezone semantics documented as already implemented. Hence no
CONTEXT/RUNBOOK/API-REFERENCE updates.

## Remains / blocked questions (no guessing — recorded, not resolved)
1. `modules/meeting/google-meeting.provider.ts` (3 bare selects) + `fallback.provider.ts` (1) were
   audited but left untouched — outside the allowed file set (not `*.repo.ts`). If the lead wants
   them tightened, confirm scope extension first.
2. `GIT_SHA` is not part of the validated env schema (`packages/env`, out of scope), so the
   `/metrics` caller still reads `process.env.GIT_SHA` once and passes it as `version`. If the
   lead prefers zero `process.env` reads in `apps/server` too, that requires adding `GIT_SHA`
   (or `APP_VERSION`) to the env package — needs explicit approval.
3. No `docs/plans` or CONTEXT edits made per scope; lead to confirm nothing else needs syncing.
