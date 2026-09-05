import type { SecondaryStorage } from "better-auth/db";

/**
 * Redis-backed Better Auth secondary storage (R1).
 *
 * Sessions are read from Redis with database fallback
 * (`storeSessionInDatabase: true` in the auth options): better-auth falls
 * through to the database row whenever the secondary read misses, and
 * deletes both stores on revoke. Every adapter operation catches Redis
 * errors, logs a warning, and degrades — a Redis outage must never 500 a
 * login or a session read.
 *
 * Key space note: keys use better-auth's own `better-auth:` prefix (not the
 * `cogito:` namespace) so the rows remain recognizable to better-auth
 * tooling. Never log keys or values — they are opaque session tokens.
 */
export const SECONDARY_STORAGE_PREFIX = "better-auth:";

/**
 * Minimal structural surface of the shared Redis client. Satisfied by the
 * @cogito-app/api RedisClient (wired from the server composition root);
 * declared locally so this package keeps its one-way dependency direction
 * (@cogito-app/api imports @cogito-app/auth, never the reverse).
 */
export interface SecondaryStorageRedis {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    ...args: Array<{ type: "EX"; value: number }>
  ): Promise<string | null>;
  del(key: string): Promise<number>;
}

function logSecondaryStorageWarning(action: string, error: unknown): void {
  console.warn(
    JSON.stringify({
      level: "warn",
      action,
      error: { message: String(error) },
    }),
  );
}

function prefixed(key: string): string {
  return `${SECONDARY_STORAGE_PREFIX}${key}`;
}

/**
 * Creates the Better Auth secondary storage over an existing Redis client.
 * No new connection is opened — pass the shared client (or a test fake).
 */
export function createSecondaryStorage(
  redis: SecondaryStorageRedis,
): SecondaryStorage {
  const get: SecondaryStorage["get"] = async (key) => {
    try {
      return await redis.get(prefixed(key));
    } catch (error) {
      logSecondaryStorageWarning("auth_secondary_storage_get_failed", error);
      // Miss → better-auth falls through to the database row.
      return null;
    }
  };

  const set: SecondaryStorage["set"] = async (key, value, ttl) => {
    try {
      if (ttl === undefined) {
        await redis.set(prefixed(key), value);
      } else {
        await redis.set(prefixed(key), value, { type: "EX", value: ttl });
      }
    } catch (error) {
      // The database write already happened (storeSessionInDatabase), so a
      // lost cache write only costs a future cache miss.
      logSecondaryStorageWarning("auth_secondary_storage_set_failed", error);
    }
  };

  const remove: SecondaryStorage["delete"] = async (key) => {
    try {
      await redis.del(prefixed(key));
    } catch (error) {
      // Revoke still clears the database row; the Redis entry expires via
      // its session TTL.
      logSecondaryStorageWarning("auth_secondary_storage_delete_failed", error);
    }
  };

  return { get, set, delete: remove };
}
