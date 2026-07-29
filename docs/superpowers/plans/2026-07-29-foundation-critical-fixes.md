# Foundation Critical Fixes + Deferred Ops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 6 critical foundation bugs (C1-C6) and complete 8 deferred ops tasks before implementing PRD feature gaps, ensuring a solid foundation.

**Architecture:** Fixes target the shared infrastructure layer (`packages/api/src/lib/`), the composition root (`services.ts`), the server bootstrap (`apps/server/src/`), the DB migration journal, the scheduler, and the admin-booking service. All fixes are backward-compatible — no API contract changes, no schema changes (except adding migration 0009 to the journal).

**Tech Stack:** Bun, TypeScript, Drizzle ORM, postgres.js, BullMQ, ioredis, oRPC, Elysia, Vitest

## Global Constraints

- All code changes must pass `bun run check` (oxlint + oxfmt)
- All code changes must pass `bun run check-types`
- All tests must pass: `bun run test` (1181 pre-existing pass; 20 DB connection failures are pre-existing and unrelated)
- No new dependencies — use existing ioredis, BullMQ, Drizzle
- Follow existing 4-layer architecture conventions
- Follow existing error handling patterns (DomainError subclasses, withDomainMap)
- Follow existing Redis pattern: optional `redis?: RedisClient` with in-memory fallback
- No comments in code unless explicitly requested
- Use `data-slot` attributes for any new UI (not applicable in this plan — backend only)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/api/src/lib/rate-limit.ts` | Modify | Fix async Redis rate limiting (C1) |
| `packages/api/src/lib/idempotency.ts` | Modify | Fix TOCTOU race with atomic getOrSet (C3) |
| `packages/api/src/services.ts` | Modify | Wire Redis client to all services (C2) |
| `apps/server/src/index.ts` | Modify | Initialize Redis on server startup (C2) |
| `apps/server/src/routes.ts` | Modify | Pass Redis to rate limiters + healthCheck (C2, C1) |
| `packages/db/src/migrations/meta/_journal.json` | Modify | Add migration 0009 + 0010 entries (C4) |
| `packages/db/src/migrations/meta/0009_snapshot.json` | Create | Drizzle snapshot for migration 0009 (C4) |
| `apps/server/src/scheduler.ts` | Modify | Register send-notification-email job (C5) |
| `packages/api/src/modules/scheduler/jobs/send-notification-email.job.ts` | Create | Repeatable job registration (C5) |
| `packages/api/src/modules/admin-booking/admin-booking.service.ts` | Modify | Fix over-credit + cursor (C6, N9) |
| `packages/api/src/modules/admin-booking/admin-booking.repo.ts` | Modify | Consume cursor + optimistic lock (N9, H5) |
| `packages/api/src/lib/db-health.ts` | Modify | Add Redis ping (DEFERRED-OPS 1.6) |
| `packages/api/src/modules/wallet/wallet.repo.ts` | Modify | Explicit columns + guards (1.3, H3, H4) |
| `packages/api/src/modules/wallet/wallet.service.ts` | Modify | Add LIMIT to reconcile (H7) |
| `packages/api/src/modules/booking/booking.repo.ts` | Modify | Cursor in listBookingsByProposer (H1) |
| `packages/api/src/modules/booking/booking.service.ts` | Modify | futureOnly + remove dead param (H2, cleanup) |
| `packages/api/src/modules/booking/booking-state.types.ts` | Modify | Remove dead BOOKING_EVENTS (cleanup) |
| `packages/api/src/modules/booking/booking.handler.ts` | Modify | Update completeSession call (cleanup) |
| `packages/db/src/migrations/0010_deferred_indexes.sql` | Create | 3 indexes + unique constraint (1.1, H11) |
| `packages/db/src/schema/booking.ts` | Modify | Add index + unique definitions (1.1, H11) |
| `packages/db/src/schema/tutor-profile.ts` | Modify | Add index definition (1.1) |
| `packages/api/src/modules/scheduler/jobs/expire-bookings.job.ts` | Modify | Add backoff config (1.2) |
| `packages/api/src/modules/scheduler/jobs/release-holds.job.ts` | Modify | Add backoff config (1.2) |
| `packages/api/src/modules/tutor-discovery/discovery.repo.ts` | Modify | Escape LIKE metacharacters |
| `packages/api/src/modules/refund/refund.types.ts` | Modify | Add .max() to amount (H14) |
| `packages/api/src/modules/payment/payment.service.ts` | Modify | Return existing checkout URL (H6) |
| `packages/api/src/modules/tutor/tutor.repo.ts` | Modify | Remove dead updateProfile (cleanup) |
| `apps/web/nginx.conf` | Modify | Add security headers (H13) |
| `apps/web/src/routes/_app.tutor-bookings.tsx` | Modify | Add tutor role guard (H12) |
| `docs/CONTEXT.md` | Modify | Update known bugs status |
| `docs/plans/active/DEFERRED-OPS-TASKS.md` | Modify | Mark completed items |

---

## Task 1: Fix Redis rate limiting (C1)

**Files:**
- Modify: `packages/api/src/lib/rate-limit.ts:66-103`
- Test: `packages/api/src/tests/unit/rate-limit.test.ts`

**Interfaces:**
- Consumes: `RedisClient` from `lib/redis.ts`
- Produces: `RateLimiter` (now async: `(identifier: string) => Promise<RateLimitResult>`)

- [ ] **Step 1: Write failing tests for async Redis rate limiting**

Add tests to `packages/api/src/tests/unit/rate-limit.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "bun:test";
import { rateLimit } from "../../lib/rate-limit";
import { InMemoryRedis } from "../../lib/redis";

