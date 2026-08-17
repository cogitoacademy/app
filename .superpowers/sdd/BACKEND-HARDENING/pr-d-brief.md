## PR D — Test Realignment (mock-heavy remediation)

### Task D1: Real-DB wallet + booking repo tests

**Files:**

- Create: `packages/api/src/tests/integration/repo-wallet.test.ts`
- Create: `packages/api/src/tests/integration/repo-booking.test.ts`

**Interfaces:**

- Consumes: real `db` from `@cogito-app/db`, `resetDatabase()` from `helpers/test-client.ts`, `factories.ts`.
- Produces: repo-layer tests that run real SQL against Postgres (replacing fake query-chain assertions).

- [ ] **Step 1:** Study existing integration harness (`packages/api/src/tests/integration/wallet-ledger.test.ts`, `helpers/test-client.ts:80-85`). Follow the same `beforeAll` reset + `createTestClient` pattern.

- [ ] **Step 2:** `repo-wallet.test.ts` — test `createWalletRepo(realDb)`:
- `getOrCreate` inserts a wallet row with total=0, held=0, available=0.
- `atomicHold` increases held + total; `atomicRelease` decreases held + available; `atomicDeduct` decreases available + total.
- Balance guard: attempting to deduct more than available throws / returns an error (assert real DB behavior).
- Ledger: `insertLedgerEntry` + duplicate `eventKey`/`sourceReference` violates the `ledger_walletId_eventKey_sourceReference_uniq` constraint (assert the unique violation error).

- [ ] **Step 3:** `repo-booking.test.ts` — test `createBookingRepo(realDb)`:
- `insertBooking` + `findBookingById` round-trip with all explicit columns.
- `updateBookingVersioned` optimistic lock: update with wrong `version` → throws; correct version → updates and bumps version.
- `findOverlappingBookings` returns overlap for the composite-indexed time range; returns none for non-overlapping.
- `listBookingsByProposer` cursor pagination: page 1 + page 2 via `nextCursor` return disjoint sets (exercises `gt(booking.id, cursor)` SQL).

- [ ] **Step 4:** Verify.

Run: `bun test --env-file apps/server/.env packages/api/src/tests/integration/repo-wallet.test.ts packages/api/src/tests/integration/repo-booking.test.ts`
Expected: PASS against real Postgres.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/tests/integration/repo-wallet.test.ts packages/api/src/tests/integration/repo-booking.test.ts
git commit -m "test: real-DB repo tests for wallet and booking"
```

### Task D2: Real-Redis integration tests

**Files:**

- Create: `packages/api/src/tests/integration/redis-real.test.ts`

**Interfaces:**

- Consumes: `REDIS_URL` from env; `IdempotencyStore`, `rateLimit`, `CircuitBreaker` from `packages/api/src/lib`.
- Produces: distributed-atomicity verification against real Redis (CI provisions redis; local via Task B2).

- [ ] **Step 1:** Skip if `REDIS_URL` unset:

```ts
const hasRedis = !!process.env.REDIS_URL;
const maybe = hasRedis ? describe : describe.skip;
```

- [ ] **Step 2:** Write tests:
- `IdempotencyStore.getOrSet`: two concurrent calls with the same key execute the factory once (track call count).
- `rateLimit`: exceed threshold → `allowed:false`, `retryAfterMs > 0`; reset after TTL.
- `CircuitBreaker`: after N failures → opens; cooldown then half-open; recovery on success.

Use real `initRedis(process.env.REDIS_URL)`; clean keys between tests (unique keys or prefix-scoped `flushdb`). Add `afterAll(() => redis.quit())`.

- [ ] **Step 3:** Verify with local Redis.

Run:

```bash
docker compose -f docker-compose.test.yml up -d
REDIS_URL=redis://localhost:6379 bun test --env-file apps/server/.env packages/api/src/tests/integration/redis-real.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/tests/integration/redis-real.test.ts
git commit -m "test: real-Redis integration tests for idempotency, rate limit, circuit breaker"
```

### Task D3: Scheduler job integration tests

**Files:**

- Create: `packages/api/src/tests/integration/scheduler-expiry.test.ts`
- Create: `packages/api/src/tests/integration/scheduler-holds.test.ts`

**Interfaces:**

- Consumes: `services.booking.expireBookings()`, `services.booking.releaseExpiredHolds()`, `factories.ts` booking/wallet factories, real DB.
- Produces: the two highest-risk untested paths are covered end-to-end.

- [ ] **Step 1:** `scheduler-expiry.test.ts`:
- Insert a booking in `pending_confirmed` with `deadlineAt` in the past + hold in wallet.
- Call `await services.booking.expireBookings()`.
- Assert: booking `currentState === "expired"`, wallet hold released (held decreased, available restored), ledger `release` entry exists, notification row created for the affected user.

- [ ] **Step 2:** `scheduler-holds.test.ts`:
- Insert a booking with a hold that has exceeded its window (use `RESPONSE_WINDOW_MS` semantics).
- Call `await services.booking.releaseExpiredHolds()`.
- Assert holds released and ledger entries recorded.

> These mirror N1/N3 bug fixes (the exact paths that were historically broken) — the most valuable missing tests. If `expireBookings` requires `SCHEDULER_ENABLED`, call the service method directly (it doesn't depend on BullMQ).

- [ ] **Step 3:** Verify.

Run: `bun test --env-file apps/server/.env packages/api/src/tests/integration/scheduler-expiry.test.ts packages/api/src/tests/integration/scheduler-holds.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/tests/integration/scheduler-expiry.test.ts packages/api/src/tests/integration/scheduler-holds.test.ts
git commit -m "test: scheduler expiry and hold-release integration tests"
```

### Task D4: Broaden integration coverage (room, refund, achievement, admin-override)

**Files:**

- Create: `packages/api/src/tests/integration/room-flow.test.ts`
- Create: `packages/api/src/tests/integration/refund-flow.test.ts`
- Create: `packages/api/src/tests/integration/achievement-flow.test.ts`
- Modify: `packages/api/src/tests/integration/admin-override.test.ts` (add happy path)

**Interfaces:**

- Consumes: `createTestClient`, `factories.ts`, real DB.
- Produces: happy-path integration coverage for the 4 modules currently mock-only.

- [ ] **Step 1:** `room-flow.test.ts` — admin `room.assign` happy path: assign a room to a booking → `roomBooking` row with status `confirmed`; conflicting assign to overlapping slot → error.

- [ ] **Step 2:** `refund-flow.test.ts` — `adminRefund`/`refund.createCorrection` happy path: create a paid booking, issue a correction, assert wallet `compensate_credit`/refundRecord rows + ledger entries.

- [ ] **Step 3:** `achievement-flow.test.ts` — student `achievement.create` → row `pending`; admin `adminReview` approve → `approved` + notification; reject path.

- [ ] **Step 4:** `admin-override.test.ts` — add happy path: apply override on a real booking, assert booking state change + `bookingStateHistory` row + wallet impact (uses real DB).

- [ ] **Step 5:** Verify all integration tests pass against real DB.

Run: `bun test --env-file apps/server/.env packages/api/src/tests/integration/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/tests/integration/
git commit -m "test: add room, refund, achievement, and admin-override happy-path integration tests"
```

---

## PR E — Spec / Docs Sync
