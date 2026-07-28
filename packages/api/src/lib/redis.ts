import { log } from "./logger";

export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    ...args: RedisSetArg[]
  ): Promise<string | null>;
  del(key: string): Promise<number>;
  exists(key: string): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  pexpire(key: string, ms: number): Promise<number>;
  ttl(key: string): Promise<number>;
  pttl(key: string): Promise<number>;
  hset(key: string, ...fields: [string, string][]): Promise<number>;
  hget(key: string, field: string): Promise<string | null>;
  hgetall(key: string): Promise<Record<string, string>>;
  hdel(key: string, ...fields: string[]): Promise<number>;
  eval(
    script: string,
    keys: string[],
    args: (string | number)[],
  ): Promise<unknown>;
  ping(): Promise<string>;
  quit(): Promise<string>;
}

export type RedisSetArg =
  | { type: "EX"; value: number }
  | { type: "PX"; value: number }
  | { type: "NX" }
  | { type: "XX" };

export class InMemoryRedis implements RedisClient {
  private store = new Map<
    string,
    { value: string; expiresAt: number | null }
  >();
  private hashes = new Map<string, Map<string, string>>();

  private isExpired(entry: { expiresAt: number | null }): boolean {
    return entry.expiresAt !== null && Date.now() > entry.expiresAt;
  }

  private cleanKey(key: string): void {
    const entry = this.store.get(key);
    if (entry && this.isExpired(entry)) {
      this.store.delete(key);
      this.hashes.delete(key);
    }
  }

  async get(key: string): Promise<string | null> {
    this.cleanKey(key);
    return this.store.get(key)?.value ?? null;
  }

  async set(
    key: string,
    value: string,
    ...args: RedisSetArg[]
  ): Promise<string | null> {
    let expiresAt: number | null = null;
    let nx = false;
    let xx = false;

    for (const arg of args) {
      if (arg.type === "EX") expiresAt = Date.now() + arg.value * 1000;
      else if (arg.type === "PX") expiresAt = Date.now() + arg.value;
      else if (arg.type === "NX") nx = true;
      else if (arg.type === "XX") xx = true;
    }

    if (nx) {
      const existing = this.store.get(key);
      if (existing && !this.isExpired(existing)) return null;
    }
    if (xx) {
      const existing = this.store.get(key);
      if (!existing || this.isExpired(existing)) return null;
    }

    this.store.set(key, { value, expiresAt });
    return "OK";
  }

  async del(key: string): Promise<number> {
    const existed = this.store.has(key);
    this.store.delete(key);
    this.hashes.delete(key);
    return existed ? 1 : 0;
  }

  async exists(key: string): Promise<number> {
    this.cleanKey(key);
    return this.store.has(key) ? 1 : 0;
  }

  async incr(key: string): Promise<number> {
    this.cleanKey(key);
    const entry = this.store.get(key);
    const val = parseInt(entry?.value ?? "0", 10) + 1;
    this.store.set(key, {
      value: String(val),
      expiresAt: entry?.expiresAt ?? null,
    });
    return val;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const entry = this.store.get(key);
    if (!entry) return 0;
    entry.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }

  async pexpire(key: string, ms: number): Promise<number> {
    const entry = this.store.get(key);
    if (!entry) return 0;
    entry.expiresAt = Date.now() + ms;
    return 1;
  }

  async ttl(key: string): Promise<number> {
    const entry = this.store.get(key);
    if (!entry) return -2;
    if (entry.expiresAt === null) return -1;
    return Math.max(0, Math.floor((entry.expiresAt - Date.now()) / 1000));
  }

  async pttl(key: string): Promise<number> {
    const entry = this.store.get(key);
    if (!entry) return -2;
    if (entry.expiresAt === null) return -1;
    return Math.max(0, entry.expiresAt - Date.now());
  }

  async hset(key: string, ...fields: [string, string][]): Promise<number> {
    let hash = this.hashes.get(key);
    if (!hash) {
      hash = new Map();
      this.hashes.set(key, hash);
    }
    let added = 0;
    for (const [field, value] of fields) {
      if (!hash.has(field)) added++;
      hash.set(field, value);
    }
    return added;
  }

