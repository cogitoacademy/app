import { COGITO_NS } from "./redis";
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
  (identifier: string): RateLimitResult;
}

function inMemoryRateLimit(
  windowMs: number,
  maxRequests: number,
  keyPrefix: string,
): RateLimiter {
  return (identifier: string): RateLimitResult => {
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
      return { allowed: true, retryAfterMs: 0 };
    }

    if (entry.count >= maxRequests) {
      return { allowed: false, retryAfterMs: entry.resetAt - now };
    }

    entry.count += 1;
    return { allowed: true, retryAfterMs: 0 };
  };
}

function redisRateLimit(
  windowMs: number,
  maxRequests: number,
  keyPrefix: string,
  redis: RedisClient,
): RateLimiter {
  const windowSeconds = Math.ceil(windowMs / 1000);

  return (identifier: string): RateLimitResult => {
    const key = `${COGITO_NS.RATE_LIMIT}:${keyPrefix}:${identifier}`;

    try {
      const result = redis.eval(
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
      );

      if (result && typeof result === "object" && "then" in result) {
        return { allowed: true, retryAfterMs: 0 };
      }
      const [allowed, retryAfter] = result as [number, number];
      return { allowed: allowed === 1, retryAfterMs: retryAfter };
    } catch {
      return { allowed: true, retryAfterMs: 0 };
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
