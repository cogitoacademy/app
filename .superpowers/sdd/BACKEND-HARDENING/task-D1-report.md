# Task D1 Report — Real-DB wallet + booking repo tests

**Status:** DONE_WITH_CONCERNS

**Branch:** `test/backend-realignment`

## Work performed

Added two real-Postgres integration test files:

1. `packages/api/src/tests/integration/repo-wallet.test.ts`
2. `packages/api/src/tests/integration/repo-booking.test.ts`

Both follow the existing harness pattern (`bun:test`, `resetDatabase()` in `beforeAll`,
`createTestUser` from `tests/helpers/factories.ts`).

### wallet tests (9)

- `getOrCreate` inserts a zeroed wallet (total=0, held=0, available=0) for a new user
- `getOrCreate` returns the existing wallet and does not insert a duplicate row
- `atomicHold` moves available→held and writes a `hold` ledger entry
- `atomicRelease` moves held→available and writes a `release` ledger entry
- `atomicDeduct` reduces total+held and writes a `deduct` ledger entry
- `atomicHold` guard: hold > available returns `{ success: false, reason: "insufficient_balance" }` and leaves balances unchanged
- `service.hold` throws `InsufficientBalanceError` when available is exceeded
- deducting more than held throws `InsufficientBalanceError`
- duplicate `eventKey`+`sourceReference` ledger insert raises a unique-violation error (asserted to throw)

### booking tests (6)

- `insertBooking` + `findBookingById` round-trip with explicit columns (type, modality, tutorId, proposerId, targetGroupSize, originalMarks, holdAmount, confirmedHeadcount, version, currentState, scheduledStartAt)
- `updateBookingVersioned` rejects a stale version (returns null)
- `updateBookingVersioned` updates + bumps version on matching version (1→2→3)
- `findOverlappingBookings` returns the booking for overlapping time ranges
- `findOverlappingBookings` returns `[]` for non-overlapping ranges
- `listBookingsByProposer` cursor pagination: page 1 + page 2 via `nextCursor` return disjoint sets (cursor = last item's `scheduledStartAt.toISOString()`)

## API discrepancy from the brief

The brief said "Test `createWalletRepo(db)`" with a `getOrCreate(userId)` method.
In the actual code:

- `createWalletRepo()` takes **no arguments** (see `wallet.repo.ts:270`)
- `getOrCreate` lives on the **wallet service** (`createWalletService(repo, db)`, `wallet.service.ts:141`), which wraps `repo.getByUserId` + `repo.upsert`

Resolution: tested the repo's atomic ops directly, and tested `getOrCreate` through
the production wiring `createWalletService(createWalletRepo(), db)` — the same path
`services.wallet.getOrCreate` uses. Behavior verified matches the brief's intent.

## Verification

Command:

```
bun test --env-file apps/server/.env packages/api/src/tests/integration/repo-wallet.test.ts packages/api/src/tests/integration/repo-booking.test.ts
```

Result: **15 pass, 0 fail, 61 expect() calls** (real Postgres at localhost:6767).

Typecheck (`bunx tsc --noEmit -p packages/api/tsconfig.json`): the two new files are
clean. Pre-existing errors remain in `src/tests/helpers/test-client.ts:22`
(`createRouterClient` generic arity) and `src/tests/integration/tutor-availability.test.ts`
(`possibly undefined`) — not introduced by this task.

## Concerns

- The brief's wallet API signature (`createWalletRepo(db)` / repo `getOrCreate`) does not
  match the current codebase. Test adapted to the real API; `getOrCreate` is exercised via
  the service. If the intent was to test a different wallet implementation, that variant is
  not present on this branch.
- Pre-existing typecheck errors in other test files are unrelated to this task.