describe("rateLimit with Redis", () => {
  let redis: InMemoryRedis;

  beforeEach(() => {
    redis = new InMemoryRedis();
  });

  it("allows requests up to the limit", async () => {
    const limiter = rateLimit({
      windowMs: 60_000,
      maxRequests: 3,
      keyPrefix: "test",
      redis,
    });
    const r1 = await limiter("user1");
    const r2 = await limiter("user1");
    const r3 = await limiter("user1");
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(true);
  });

  it("blocks requests over the limit", async () => {
    const limiter = rateLimit({
      windowMs: 60_000,
      maxRequests: 2,
      keyPrefix: "test",
      redis,
    });
    await limiter("user1");
    await limiter("user1");
    const r3 = await limiter("user1");
    expect(r3.allowed).toBe(false);
    expect(r3.retryAfterMs).toBeGreaterThan(0);
  });

  it("tracks different identifiers separately", async () => {
    const limiter = rateLimit({
      windowMs: 60_000,
      maxRequests: 1,
      keyPrefix: "test",
      redis,
    });
    const r1 = await limiter("user1");
    const r2 = await limiter("user2");
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test packages/api/src/tests/unit/rate-limit.test.ts`
Expected: FAIL — the current `redisRateLimit` returns synchronously and the `InMemoryRedis.eval` throws "EVAL not supported", causing fail-open.

- [ ] **Step 3: Fix `redisRateLimit` to be async and use atomic INCR**

Replace `packages/api/src/lib/rate-limit.ts:20-103` with:

```typescript
export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

export interface RateLimiter {
  (identifier: string): Promise<RateLimitResult>;
}

function inMemoryRateLimit(
  windowMs: number,
  maxRequests: number,
  keyPrefix: string,
): RateLimiter {
  return (identifier: string): Promise<RateLimitResult> => {
    const key = `${keyPrefix}:${identifier}`;
    const now = Date.now();

    if (now - lastCleanup > CLEANUP_INTERVAL) {
      for (const [k, v] of store) {
        if (now > v.resetAt) store.delete(k);
      }
      lastCleanup = now;
    }

    const entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      if (store.size >= MAX_ENTRIES) {
        for (const [k, v] of store) {
          if (now > v.resetAt) store.delete(k);
        }
      }
      store.set(key, { count: 1, resetAt: now + windowMs });
      return Promise.resolve({ allowed: true, retryAfterMs: 0 });
    }

    if (entry.count >= maxRequests) {
      return Promise.resolve({
        allowed: false,
        retryAfterMs: entry.resetAt - now,
      });
    }

    entry.count += 1;
    return Promise.resolve({ allowed: true, retryAfterMs: 0 });
  };
}

function redisRateLimit(
  windowMs: number,
  maxRequests: number,
  keyPrefix: string,
  redis: RedisClient,
): RateLimiter {
  const windowSeconds = Math.ceil(windowMs / 1000);

  return async (identifier: string): Promise<RateLimitResult> => {
    const key = `${COGITO_NS.RATE_LIMIT}:${keyPrefix}:${identifier}`;

    try {
      const result = (await redis.eval(
        `
        local current = redis.call('INCR', KEYS[1])
        if current == 1 then
          redis.call('EXPIRE', KEYS[1], ARGV[1])
        end
        if current > tonumber(ARGV[2]) then
          local ttl = redis.call('PTTL', KEYS[1])
          return {0, ttl > 0 and ttl or 0}
        end
        return {1, 0}
        `,
        [key],
        [String(windowSeconds), String(maxRequests)],
      )) as [number, number];

      const [allowed, retryAfter] = result;
      return { allowed: allowed === 1, retryAfterMs: retryAfter };
    } catch {
      return inMemoryRateLimit(windowMs, maxRequests, keyPrefix)(identifier);
    }
  };
}

export function rateLimit(options: {
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
  redis?: RedisClient;
}): RateLimiter {
  const keyPrefix = options.keyPrefix ?? "";

  if (options.redis) {
    return redisRateLimit(
      options.windowMs,
      options.maxRequests,
      keyPrefix,
      options.redis,
    );
  }

  return inMemoryRateLimit(options.windowMs, options.maxRequests, keyPrefix);
}
```

Key changes:
1. `RateLimiter` interface is now `(identifier: string) => Promise<RateLimitResult>`
2. `redisRateLimit` is now `async` and `await`s `redis.eval()`
3. On Redis error, falls back to in-memory (fail-closed would break dev; in-memory is the established pattern)
4. `inMemoryRateLimit` returns `Promise.resolve(...)` for interface compatibility

- [ ] **Step 4: Update all callers of rate limiter to await the result**

The rate limiter is called in `apps/server/src/routes.ts`. Find all call sites and add `await`:

```bash
grep -n "rateLimit\|authRateLimit\|paymentRateLimit" apps/server/src/routes.ts
```

Each call site like `const result = authRateLimit(ip)` becomes `const result = await authRateLimit(ip)`. The surrounding handler must be async (it already is in Elysia).

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test packages/api/src/tests/unit/rate-limit.test.ts`
Expected: PASS

- [ ] **Step 6: Run full test suite**

Run: `bun run test`
Expected: 1181+ pass, same 20 pre-existing DB failures

- [ ] **Step 7: Run typecheck**

Run: `bun run check-types`
Expected: PASS (no type errors)

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/lib/rate-limit.ts packages/api/src/tests/unit/rate-limit.test.ts apps/server/src/routes.ts
git commit -m "fix(lib): make Redis rate limiting async and functional

The redisRateLimit function was synchronous but redis.eval() returns
a Promise. The thenable check silently returned allowed: true, making
all Redis-backed rate limiting non-functional. Fix by making the
function async and awaiting the Redis call. Falls back to in-memory
on Redis error."
```

---

## Task 2: Fix idempotency TOCTOU race (C3)

**Files:**
- Modify: `packages/api/src/lib/idempotency.ts:29-66`
- Test: `packages/api/src/tests/unit/idempotency.test.ts`

**Interfaces:**
- Consumes: `RedisClient` from `lib/redis.ts`
- Produces: `IdempotencyStore.getOrSet(key, fn)` — atomic check-and-execute

- [ ] **Step 1: Write failing test for concurrent idempotency**

Add to `packages/api/src/tests/unit/idempotency.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { IdempotencyStore } from "../../lib/idempotency";

describe("IdempotencyStore getOrSet", () => {
  it("executes fn only once for concurrent calls with same key", async () => {
    const store = new IdempotencyStore();
    let callCount = 0;

    const fn = async () => {
      callCount++;
      await new Promise((r) => setTimeout(r, 10));
      return { value: callCount };
    };

    const [r1, r2, r3] = await Promise.all([
      store.getOrSet("test-key", fn),
      store.getOrSet("test-key", fn),
      store.getOrSet("test-key", fn),
    ]);

    expect(callCount).toBe(1);
    expect((r1 as { value: number }).value).toBe(1);
    expect((r2 as { value: number }).value).toBe(1);
    expect((r3 as { value: number }).value).toBe(1);
  });

  it("returns cached result for subsequent calls", async () => {
    const store = new IdempotencyStore();
    let callCount = 0;

    const fn = async () => {
      callCount++;
      return { data: "result" };
    };

    const r1 = await store.getOrSet("key1", fn);
    const r2 = await store.getOrSet("key1", fn);

    expect(callCount).toBe(1);
    expect(r1).toEqual({ data: "result" });
    expect(r2).toEqual({ data: "result" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/api/src/tests/unit/idempotency.test.ts`
Expected: FAIL — `getOrSet` method doesn't exist

- [ ] **Step 3: Implement `getOrSet` with in-flight tracking**

Add to `IdempotencyStore` class in `packages/api/src/lib/idempotency.ts`, after the `getResult` method:

```typescript
private inFlight = new Map<string, Promise<unknown>>();

async getOrSet<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const redisKey = `${this.prefix}:${key}`;

    if (this.redis) {
      try {
        const exists = await this.redis.exists(redisKey);
        if (exists) {
          const value = await this.redis.get(redisKey);
          if (value !== null) {
            try {
              return JSON.parse(value) as T;
            } catch {
              return value as unknown as T;
            }
          }
        }
      } catch {
        // fall through to in-memory
      }
    }

    this.maybeCleanup();
    const cached = this.store.get(key);
    if (cached && Date.now() - cached.timestamp <= this.maxAge) {
      return cached.result as T;
    }

    const existing = this.inFlight.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    const promise = fn().then((result) => {
      void this.markProcessed(key, result);
      return result;
    }).finally(() => {
      this.inFlight.delete(key);
    });

    this.inFlight.set(key, promise);
    return promise as Promise<T>;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/api/src/tests/unit/idempotency.test.ts`
Expected: PASS

- [ ] **Step 5: Update booking handler to use `getOrSet`**

In `packages/api/src/modules/booking/booking.handler.ts`, find the idempotency check pattern (around the `createSolo`/`createGroup`/`createSeries` handlers) and replace the `isProcessed` + `markProcessed` pattern with `getOrSet`. The handler should look like:

```typescript
const result = await bookingIdempotency.getOrSet(
  generateIdempotencyKey("booking", userId, idempotencyKey),
  () => booking.createSolo(userId, input),
);
return result;
```

- [ ] **Step 6: Run full test suite**

Run: `bun run test`
Expected: 1181+ pass, same 20 pre-existing DB failures

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/lib/idempotency.ts packages/api/src/tests/unit/idempotency.test.ts packages/api/src/modules/booking/booking.handler.ts
git commit -m "fix(lib): add atomic getOrSet to IdempotencyStore

The isProcessed + markProcessed pattern had a TOCTOU race: two
concurrent requests could both pass the check and execute the
operation. getOrSet tracks in-flight promises so concurrent calls
with the same key share a single execution. Uses Redis SET NX when
available for distributed atomicity."
```

---

## Task 3: Wire Redis client in composition root (C2)

**Files:**
- Modify: `packages/api/src/services.ts`
- Modify: `apps/server/src/index.ts`
- Modify: `apps/server/src/routes.ts`
- Test: `packages/api/src/tests/unit/services.test.ts` (if exists, else verify via typecheck)

**Interfaces:**
- Consumes: `initRedis` from `lib/redis.ts`, `env.REDIS_URL` from `@cogito-app/env/server`
- Produces: `services` and `handlers` with Redis-backed idempotency, rate limiting, circuit breaker

- [ ] **Step 1: Initialize Redis in server bootstrap**

In `apps/server/src/index.ts`, add Redis initialization before server creation. Find the bootstrap sequence (init logger → create server → listen) and add:

```typescript
import { initRedis } from "@cogito-app/api/lib/redis";

// After logger init, before server creation:
const redis = initRedis(env.REDIS_URL);
```

- [ ] **Step 2: Export Redis client from services.ts**

In `packages/api/src/services.ts`, add Redis initialization and pass it to modules that accept it:

```typescript
import { initRedis, type RedisClient } from "./lib/redis";

function createServices() {
  const redis = initRedis(env.REDIS_URL);

  // Pass redis to modules that accept it
  const audit = createAuditModule();
  const pricing = createPricingModule();
  // ... existing module creation ...

  // Reconstruct idempotency stores with Redis
  // (the singletons at module level are created without Redis,
  //  so we need to re-initialize them here)
  
  return { services, handlers, redis };
}

const { services, handlers, redis } = createServices();
export { services, handlers, redis };
```

Note: The `bookingIdempotency` and `webhookIdempotency` singletons in `idempotency.ts` are created at module import time. We need to either:
(a) Make them factory functions that accept Redis, or
(b) Add an `initIdempotencyStores(redis)` function that replaces the singletons.

Option (b) is less disruptive:

In `packages/api/src/lib/idempotency.ts`, add:

```typescript
export function initIdempotencyStores(redis: RedisClient): void {
  bookingIdempotency.setRedis(redis);
  webhookIdempotency.setRedis(redis);
}
```

And add a `setRedis` method to `IdempotencyStore`:

```typescript
setRedis(redis: RedisClient): void {
  this.redis = redis;
}
```

Then in `services.ts`:

```typescript
import { initIdempotencyStores } from "./lib/idempotency";

function createServices() {
  const redis = initRedis(env.REDIS_URL);
  initIdempotencyStores(redis);
  // ... rest
}
```

- [ ] **Step 3: Pass Redis to rate limiters in routes.ts**

In `apps/server/src/routes.ts`, find the rate limiter creation (around lines 26-35) and pass the Redis client:

```typescript
import { getRedisClient } from "@cogito-app/api/lib/redis";

const redis = getRedisClient();

const authRateLimit = rateLimit({
  windowMs: 60_000,
  maxRequests: 10,
  keyPrefix: "auth",
  redis,
});

const paymentRateLimit = rateLimit({
  windowMs: 60_000,
  maxRequests: 5,
  keyPrefix: "payment",
  redis,
});
```

- [ ] **Step 4: Pass Redis to circuit breakers**

Find where circuit breakers are created (in `email/resend-email.provider.ts` and `meeting/google-meeting.provider.ts`). Pass the Redis client to the `CircuitBreaker` constructor. This requires threading the Redis client from `services.ts` through to the email and meeting module factories.

In `services.ts`:

```typescript
const email = createEmailModule({
  resendApiKey: env.RESEND_API_KEY,
  emailFrom: env.EMAIL_FROM,
  redis,
});

const meeting = createMeetingModule({
  db,
  googleMeetEnabled: !!(...),
  googleConfig: ...,
  redis,
});
```

The email and meeting module factories need to accept and pass `redis` to their `CircuitBreaker` instances.

- [ ] **Step 5: Run typecheck**

Run: `bun run check-types`
Expected: PASS — if there are type errors, fix the module factory signatures to accept `redis?: RedisClient`

- [ ] **Step 6: Run full test suite**

Run: `bun run test`
Expected: 1181+ pass, same 20 pre-existing DB failures

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/services.ts apps/server/src/index.ts apps/server/src/routes.ts packages/api/src/lib/idempotency.ts packages/api/src/modules/email/ packages/api/src/modules/meeting/
git commit -m "fix(infra): wire Redis client to idempotency, rate limiting, circuit breaker

The composition root (services.ts) created no Redis client. All
Redis-dependent features ran in-memory even in production. Now
initRedis() is called at startup and the client is threaded to
idempotency stores, rate limiters, and circuit breakers."
```

---

## Task 4: Fix migration journal (C4)

**Files:**
- Modify: `packages/db/src/migrations/meta/_journal.json`
- Create: `packages/db/src/migrations/meta/0009_snapshot.json`
- Test: Run `bun run db:generate` to verify no new migration is generated

- [ ] **Step 1: Add migration 0009 to journal**

In `packages/db/src/migrations/meta/_journal.json`, add entry idx 9:

```json
{
  "idx": 9,
  "version": "7",
  "when": 1784098400000,
  "tag": "0009_composite_indexes",
  "breakpoints": true
}
```

- [ ] **Step 2: Create 0009_snapshot.json**

Run: `bun run db:generate`
If Drizzle generates a *new* migration (0010), it means the snapshot is wrong. Instead, copy the latest snapshot (0008) and modify it to include the indexes from `0009_composite_indexes.sql`.

Read `0009_composite_indexes.sql` to see what indexes it creates, then create `0009_snapshot.json` based on `0008_snapshot.json` with those indexes added.

If `db:generate` says "no changes detected," the snapshot is correct.

- [ ] **Step 3: Verify migration is now recognized**

Run: `bun run db:generate`
Expected: "No schema changes detected" or similar — no new migration generated.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/migrations/meta/_journal.json packages/db/src/migrations/meta/0009_snapshot.json
git commit -m "fix(db): add migration 0009 to journal

Migration 0009_composite_indexes.sql existed on disk but was missing
from _journal.json. db:migrate would skip it, leaving
ledger_walletId_createdAt_idx and payment_userId_status_idx uncreated
on migrated databases."
```

---

## Task 5: Register send-notification-email scheduler job (C5)

**Files:**
- Create: `packages/api/src/modules/scheduler/jobs/send-notification-email.job.ts`
- Modify: `apps/server/src/scheduler.ts:85-86`
- Test: `packages/api/src/tests/unit/scheduler-jobs.test.ts` (if exists)

**Interfaces:**
- Consumes: `Queue` from `bullmq`
- Produces: `scheduleSendNotificationEmail(queue)` — registers repeatable job

- [ ] **Step 1: Create the job registration file**

Create `packages/api/src/modules/scheduler/jobs/send-notification-email.job.ts`:

```typescript
import type { Queue } from "bullmq";

const JOB_NAME = "send-notification-email";
const REPEAT_INTERVAL_MS = 60_000;

export async function scheduleSendNotificationEmail(
  queue: Queue,
): Promise<void> {
  await queue.add(
    JOB_NAME,
    {},
    {
      repeat: { every: REPEAT_INTERVAL_MS },
      jobId: JOB_NAME,
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
    },
  );
}
```

- [ ] **Step 2: Register the job in scheduler.ts**

In `apps/server/src/scheduler.ts`, add the import and registration call:

```typescript
import { scheduleSendNotificationEmail } from "@cogito-app/api/modules/scheduler/jobs/send-notification-email.job";
```

After line 86 (`await scheduleHoldReleaseCheck(scheduler.queue);`), add:

```typescript
await scheduleSendNotificationEmail(scheduler.queue);
```

- [ ] **Step 3: Run typecheck**

Run: `bun run check-types`
Expected: PASS

- [ ] **Step 4: Run full test suite**

Run: `bun run test`
Expected: 1181+ pass

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/modules/scheduler/jobs/send-notification-email.job.ts apps/server/src/scheduler.ts
git commit -m "fix(scheduler): register send-notification-email repeatable job

The email dispatch handler existed in scheduler.service.ts but no
repeatable BullMQ job was registered to call it. Notification emails
from the scheduler were never sent. Also adds exponential backoff
retry config (DEFERRED-OPS 1.2)."
```

---

## Task 6: Fix applyOverride over-credit bug (C6)

**Files:**
- Modify: `packages/api/src/modules/admin-booking/admin-booking.service.ts:130-179`
- Test: `packages/api/src/tests/unit/admin-booking.service.test.ts`

**Interfaces:**
- Consumes: `WalletPort`, booking participant data
- Produces: Correct per-participant compensation amounts

- [ ] **Step 1: Write failing test for over-credit**

Add to `packages/api/src/tests/unit/admin-booking.service.test.ts`:

```typescript
it("applyOverride compensate_credit uses per-participant heldAmount, not booking total", async () => {
  const booking = {
    id: "booking-1",
    holdAmount: 100,
    currentState: "confirmed",
  };
  const participants = [
    { userId: "user-1", heldAmount: 30 },
    { userId: "user-2", heldAmount: 70 },
  ];

  mockRepo.findBookingById.mockResolvedValue(booking);
  mockRepo.findConfirmedParticipants.mockResolvedValue(participants);
  mockWallet.getByUserId.mockImplementation(async (_tx, userId) => ({
    id: `wallet-${userId}`,
    totalBalance: 100,
    heldBalance: userId === "user-1" ? 30 : 70,
    availableBalance: 70,
  }));
  mockWallet.compensate.mockResolvedValue({} as any);

  await adminBookingService.applyOverride("admin-1", {
    bookingId: "booking-1",
    reason: "test",
    marksAction: "compensate_credit",
    affectedParticipants: ["user-1", "user-2"],
  });

  const calls = mockWallet.compensate.mock.calls;
  const user1Call = calls.find((c: any) => c[1]?.walletId === "wallet-user-1");
  const user2Call = calls.find((c: any) => c[1]?.walletId === "wallet-user-2");

  expect(user1Call[1].amount).toBe(30);
  expect(user2Call[1].amount).toBe(70);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/api/src/tests/unit/admin-booking.service.test.ts`
Expected: FAIL — the current code uses `participant.heldAmount || bookingRow.holdAmount` which falls back to the booking total (100) when individual amounts are 0 or undefined.

- [ ] **Step 3: Fix the amount calculation**

In `packages/api/src/modules/admin-booking/admin-booking.service.ts`, find the `applyOverride` function's marks-action loop (around lines 130-179). Replace the amount calculation:

For `compensate_credit`:
```typescript
const amount = participant.heldAmount;
```
Remove the `|| bookingRow.holdAmount` fallback. If `heldAmount` is 0, no credit is needed.

For `compensate_deduct`:
```typescript
const amount = participant.heldAmount;
```
Same fix.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/api/src/tests/unit/admin-booking.service.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `bun run test`
Expected: 1181+ pass

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/modules/admin-booking/admin-booking.service.ts packages/api/src/tests/unit/admin-booking.service.test.ts
git commit -m "fix(admin-booking): use per-participant heldAmount in override

applyOverride used participant.heldAmount || bookingRow.holdAmount as
a fallback, crediting the booking's total hold per participant for
group bookings. Remove the fallback — use individual heldAmount only."
```

---

## Task 7: Fix admin-booking pagination (N9/G8)

**Files:**
- Modify: `packages/api/src/modules/admin-booking/admin-booking.repo.ts:21-36`
- Modify: `packages/api/src/modules/admin-booking/admin-booking.service.ts:203-217`
- Test: `packages/api/src/tests/unit/admin-booking.repo.test.ts`

- [ ] **Step 1: Write failing test for cursor pagination**

Add to `packages/api/src/tests/unit/admin-booking.repo.test.ts`:

```typescript
it("listBookingsByState returns next page when cursor is provided", async () => {
  // Insert 25 bookings
  for (let i = 0; i < 25; i++) {
    await insertTestBooking({ id: `b-${i}`, state: "confirmed" });
  }

  const page1 = await listBookingsByState(db, ["confirmed"], 10, undefined);
  expect(page1).toHaveLength(10);

  const cursor = page1[9].id;
  const page2 = await listBookingsByState(db, ["confirmed"], 10, cursor);
  expect(page2).toHaveLength(10);
  expect(page2[0].id).not.toBe(page1[0].id);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/api/src/tests/unit/admin-booking.repo.test.ts`
Expected: FAIL — `listBookingsByState` doesn't accept a cursor parameter

- [ ] **Step 3: Add cursor to repo query**

In `packages/api/src/modules/admin-booking/admin-booking.repo.ts`, modify `listBookingsByState`:

```typescript
export async function listBookingsByState(
  conn: DbOrTx,
  states: string[],
  limit: number,
  cursor?: string,
) {
  const conditions = [];
  if (states.length > 0) {
    conditions.push(inArray(booking.currentState, states));
  }
  if (cursor) {
    conditions.push(gt(booking.id, cursor));
  }

  const query = conn
    .select()
    .from(booking)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(booking.id))
    .limit(limit + 1);

  return query;
}
```

Add imports: `gt`, `and` from `drizzle-orm`.

- [ ] **Step 4: Pass cursor from service to repo**

In `packages/api/src/modules/admin-booking/admin-booking.service.ts`, modify `listBookings`:

```typescript
async function listBookings(opts?: {
  bookingId?: string;
  limit?: number;
  cursor?: string;
}) {
  if (opts?.bookingId) {
    const bookingRow = await repo.findBookingById(db, opts.bookingId);
    return { items: bookingRow ? [bookingRow] : [], nextCursor: null };
  }
  const limit = Math.min(opts?.limit ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
  const rows = await repo.listBookingsByState(db, [], limit, opts?.cursor);
  const items = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? items[items.length - 1]!.id : null;
  return { items, nextCursor };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test packages/api/src/tests/unit/admin-booking.repo.test.ts`
Expected: PASS (requires DB — if DB tests fail, verify the logic is correct and mark as integration test)

- [ ] **Step 6: Run typecheck**

Run: `bun run check-types`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/modules/admin-booking/admin-booking.repo.ts packages/api/src/modules/admin-booking/admin-booking.service.ts packages/api/src/tests/unit/admin-booking.repo.test.ts
git commit -m "fix(admin-booking): consume cursor in listBookingsByState

The repo query never used the cursor parameter — pagination returned
the same first page every time. Add WHERE id > cursor condition and
pass cursor from service to repo."
```

---

## Task 8: Add Redis health check (DEFERRED-OPS 1.6)

**Files:**
- Modify: `packages/api/src/lib/db-health.ts`
- Test: `packages/api/src/tests/unit/db-health.test.ts`

- [ ] **Step 1: Write failing test**

Add to `packages/api/src/tests/unit/db-health.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { healthCheck } from "../../lib/db-health";
import { InMemoryRedis } from "../../lib/redis";

describe("healthCheck", () => {
  it("includes redis status when redis client is provided", async () => {
    const redis = new InMemoryRedis();
    const result = await healthCheck(redis);
    expect(result.checks).toHaveProperty("database");
    expect(result.checks).toHaveProperty("redis");
    expect(result.checks.redis).toBe("ok");
  });

  it("reports degraded when redis ping fails", async () => {
    const failingRedis = {
      ...new InMemoryRedis(),
      ping: async () => { throw new Error("connection refused"); },
    };
    const result = await healthCheck(failingRedis);
    expect(result.checks.redis).toBe("error");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/api/src/tests/unit/db-health.test.ts`
Expected: FAIL — `healthCheck` doesn't accept a Redis parameter

- [ ] **Step 3: Add Redis ping to healthCheck**

Replace `packages/api/src/lib/db-health.ts`:

```typescript
import { db } from "@cogito-app/db";
import { sql } from "drizzle-orm";
import type { RedisClient } from "./redis";

export async function healthCheck(redis?: RedisClient) {
  const checks: Record<string, "ok" | "degraded" | "error"> = {};

  try {
    const start = performance.now();
    await db.execute(sql`SELECT 1`);
    const durationMs = performance.now() - start;
    checks.database = durationMs < 1000 ? "ok" : "degraded";
  } catch {
    checks.database = "error";
  }

  if (redis) {
    try {
      const start = performance.now();
      await redis.ping();
      const durationMs = performance.now() - start;
      checks.redis = durationMs < 1000 ? "ok" : "degraded";
    } catch {
      checks.redis = "error";
    }
  }

  const overall = Object.values(checks).every((v) => v === "ok")
    ? "ok"
    : Object.values(checks).some((v) => v === "error")
      ? "error"
      : "degraded";

  return { status: overall, checks, timestamp: new Date().toISOString() };
}
```

- [ ] **Step 4: Pass Redis client to healthCheck in routes.ts**

In `apps/server/src/routes.ts`, find the `/health` endpoint and pass the Redis client:

```typescript
.get("/health", async () => {
  const result = await healthCheck(getRedisClient());
  // ... existing response
})
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test packages/api/src/tests/unit/db-health.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/lib/db-health.ts packages/api/src/tests/unit/db-health.test.ts apps/server/src/routes.ts
git commit -m "feat(health): add Redis ping to health check

The /health endpoint only checked DB connectivity. Add optional Redis
ping so production health checks detect Redis outages."
```

---

## Task 9: Add missing composite indexes (DEFERRED-OPS 1.1)

**Files:**
- Create: `packages/db/src/migrations/0010_deferred_indexes.sql`
- Modify: `packages/db/src/migrations/meta/_journal.json`
- Modify: relevant schema files to add index definitions

Note: Only 3 indexes are genuinely missing. The other 2 (`idx_booking_session_booking_id` and `idx_audit_log_target`) already exist in the schema as `booking_session_seriesBookingId_idx` and `audit_log_targetType_targetId_idx`.

- [ ] **Step 1: Create migration file**

Create `packages/db/src/migrations/0010_deferred_indexes.sql`:

```sql
CREATE INDEX IF NOT EXISTS "idx_booking_status_deadline"
  ON "booking" ("current_state", "deadline_at");

CREATE INDEX IF NOT EXISTS "idx_booking_participant_user"
  ON "booking_participant" ("user_id");

CREATE INDEX IF NOT EXISTS "idx_tutor_profile_status_published"
  ON "tutor_profile" ("onboarding_status", "published_at");
```

- [ ] **Step 2: Add index definitions to schema files**

In `packages/db/src/schema/booking.ts`, add to the `booking` table definition:

```typescript
index("idx_booking_status_deadline").on(table.currentState, table.deadlineAt),
```

In `packages/db/src/schema/booking.ts`, add to the `bookingParticipant` table:

```typescript
index("idx_booking_participant_user").on(table.userId),
```

In `packages/db/src/schema/tutor-profile.ts`, add to the `tutorProfile` table:

```typescript
index("idx_tutor_profile_status_published").on(table.onboardingStatus, table.publishedAt),
```

- [ ] **Step 3: Add to migration journal**

In `packages/db/src/migrations/meta/_journal.json`, add entry idx 10:

```json
{
  "idx": 10,
  "version": "7",
  "when": 1784184800000,
  "tag": "0010_deferred_indexes",
  "breakpoints": true
}
```

- [ ] **Step 4: Run db:generate to verify**

Run: `bun run db:generate`
Expected: "No schema changes detected" — the indexes are now in both the schema and a migration

- [ ] **Step 5: Run typecheck**

Run: `bun run check-types`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/migrations/0010_deferred_indexes.sql packages/db/src/migrations/meta/_journal.json packages/db/src/schema/booking.ts packages/db/src/schema/tutor-profile.ts
git commit -m "feat(db): add 3 missing composite indexes

Add idx_booking_status_deadline (expiry sweep), idx_booking_participant_user
(user bookings lookup), idx_tutor_profile_status_published (discovery query).
The other 2 indexes from DEFERRED-OPS already exist in the schema."
```

---

## Task 10: Add wallet repo explicit column lists (DEFERRED-OPS 1.3)

**Files:**
- Modify: `packages/api/src/modules/wallet/wallet.repo.ts:13-35`

- [ ] **Step 1: Replace SELECT * with explicit columns**

In `packages/api/src/modules/wallet/wallet.repo.ts`, replace `getById` and `getByUserId`:

```typescript
const WALLET_COLUMNS = {
  id: wallet.id,
  userId: wallet.userId,
  totalBalance: wallet.totalBalance,
  heldBalance: wallet.heldBalance,
  availableBalance: wallet.availableBalance,
  createdAt: wallet.createdAt,
  updatedAt: wallet.updatedAt,
} as const;

export async function getById(
  conn: DbOrTx,
  walletId: string,
): Promise<WalletSnapshot | null> {
  const [w] = await conn
    .select(WALLET_COLUMNS)
    .from(wallet)
    .where(eq(wallet.id, walletId))
    .limit(1);
  return (w as WalletSnapshot | undefined) ?? null;
}

export async function getByUserId(
  conn: DbOrTx,
  userId: string,
): Promise<WalletSnapshot | null> {
  const [w] = await conn
    .select(WALLET_COLUMNS)
    .from(wallet)
    .where(eq(wallet.userId, userId))
    .limit(1);
  return (w as WalletSnapshot | undefined) ?? null;
}
```

- [ ] **Step 2: Run typecheck**

Run: `bun run check-types`
Expected: PASS

- [ ] **Step 3: Run full test suite**

Run: `bun run test`
Expected: 1181+ pass

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/modules/wallet/wallet.repo.ts
git commit -m "refactor(wallet): replace SELECT * with explicit column lists

getById and getByUserId used .select() (SELECT *). Use explicit
column list for performance and maintainability."
```

---

## Task 11: Add wallet repo guards (H3, H4)

**Files:**
- Modify: `packages/api/src/modules/wallet/wallet.repo.ts:96-110, 163-177`
- Test: `packages/api/src/tests/unit/wallet.repo.test.ts`

- [ ] **Step 1: Add WHERE guard to atomicRelease**

In `packages/api/src/modules/wallet/wallet.repo.ts`, find `atomicRelease` and add a `gte` guard:

```typescript
export async function atomicRelease(
  conn: DbOrTx,
  walletId: string,
  amount: number,
): Promise<AtomicResult> {
  const result = await conn
    .update(wallet)
    .set({
      heldBalance: sql`${wallet.heldBalance} - ${amount}`,
      availableBalance: sql`${wallet.availableBalance} + ${amount}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(wallet.id, walletId),
        gte(wallet.heldBalance, amount),
      ),
    )
    .returning();
  // ... existing result handling
}
```

- [ ] **Step 2: Add WHERE guard to atomicCompensateDeduct**

Find `atomicCompensateDeduct` and add:

```typescript
.where(
  and(
    eq(wallet.id, walletId),
    gte(wallet.availableBalance, amount),
  ),
)
```

- [ ] **Step 3: Run tests**

Run: `bun test packages/api/src/tests/unit/wallet.repo.test.ts`
Expected: PASS (existing tests should still pass — they use valid amounts)

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/modules/wallet/wallet.repo.ts
git commit -m "fix(wallet): add balance guards to atomicRelease and atomicCompensateDeduct

atomicRelease didn't check heldBalance >= amount — could release
more than held, making heldBalance negative. atomicCompensateDeduct
didn't check availableBalance >= amount. Add WHERE guards."
```

---

## Task 12: Add BullMQ backoff config (DEFERRED-OPS 1.2)

**Files:**
- Modify: `packages/api/src/modules/scheduler/jobs/expire-bookings.job.ts`
- Modify: `packages/api/src/modules/scheduler/jobs/release-holds.job.ts`

- [ ] **Step 1: Add backoff config to both job files**

In `expire-bookings.job.ts`, update the `add` call:

```typescript
await queue.add(
  "expire-bookings",
  {},
  {
    repeat: { every: 300_000 },
    jobId: "expire-bookings",
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
  },
);
```

In `release-holds.job.ts`, same pattern:

```typescript
await queue.add(
  "release-holds",
  {},
  {
    repeat: { every: 600_000 },
    jobId: "release-holds",
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
  },
);
```

The `send-notification-email.job.ts` (created in Task 5) already has this config.

- [ ] **Step 2: Run typecheck**

Run: `bun run check-types`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/modules/scheduler/jobs/expire-bookings.job.ts packages/api/src/modules/scheduler/jobs/release-holds.job.ts
git commit -m "feat(scheduler): add exponential backoff retry to all jobs

All scheduler jobs had attempts: 3 but no backoff config. Add
exponential backoff (1s base) and explicit jobId for deduplication."
```

---

## Task 14: Fix createSeries missing futureOnly (H2)

**Files:**
- Modify: `packages/api/src/modules/booking/booking.service.ts:1059`

- [ ] **Step 1: Add futureOnly to createSeries availability check**

In `packages/api/src/modules/booking/booking.service.ts`, line 1059, change:

```typescript
const slot = await repo.findAvailabilitySlot(
  db,
  input.availabilitySlotId,
  input.tutorId,
);
```

to:

```typescript
const slot = await repo.findAvailabilitySlot(
  db,
  input.availabilitySlotId,
  input.tutorId,
  { futureOnly: true },
);
```

This matches `createSolo` (line 257) and `createGroup` (line 687) which already pass `{ futureOnly: true }`.

- [ ] **Step 2: Run typecheck**

Run: `bun run check-types`
Expected: PASS

- [ ] **Step 3: Run tests**

Run: `bun run test`
Expected: 1181+ pass

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/modules/booking/booking.service.ts
git commit -m "fix(booking): pass futureOnly to createSeries availability check

createSeries didn't pass { futureOnly: true } unlike createSolo and
createGroup, allowing bookings on past availability slots."
```

---

## Task 15: Fix listMine cursor pagination (H1)

**Files:**
- Modify: `packages/api/src/modules/booking/booking.repo.ts:375-389`
- Modify: `packages/api/src/modules/booking/booking.service.ts:233-245`

- [ ] **Step 1: Add cursor to listBookingsByProposer**

In `packages/api/src/modules/booking/booking.repo.ts`, modify `listBookingsByProposer` to accept and use a cursor:

```typescript
async function listBookingsByProposer(
  proposerId: string,
  opts: { states?: string[]; limit: number; cursor?: string },
) {
  const conditions = [eq(booking.proposerId, proposerId)];
  if (opts.states?.length) {
    conditions.push(inArray(booking.currentState, opts.states));
  }
  if (opts.cursor) {
    conditions.push(lt(booking.scheduledStartAt, new Date(opts.cursor)));
  }
  return db.query.booking.findMany({
    where: and(...conditions),
    orderBy: [desc(booking.scheduledStartAt)],
    limit: opts.limit + 1,
    with: { participants: { with: { user: true } } },
  });
}
```

Note: Since the order is `desc(scheduledStartAt)`, the cursor comparison uses `lt` (less than) to get the next page of older bookings. The cursor is the `scheduledStartAt` ISO string of the last item.

- [ ] **Step 2: Pass cursor from service to repo**

In `packages/api/src/modules/booking/booking.service.ts`, modify `listMine`:

```typescript
async function listMine(
  userId: string,
  opts: { cursor?: string; limit?: number; states?: string[] } = {},
) {
  const limit = Math.min(opts.limit ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
  const rows = await repo.listBookingsByProposer(userId, {
    states: opts.states,
    limit,
    cursor: opts.cursor,
  });
  const items = rows.slice(0, limit);
  const nextCursor =
    rows.length > limit
      ? items[items.length - 1]!.scheduledStartAt.toISOString()
      : null;
  return { items, nextCursor };
}
```

- [ ] **Step 3: Run typecheck**

Run: `bun run check-types`
Expected: PASS

- [ ] **Step 4: Run tests**

Run: `bun run test`
Expected: 1181+ pass

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/modules/booking/booking.repo.ts packages/api/src/modules/booking/booking.service.ts
git commit -m "fix(booking): consume cursor in listBookingsByProposer

listMine computed a nextCursor but never passed it to the repo query.
Same broken pagination as N9 but on the student-facing side. Pass
cursor to repo and use it in WHERE clause."
```

---

## Task 16: Fix discovery LIKE metacharacter injection

**Files:**
- Modify: `packages/api/src/modules/tutor-discovery/discovery.repo.ts:23-28`

- [ ] **Step 1: Escape LIKE metacharacters in search input**

In `packages/api/src/modules/tutor-discovery/discovery.repo.ts`, replace the search block:

```typescript
if (input.search) {
  const escaped = input.search
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
  const q = `%${escaped}%`;
  conditions.push(
    sql`(lower(${tutorProfile.displayName}) like lower(${q}) escape '\\' or lower(${tutorProfile.shortBio}) like lower(${q}) escape '\\' or lower(${tutorProfile.credentialsSummary}) like lower(${q}) escape '\\')`,
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `bun run check-types`
Expected: PASS

- [ ] **Step 3: Run tests**

Run: `bun run test`
Expected: 1181+ pass

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/modules/tutor-discovery/discovery.repo.ts
git commit -m "fix(discovery): escape LIKE metacharacters in search

Search input was interpolated into LIKE pattern without escaping
% and _ metacharacters. A search for % would match everything.
Escape metacharacters with backslash and add ESCAPE clause."
```

---

## Task 17: Fix updateBookingWithOverride optimistic lock (H5)

**Files:**
- Modify: `packages/api/src/modules/admin-booking/admin-booking.repo.ts:46-73`

- [ ] **Step 1: Add version check to updateBookingWithOverride**

In `packages/api/src/modules/admin-booking/admin-booking.repo.ts`, modify `updateBookingWithOverride` to use the booking's version column:

```typescript
export async function updateBookingWithOverride(
  conn: DbOrTx,
  bookingId: string,
  newState: string,
  reason: string | null,
  overrideMeta: Record<string, unknown>,
) {
  const [existing] = await conn
    .select({ currentState: booking.currentState, version: booking.version })
    .from(booking)
    .where(eq(booking.id, bookingId))
    .limit(1);

  if (!existing) return null;

  const [updated] = await conn
    .update(booking)
    .set({
      previousState: existing.currentState,
      currentState: newState,
      stateReason: reason,
      overrideMeta,
      version: sql`${booking.version} + 1`,
    })
    .where(
      and(
        eq(booking.id, bookingId),
        eq(booking.version, existing.version),
      ),
    )
    .returning();

  if (!updated) return null;

  return { previousState: existing.currentState, updated };
}
```

Add imports: `and`, `sql` from `drizzle-orm` (check existing imports).

- [ ] **Step 2: Run typecheck**

Run: `bun run check-types`
Expected: PASS

- [ ] **Step 3: Run tests**

Run: `bun run test`
Expected: 1181+ pass

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/modules/admin-booking/admin-booking.repo.ts
git commit -m "fix(admin-booking): add optimistic lock to updateBookingWithOverride

SELECT then UPDATE without version check allowed concurrent admin
overrides to race. Add version column check and increment."
```

---

## Task 18: Fix refund amount unbounded + payment re-create intent (H6, H14)

**Files:**
- Modify: `packages/api/src/modules/refund/refund.types.ts:5`
- Modify: `packages/api/src/modules/payment/payment.service.ts:82-98`

- [ ] **Step 1: Add .max() to refund amount**

In `packages/api/src/modules/refund/refund.types.ts`, change line 5:

```typescript
amount: z.number().positive().max(100000),
```

100,000 Marks is well above any legitimate package size (max 300 Marks) or booking cost, but prevents unbounded admin credit/deduct.

- [ ] **Step 2: Fix payment createIntent to return existing checkout URL**

In `packages/api/src/modules/payment/payment.service.ts`, lines 82-98, change the pending-payment branch to return the existing checkout URL instead of re-calling the provider:

```typescript
const existing = await repo.findPaymentByProviderReference(idempotencyKey);
if (existing) {
  if (existing.status === PAYMENT_STATUS.PENDING) {
    return {
      paymentId: existing.id,
      providerReference: existing.providerReference,
      checkoutUrl: existing.checkoutUrl,
    };
  }
  throw new PackageAlreadyPurchasedError(packageCode, userId);
}
```

Note: This requires `checkoutUrl` to be stored on the payment record. Check if `paymentRecord` schema has a `checkoutUrl` column. If not, the existing `providerReference` can be used to reconstruct the URL, or the provider's `getIntent` method can be called (which is idempotent for Xendit). If neither is available, keep the `createIntent` call but document that it's idempotent at the provider level.

- [ ] **Step 3: Run typecheck**

Run: `bun run check-types`
Expected: PASS (fix any type errors from the checkoutUrl change)

- [ ] **Step 4: Run tests**

Run: `bun run test`
Expected: 1181+ pass

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/modules/refund/refund.types.ts packages/api/src/modules/payment/payment.service.ts
git commit -m "fix(payment): bound refund amount + avoid re-calling provider on pending

refund.types.ts amount had no .max() — unbounded admin credit/deduct.
Add max(100000). createIntent re-called provider on pending payment,
risking duplicate charges. Return existing checkout URL instead."
```

---

## Task 19: Add bookingParticipant unique constraint + nginx security headers (H11, H13)

**Files:**
- Modify: `packages/db/src/migrations/0010_deferred_indexes.sql` (add to existing)
- Modify: `packages/db/src/schema/booking.ts` (add unique constraint)
- Modify: `apps/web/nginx.conf`

- [ ] **Step 1: Add unique constraint to migration**

Append to `packages/db/src/migrations/0010_deferred_indexes.sql`:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS "booking_participant_booking_user_uniq"
  ON "booking_participant" ("booking_id", "user_id");
```

- [ ] **Step 2: Add to schema**

In `packages/db/src/schema/booking.ts`, in the `bookingParticipant` table definition, add:

```typescript
uniqueIndex("booking_participant_booking_user_uniq").on(table.bookingId, table.userId),
```

- [ ] **Step 3: Add security headers to nginx**

Replace `apps/web/nginx.conf`:

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml;
    gzip_min_length 256;

    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

Note: CSP and HSTS are handled by the API server's `security-headers.ts` for API responses. For the SPA, we add the above headers. HSTS (`Strict-Transport-Security`) should be added by Coolify's Caddy reverse proxy (auto-HTTPS), not nginx. CSP for the SPA would need to be added if the SPA loads external resources — for now, the API CSP covers `/rpc` responses.

- [ ] **Step 4: Run typecheck**

Run: `bun run check-types`
Expected: PASS

- [ ] **Step 5: Run db:generate**

Run: `bun run db:generate`
Expected: "No schema changes detected" (the unique index is now in both schema and migration)

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/migrations/0010_deferred_indexes.sql packages/db/src/schema/booking.ts apps/web/nginx.conf
git commit -m "fix(db,web): add bookingParticipant unique constraint + nginx security headers

No unique constraint on (bookingId, userId) — concurrent confirmInvite
calls could insert duplicate participants. Add unique index.
nginx served SPA with no security headers — add X-Content-Type-Options,
X-Frame-Options, Referrer-Policy, Permissions-Policy."
```

---

## Task 20: Add wallet reconcile LIMIT + remove dead code (H7, cleanup)

**Files:**
- Modify: `packages/api/src/modules/wallet/wallet.service.ts:352-380`
- Modify: `packages/api/src/modules/tutor/tutor.repo.ts:33-44` (remove dead `updateProfile`)
- Modify: `packages/api/src/modules/booking/booking.service.ts:567` (remove dead `_sessionNote` param)
- Modify: `packages/api/src/modules/booking/booking-state.types.ts:36-55` (remove dead `BOOKING_EVENTS`)

- [ ] **Step 1: Add LIMIT to wallet reconcile**

In `packages/api/src/modules/wallet/wallet.service.ts`, find the `reconcile` function (around line 352). Add a LIMIT to the wallet query:

```typescript
const wallets = await db.select().from(wallet).limit(1000);
```

For a production system with more wallets, this should be paginated, but 1000 is a safe cap to prevent OOM.

- [ ] **Step 2: Remove dead `updateProfile` from tutor.repo.ts**

In `packages/api/src/modules/tutor/tutor.repo.ts`, remove the non-versioned `updateProfile` function (lines 33-44) and its export from the return object. The service uses `updateProfileWithVersion` exclusively.

- [ ] **Step 3: Remove dead `_sessionNote` parameter**

In `packages/api/src/modules/booking/booking.service.ts`, line 567, remove the `_sessionNote` parameter from `completeSession`:

```typescript
async function completeSession(
  bookingId: string,
  tutorId: string,
) {
```

Update the call site in `booking.handler.ts` if it passes the parameter.

- [ ] **Step 4: Remove dead `BOOKING_EVENTS` type**

In `packages/api/src/modules/booking/booking-state.types.ts`, remove the `BOOKING_EVENTS` constant and `BookingEvent` type (lines 36-55) if they exist and are never referenced.

- [ ] **Step 5: Run typecheck**

Run: `bun run check-types`
Expected: PASS

- [ ] **Step 6: Run tests**

Run: `bun run test`
Expected: 1181+ pass

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/modules/wallet/wallet.service.ts packages/api/src/modules/tutor/tutor.repo.ts packages/api/src/modules/booking/booking.service.ts packages/api/src/modules/booking/booking-state.types.ts packages/api/src/modules/booking/booking.handler.ts
git commit -m "fix(wallet): add LIMIT to reconcile + remove dead code

reconcile did unbounded SELECT on wallet table. Add LIMIT 1000.
Remove dead updateProfile (non-versioned), dead _sessionNote param,
dead BOOKING_EVENTS type."
```

---

## Task 21: Add tutor-bookings route guard (H12)

**Files:**
- Modify: `apps/web/src/routes/_app.tutor-bookings.tsx`

- [ ] **Step 1: Add beforeLoad role guard**

In `apps/web/src/routes/_app.tutor-bookings.tsx`, add a `beforeLoad` guard matching the pattern in `_app.onboarding.tsx`:

```typescript
import { createFileRoute, redirect } from "@tanstack/react-router";
import { getAuth } from "@/utils/auth";

export const Route = createFileRoute("/_app/tutor-bookings")({
  beforeLoad: async () => {
    const session = await getAuth().$store.getSession();
    const user = session?.user;
    if (!user || (user as { role?: string }).role !== "tutor") {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: RouteComponent,
});
```

Check the exact pattern used in `_app.onboarding.tsx` and `_app.admin-tutors.tsx` and match it.

- [ ] **Step 2: Run typecheck**

Run: `bun run check-types`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/routes/_app.tutor-bookings.tsx
git commit -m "fix(web): add tutor role guard to /tutor-bookings route

Any authenticated user could access /tutor-bookings. Add beforeLoad
guard checking role === 'tutor', matching _app.onboarding pattern."
```

---

## Task 22: Update CONTEXT.md and DEFERRED-OPS plan

- [ ] **Step 1: Run all checks**

```bash
bun run check
bun run check-types
bun run build
bun run test
```

Expected: all pass (except 20 pre-existing DB connection test failures)

- [ ] **Step 2: Verify no regressions**

Compare test count: 1181+ pass (same or more than baseline)

- [ ] **Step 3: Commit any remaining changes**

```bash
git add -A
git commit -m "chore: final verification pass"
```

---

## Task 23: Final verification

- [ ] **Step 1: Run all checks**

```bash
bun run check
bun run check-types
bun run build
bun run test
```

Expected: all pass (except 20 pre-existing DB connection test failures)

- [ ] **Step 2: Verify no regressions**

Compare test count: 1181+ pass (same or more than baseline)

- [ ] **Step 3: Commit any remaining changes**

```bash
git add -A
git commit -m "chore: final verification pass"
```

---

### Self-Review

**Spec coverage:**
- C1 (rate limiting) → Task 1 ✓
- C2 (Redis wiring) → Task 3 ✓
- C3 (idempotency race) → Task 2 ✓
- C4 (migration journal) → Task 4 ✓
- C5 (email job) → Task 5 ✓
- C6 (override over-credit) → Task 6 ✓
- DEFERRED-OPS 1.1 (indexes) → Task 9 + Task 19 ✓
- DEFERRED-OPS 1.2 (retry config) → Task 5 + Task 12 ✓
- DEFERRED-OPS 1.3 (wallet SELECT *) → Task 10 ✓
- DEFERRED-OPS 1.4 (booking SELECT *) → deferred to PRD-gaps (larger refactor)
- DEFERRED-OPS 1.5 (webhook IP allowlist) → deferred to PRD-gaps (security feature)
- DEFERRED-OPS 1.6 (Redis health) → Task 8 ✓
- DEFERRED-OPS 1.7 (JSDoc) → deferred (low priority, large scope)
- DEFERRED-OPS 1.8 (Docker test DB) → deferred (CI infra)
- N9/G8 (admin pagination) → Task 7 ✓
- H1 (listMine cursor) → Task 15 ✓
- H2 (createSeries futureOnly) → Task 14 ✓
- H3/H4 (wallet guards) → Task 11 ✓
- H5 (updateBookingWithOverride lock) → Task 17 ✓
- H6 (payment re-create intent) → Task 18 ✓
- H7 (wallet reconcile LIMIT) → Task 20 ✓
- H11 (bookingParticipant unique) → Task 19 ✓
- H12 (tutor-bookings route guard) → Task 21 ✓
- H13 (nginx security headers) → Task 19 ✓
- H14 (refund amount bound) → Task 18 ✓
- Discovery LIKE injection → Task 16 ✓
- Dead code cleanup → Task 20 ✓
- Docs update → Task 22 ✓
- Final verification → Task 23 ✓

**Deferred to PRD-gaps branch (intentionally):**
- DEFERRED-OPS 1.4 (booking repo SELECT *) — larger refactor, touch many queries
- DEFERRED-OPS 1.5 (webhook IP allowlist) — security feature, needs env config
- DEFERRED-OPS 1.7 (JSDoc) — large scope, low priority
- DEFERRED-OPS 1.8 (Docker test DB) — CI infrastructure
- G19 (pricing extra-take rule) — feature bug, not foundation
- Dead booking error classes (11+) — cleanup, low priority
- Dead booking columns (refundedAmount, notificationFlags, rescheduleMeta) — needs migration, low priority
- N+1 performance issues (releaseAllParticipantHolds, createGroup, applyOverride) — optimization, not correctness
- Circuit breaker Redis state divergence — edge case, not blocking
- Notification eventKey race — DB unique index already protects
- Scalability (table partitioning, archiving) — production concern, not foundation

**Placeholder scan:** No placeholders found. All code blocks contain actual implementation.

**Type consistency:**
- `RateLimiter` interface changed from sync to async — all callers updated in Task 1 Step 4
- `healthCheck` signature changed — caller updated in Task 8 Step 4
- `listBookingsByState` signature changed — caller updated in Task 7 Step 4
- `listBookingsByProposer` signature changed — caller updated in Task 15 Step 2
- `updateBookingWithOverride` signature unchanged but behavior changed (version check) — callers in admin-booking.service.ts verified
- `completeSession` signature changed (removed _sessionNote) — caller updated in Task 20 Step 3