  async hget(key: string, field: string): Promise<string | null> {
    this.cleanKey(key);
    return this.hashes.get(key)?.get(field) ?? null;
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    this.cleanKey(key);
    const hash = this.hashes.get(key);
    if (!hash) return {};
    return Object.fromEntries(hash.entries());
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    const hash = this.hashes.get(key);
    if (!hash) return 0;
    let removed = 0;
    for (const field of fields) {
      if (hash.delete(field)) removed++;
    }
    if (hash.size === 0) this.hashes.delete(key);
    return removed;
  }

  async eval(
    _script: string,
    _keys: string[],
    _args: (string | number)[],
  ): Promise<unknown> {
    throw new Error("EVAL not supported in in-memory fallback");
  }

  async ping(): Promise<string> {
    return "PONG";
  }

  async quit(): Promise<string> {
    return "OK";
  }
}

let redisClient: RedisClient | null = null;

export function getRedisClient(): RedisClient {
  if (redisClient) return redisClient;
  redisClient = new InMemoryRedis();
  return redisClient;
}

export function initRedis(url?: string): RedisClient {
  if (!url) {
    log({
      level: "info",
      action: "redis_fallback",
      message: "REDIS_URL not configured, using in-memory fallback",
    });
    redisClient = new InMemoryRedis();
    return redisClient;
  }

  try {
    const IORedis = require("ioredis");
    const client = new IORedis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        if (times > 10) return null;
        return Math.min(times * 200, 5000);
      },
      lazyConnect: true,
      connectTimeout: 5000,
    });

    client.on("error", (err: Error) => {
      log({
        level: "error",
        action: "redis_connection_error",
        error: { message: err.message },
      });
    });

    client.on("connect", () => {
      log({ level: "info", action: "redis_connected" });
    });

    const adapter: RedisClient = {
      get: (key: string) => client.get(key),
      set: (key: string, value: string, ...args: RedisSetArg[]) => {
        const redisArgs: (string | number)[] = [];
        for (const arg of args) {
          if (arg.type === "EX") {
            redisArgs.push("EX", arg.value);
          } else if (arg.type === "PX") {
            redisArgs.push("PX", arg.value);
          } else if (arg.type === "NX") {
            redisArgs.push("NX");
          } else if (arg.type === "XX") {
            redisArgs.push("XX");
          }
        }
        return client.set(key, value, ...redisArgs);
      },
      del: (key: string) => client.del(key),
      exists: (key: string) => client.exists(key),
      incr: (key: string) => client.incr(key),
      expire: (key: string, seconds: number) => client.expire(key, seconds),
      pexpire: (key: string, ms: number) => client.pexpire(key, ms),
      ttl: (key: string) => client.ttl(key),
      pttl: (key: string) => client.pttl(key),
      hset: (key: string, ...fields: [string, string][]) =>
        client.hset(key, ...fields),
      hget: (key: string, field: string) => client.hget(key, field),
      hgetall: (key: string) => client.hgetall(key),
      hdel: (key: string, ...fields: string[]) => client.hdel(key, ...fields),
      eval: (script: string, keys: string[], args: (string | number)[]) =>
        client.eval(script, keys.length, ...keys, ...args),
      ping: () => client.ping(),
      quit: () => client.quit(),
    };

    redisClient = adapter;
    log({
      level: "info",
      action: "redis_init",
      message: "Redis client initialized",
    });
    return redisClient;
  } catch {
    log({
      level: "warn",
      action: "redis_init_failed",
      message: "ioredis not available, falling back to in-memory",
    });
    redisClient = new InMemoryRedis();
    return redisClient;
  }
}

export const COGITO_NS = {
  IDEMPOTENCY: "cogito:idem",
  RATE_LIMIT: "cogito:rl",
  CIRCUIT_BREAKER: "cogito:cb",
  SESSION: "cogito:sess",
} as const;
