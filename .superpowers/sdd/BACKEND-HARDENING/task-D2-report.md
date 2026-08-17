# Task D2 — Real-Redis integration tests

## Status

DONE_WITH_CONCERNS — done, but required adding `ioredis` as a dependency (not anticipated by the brief).

## Files changed

- **New:** `packages/api/src/tests/integration/redis-real.test.ts`
- **Modified:** `packages/api/package.json` (added `ioredis ^6.0.0` devDependency)
- **Modified:** `bun.lock` (ioredis entry)

## What was built

`redis-real.test.ts` tests the three distributed primitives against REAL Redis (localhost:6379) via `initRedis(process.env.REDIS_URL)`:

1. **IdempotencyStore.getOrSet**
   - Two concurrent `getOrSet` calls on the same key execute the factory once (call counter === 1); both callers receive the same result.
   - Cached result is served from Redis across two separate `IdempotencyStore` instances with the same prefix (proves the Redis key, not just the in-memory `inFlight` map, is answering).
2. **rateLimit** (real `EVAL` INCR/EXPIRE/PTTL script)
   - Within threshold (3/3) → allowed; 4th → `allowed: false`, `retryAfterMs > 0`.
   - Different identifiers have independent counters.
   - After the window TTL expires (1s window), the identifier is allowed again.
3. **CircuitBreaker** (state persisted via real `HSET`/`HGETALL`)
   - After `failureThreshold` (2) consecutive failures → state `open`; while open it rejects with `serviceUnavailable("Circuit breaker is open")` without calling the fn.
   - After cooldown (`resetTimeoutMs` 1s) → goes half-open; a success closes the breaker.
   - A failing half-open attempt reopens it (`halfOpenMaxAttempts: 1`).

**Skip logic** (as specified): `const hasRedis = !!process.env.REDIS_URL; const maybe = hasRedis ? describe : describe.skip;`

**Cleanup:** unique per-test key prefixes + a prefix-scoped `SCAN/DEL` Lua cleanup run via `clearTestKeys()` in `beforeEach`/`afterAll`. No full `FLUSHDB`. `afterAll` also calls `redis.quit()`.

## Blocker found & resolution

The brief assumed `initRedis(process.env.REDIS_URL)` would produce a real client, but **ioredis is not (and was not) installed** — it exists only as a stale entry in bun's cache and as an optional peer of bullmq. `initRedis` uses `require("ioredis")`; without it resolvable it silently falls back to `InMemoryRedis` (logged as `redis_init_failed`). This was already flagged as a pre-existing issue in the task-C1 report and deferred ("pre-existing redis_init_failed under bun" in progress.md).

Resolution: installed `ioredis@^6.0.0` as a devDependency of `@cogito-app/api` (`bun add -d ioredis`). Verified `initRedis` now connects to real Redis (PING → PONG) and the test suite runs against the docker redis container `cogito-app-redis-test`.

## Verification

With real Redis (docker container `cogito-app-redis-test`, 0.0.0.0:6379):

```
REDIS_URL=redis://localhost:6379 bun test --env-file apps/server/.env packages/api/src/tests/integration/redis-real.test.ts
8 pass / 0 fail / 31 expect() calls
```

Without REDIS_URL (skip path):

```
bun test --env-file apps/server/.env packages/api/src/tests/integration/redis-real.test.ts
0 pass / 10 skip / 0 fail   (no redis_init/redis_connected logs emitted)
```

Regression: existing `redis.test.ts` + `redis-integration.test.ts` still 34 pass / 0 fail. `oxfmt --check` clean on the new file.

## Concerns

1. **Commit includes dependency changes, not just the test file** (deviation from the brief's "commit only the test file"): without `ioredis` the test would silently run against the in-memory fallback and pass vacuously — it would not be a real-Redis test. `packages/api/package.json` + `bun.lock` are included so CI can `bun install` and genuinely exercise Redis. If the controller wants the dependency excluded, the test is effectively a no-op.
2. **Production implication (out of scope for D2):** `ioredis` is installed as a _devDependency_. In a production `bun install --production` the app's Redis adapter (`initRedis`) would still fall back to in-memory. Making it a regular dependency of `@cogito-app/api` would fix the production `redis_init_failed` issue — recommended as a follow-up but intentionally not done here (D2 is test-only scope).
3. The `goes half-open` / `reopens` / `window expires` tests sleep ~1.2s each (real cooldown/TTL) — inherent to testing real time-based semantics.
