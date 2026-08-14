import { COGITO_NS } from "./redis";
import type { RedisClient } from "./redis";

export interface IdempotencyStoreOptions {
  prefix?: string;
  maxAgeMs?: number;
  cleanupIntervalMs?: number;
  maxEntries?: number;
  redis?: RedisClient;
}

export class IdempotencyStore {
  private store = new Map<string, { result: unknown; timestamp: number }>();
  private maxAge: number;
  private cleanupInterval: number;
  private maxEntries: number;
  private lastCleanup = Date.now();
  private prefix: string;
  private redis: RedisClient | null;

  constructor(options: IdempotencyStoreOptions = {}) {
    this.maxAge = options.maxAgeMs ?? 24 * 60 * 60 * 1000;
    this.cleanupInterval = options.cleanupIntervalMs ?? 60 * 60 * 1000;
    this.maxEntries = options.maxEntries ?? 10_000;
    this.prefix = options.prefix ?? COGITO_NS.IDEMPOTENCY;
    this.redis = options.redis ?? null;
  }

  async isProcessed(key: string): Promise<boolean> {
    const redisKey = `${this.prefix}:${key}`;
    if (this.redis) {
      try {
        const exists = await this.redis.exists(redisKey);
        if (exists) return true;
      } catch {
        // fall through to in-memory
      }
    }
    this.maybeCleanup();
    const entry = this.store.get(key);
    if (!entry) return false;
    if (Date.now() - entry.timestamp > this.maxAge) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  async markProcessed(key: string, result: unknown): Promise<void> {
    const redisKey = `${this.prefix}:${key}`;
    if (this.redis) {
      try {
        const ttlSeconds = Math.ceil(this.maxAge / 1000);
        const resultStr = JSON.stringify(result);
        await this.redis.set(redisKey, resultStr, {
          type: "EX",
          value: ttlSeconds,
        });
        return;
      } catch {
        // fall through to in-memory
      }
    }
    this.evictOldest();
    this.store.set(key, { result, timestamp: Date.now() });
  }

  async claim(key: string, ttlSeconds?: number): Promise<boolean> {
    const redisKey = `${this.prefix}:${key}`;
    const ttl = ttlSeconds ?? Math.ceil(this.maxAge / 1000);
    if (this.redis) {
      try {
        const ok = await this.redis.set(
          redisKey,
          "pending",
          { type: "NX" },
          { type: "EX", value: ttl },
        );
        if (ok === "OK") return true;
        const exists = await this.redis.exists(redisKey);
        return !exists;
      } catch {
        // fall through to in-memory
      }
    }
    this.maybeCleanup();
    if (this.store.has(key)) return false;
    this.evictOldest();
    this.store.set(key, { result: "pending", timestamp: Date.now() });
    return true;
  }

  async release(key: string): Promise<void> {
    const redisKey = `${this.prefix}:${key}`;
    if (this.redis) {
      try {
        await this.redis.del(redisKey);
        return;
      } catch {
        // fall through
      }
    }
    this.store.delete(key);
  }

  async getResult(key: string): Promise<unknown> {
    const redisKey = `${this.prefix}:${key}`;
    if (this.redis) {
      try {
        const value = await this.redis.get(redisKey);
        if (value !== null) {
          try {
            return JSON.parse(value);
          } catch {
            return value;
          }
        }
      } catch {
        // fall through to in-memory
      }
    }
    this.maybeCleanup();
    return this.store.get(key)?.result;
  }

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

    const promise = fn()
      .then(async (result) => {
        await this.markProcessed(key, result);
        return result;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, promise);
    return promise as Promise<T>;
  }

  setRedis(redis: RedisClient): void {
    this.redis = redis;
  }

  clear(): void {
    this.store.clear();
    this.inFlight.clear();
    this.lastCleanup = Date.now();
  }

  disconnectRedis(): void {
    this.redis = null;
  }

  private maybeCleanup(): void {
    const now = Date.now();
    if (now - this.lastCleanup < this.cleanupInterval) return;
    for (const [key, entry] of this.store) {
      if (now - entry.timestamp > this.maxAge) {
        this.store.delete(key);
      }
    }
    this.lastCleanup = now;
  }

  private evictOldest(): void {
    if (this.store.size < this.maxEntries) return;
    let oldest: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of this.store) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldest = key;
      }
    }
    if (oldest) this.store.delete(oldest);
  }
}

export const bookingIdempotency = new IdempotencyStore({
  maxAgeMs: 24 * 60 * 60 * 1000,
  cleanupIntervalMs: 60 * 60 * 1000,
});

export const webhookIdempotency = new IdempotencyStore({
  maxAgeMs: 24 * 60 * 60 * 1000,
  cleanupIntervalMs: 60 * 60 * 1000,
});

export function initIdempotencyStores(redis: RedisClient): void {
  bookingIdempotency.setRedis(redis);
  webhookIdempotency.setRedis(redis);
}

export function generateIdempotencyKey(
  prefix: string,
  ...parts: string[]
): string {
  return `${prefix}:${parts.join(":")}`;
}
