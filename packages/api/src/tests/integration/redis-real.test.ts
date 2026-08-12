import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { CircuitBreaker } from "../../lib/circuit-breaker";
import type { CircuitBreakerOptions } from "../../lib/circuit-breaker";
import { IdempotencyStore } from "../../lib/idempotency";
import { rateLimit } from "../../lib/rate-limit";
import { COGITO_NS, initRedis } from "../../lib/redis";
import type { RedisClient } from "../../lib/redis";

const hasRedis = !!process.env.REDIS_URL;
const maybe = hasRedis ? describe : describe.skip;

const TEST_NS = "cogito:test";
const CLEANUP_PATTERNS = [
  `${TEST_NS}:*`,
  `${COGITO_NS.RATE_LIMIT}:${TEST_NS}:*`,
  `${COGITO_NS.CIRCUIT_BREAKER}:test-*`,
];

const DELETE_BY_PATTERN_LUA = `
  local cursor = "0"
  local keys = {}
  repeat
    local result = redis.call("SCAN", cursor, "MATCH", ARGV[1], "COUNT", 100)
    cursor = result[1]
    for _, k in ipairs(result[2]) do
      keys[#keys + 1] = k
    end
  until cursor == "0"
  if #keys > 0 then
    return redis.call("DEL", unpack(keys))
  end
  return 0
`;

async function clearTestKeys(redis: RedisClient): Promise<void> {
  await Promise.all(
    CLEANUP_PATTERNS.map((pattern) =>
      redis.eval(DELETE_BY_PATTERN_LUA, [], [pattern]),
    ),
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const uuid = () => crypto.randomUUID().replaceAll("-", "");
const fail = () => Promise.reject(new Error("upstream down"));

maybe("redis (real) — distributed primitives", () => {
  let redis: RedisClient;

  beforeAll(async () => {
    redis = initRedis(process.env.REDIS_URL);
    await redis.ping();
  });

  beforeEach(async () => {
    await clearTestKeys(redis);
  });

  afterAll(async () => {
    await clearTestKeys(redis);
    await redis.quit();
  });

  describe("IdempotencyStore", () => {
    test("getOrSet executes the factory once under concurrent calls", async () => {
      const store = new IdempotencyStore({
        redis,
        prefix: `${TEST_NS}:idem:${uuid()}`,
      });
      let calls = 0;
      const factory = async () => {
        calls += 1;
        await sleep(25);
        return { id: uuid() };
      };

      const [first, second] = await Promise.all([
        store.getOrSet("booking:1", factory),
        store.getOrSet("booking:1", factory),
      ]);

      expect(calls).toBe(1);
      expect(first).toEqual(second);
    });

    test("getOrSet serves the Redis-cached result across store instances", async () => {
      const prefix = `${TEST_NS}:idem:${uuid()}`;
      const first = new IdempotencyStore({ redis, prefix });
      let calls = 0;
      const factory = async () => {
        calls += 1;
        return { ok: true };
      };

      await first.getOrSet("key", factory);
      expect(calls).toBe(1);

      const second = new IdempotencyStore({ redis, prefix });
      const cached = await second.getOrSet("key", factory);
      expect(cached).toEqual({ ok: true });
      expect(calls).toBe(1);
    });
  });

  describe("rateLimit", () => {
    test("allows within the threshold and blocks once exceeded", async () => {
      const limiter = rateLimit({
        windowMs: 60_000,
        maxRequests: 3,
        keyPrefix: `${TEST_NS}:rl:${uuid()}`,
        redis,
      });

      expect((await limiter("client-1")).allowed).toBe(true);
      expect((await limiter("client-1")).allowed).toBe(true);
      expect((await limiter("client-1")).allowed).toBe(true);

      const blocked = await limiter("client-1");
      expect(blocked.allowed).toBe(false);
      expect(blocked.retryAfterMs).toBeGreaterThan(0);
    });

    test("gives independent counters to different identifiers", async () => {
      const limiter = rateLimit({
        windowMs: 60_000,
        maxRequests: 2,
        keyPrefix: `${TEST_NS}:rl:${uuid()}`,
        redis,
      });

      expect((await limiter("a")).allowed).toBe(true);
      expect((await limiter("a")).allowed).toBe(true);
      expect((await limiter("a")).allowed).toBe(false);
      expect((await limiter("b")).allowed).toBe(true);
    });

    test("allows again after the window expires", async () => {
      const limiter = rateLimit({
        windowMs: 1_000,
        maxRequests: 1,
        keyPrefix: `${TEST_NS}:rl:${uuid()}`,
        redis,
      });

      expect((await limiter("client-2")).allowed).toBe(true);
      const blocked = await limiter("client-2");
      expect(blocked.allowed).toBe(false);
      expect(blocked.retryAfterMs).toBeGreaterThan(0);

      await sleep(1_200);
      expect((await limiter("client-2")).allowed).toBe(true);
    });
  });

  describe("CircuitBreaker", () => {
    function makeBreaker(
      overrides: Partial<CircuitBreakerOptions> = {},
    ): CircuitBreaker {
      return new CircuitBreaker({
        failureThreshold: 2,
        resetTimeoutMs: 1_000,
        halfOpenMaxAttempts: 1,
        name: `test-cb-${uuid()}`,
        redis,
        ...overrides,
      });
    }

    test("opens after the failure threshold and rejects while open", async () => {
      const cb = makeBreaker();

      await expect(cb.execute(fail)).rejects.toThrow("upstream down");
      await expect(cb.execute(fail)).rejects.toThrow("upstream down");
      expect(cb.getState()).toBe("open");

      await expect(cb.execute(fail)).rejects.toThrow("Circuit breaker is open");
    });

    test("goes half-open after cooldown and recovers on success", async () => {
      const cb = makeBreaker();

      await expect(cb.execute(fail)).rejects.toThrow("upstream down");
      await expect(cb.execute(fail)).rejects.toThrow("upstream down");
      expect(cb.getState()).toBe("open");

      await sleep(1_200);

      const result = await cb.execute(() => Promise.resolve("recovered"));
      expect(result).toBe("recovered");
      expect(cb.getState()).toBe("closed");
    });

    test("reopens when the half-open attempt fails", async () => {
      const cb = makeBreaker();

      await expect(cb.execute(fail)).rejects.toThrow("upstream down");
      await expect(cb.execute(fail)).rejects.toThrow("upstream down");

      await sleep(1_200);

      await expect(cb.execute(fail)).rejects.toThrow("upstream down");
      expect(cb.getState()).toBe("open");
    });
  });
});
