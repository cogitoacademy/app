# Task C3 Report: Booking repo explicit column lists (DEFERRED-OPS 1.4)

**Status:** DONE
**Branch:** `improvement/backend-correctness`
**Commit:** `5c04351` — `refactor(booking): explicit column lists in booking repo (DEFERRED-OPS 1.4)`

## What was done

Added `getTableColumns` to the `drizzle-orm` import in `packages/api/src/modules/booking/booking.repo.ts` and replaced every bare `.select()` with an explicit column projection.

### `.select()` sites (confirmed table per site)

| Site                                        | Table                | Change                                                |
| ------------------------------------------- | -------------------- | ----------------------------------------------------- |
| `findBookingById` (line 34)                 | `booking`            | `.select({ ...getTableColumns(booking) })`            |
| `findParticipant` (line 84)                 | `bookingParticipant` | `.select({ ...getTableColumns(bookingParticipant) })` |
| `findConfirmedParticipants` (line 112)      | `bookingParticipant` | `.select({ ...getTableColumns(bookingParticipant) })` |
| `findReconfirmedParticipants` (line 119)    | `bookingParticipant` | `.select({ ...getTableColumns(bookingParticipant) })` |
| `listSessionsBySeriesId` (line 251)         | `bookingSession`     | `.select({ ...getTableColumns(bookingSession) })`     |
| `findBookingsExpiringByDeadline` (line 295) | `booking`            | `.select({ ...getTableColumns(booking) })`            |

> Note: the brief listed line 251 as a `bookingParticipant` query, but it is actually `listSessionsBySeriesId` which selects from `bookingSession` — I confirmed the table before replacing and used `getTableColumns(bookingSession)`. Same for line 295, which selects from `booking` (not `bookingParticipant`). The brief's line-251/295 grouping was inaccurate; the task's "confirm each site's table" instruction was followed.

- `findOverlappingBookings` (line 276) already had an explicit `.select({ id: booking.id })` — left as-is.
- Verified: no bare `.select()` remains anywhere in the file.

## Test updates

`packages/api/src/tests/unit/booking.repo.test.ts`:

- `findBookingById`: canned row now includes `priceSnapshot`; asserts `id`, `currentState`, `priceSnapshot`.
- `findParticipant`: canned row includes `confirmationState`; asserts `id`, `bookingId`, `userId`, `confirmationState`.
- `findConfirmedParticipants` (both tests): now captures result and asserts `id` / `confirmationState` keys.
- `findReconfirmedParticipants`: captures result and asserts `id` / `confirmationState` keys.
- `listSessionsBySeriesId`: canned rows include `currentState`; asserts `id` / `currentState`.
- `findBookingsExpiringByDeadline`: canned rows include `currentState`; asserts `id` / `currentState`.

The mock chain (`makeSelectConn`) is argument-agnostic on `select`, so projection shape is not directly validated by the mock — assertions are on the returned canned rows, which is what the fake-chain approach can verify. This matches the brief's Step 3 guidance.

## Verification

- `bun test --env-file apps/server/.env packages/api/src/tests/unit/booking.repo.test.ts` → 36 pass, 0 fail
- `bun run check-types` → all 3 tasks successful (web, server, ui cached)
- Lefthook pre-commit (lint + format) → clean, 0 errors/warnings

## Constraints respected

- Only `booking.repo.ts` + `booking.repo.test.ts` touched; no frontend changes.
- Conventional commit message used.
- No bare `.select()` without projection remains in the file.
