import { COGITO_NS } from "./redis";
import { logRedisFallback } from "./redis";
import type { RedisClient } from "./redis";

const MAX_ENTRIES = 10_000;
const CLEANUP_INTERVAL = 60_000;

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();
let lastCleanup = 0;

export function resetRateLimitStore() {
  store.clear();
  lastCleanup = 0;
}

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
    } catch (error) {
      logRedisFallback("rate-limit", error);
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
