import { afterEach, describe, expect, test } from "bun:test";
import { eq, like } from "drizzle-orm";

import { db } from "@cogito-app/db";
import {
  session as sessionRow,
  user as userRow,
  verification as verificationRow,
} from "@cogito-app/db/schema";

import {
  createAuth,
  setAuthEmailSender,
  setAuthSecondaryStorageRedis,
} from "./index";
import {
  SECONDARY_STORAGE_PREFIX,
  createSecondaryStorage,
} from "./secondary-storage";
import type { SecondaryStorageRedis } from "./secondary-storage";

/**
 * In-memory stand-in for the shared Redis client (the auth package cannot
 * import @cogito-app/api's InMemoryRedis — api depends on auth, so that
 * import would be circular). Implements the same EX-TTL semantics the
 * adapter relies on, plus a failure switch for the kill-Redis path.
 */
class FakeRedis implements SecondaryStorageRedis {
  private store = new Map<
    string,
    { value: string; expiresAt: number | null }
  >();

  failures = false;

  async get(key: string): Promise<string | null> {
    if (this.failures) throw new Error("redis down");
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(
    key: string,
    value: string,
    ...args: Array<{ type: "EX"; value: number }>
  ): Promise<string | null> {
    if (this.failures) throw new Error("redis down");
    let expiresAt: number | null = null;
    for (const arg of args) {
      if (arg.type === "EX") expiresAt = Date.now() + arg.value * 1000;
    }
    this.store.set(key, { value, expiresAt });
    return "OK";
  }

  async del(key: string): Promise<number> {
    if (this.failures) throw new Error("redis down");
    return this.store.delete(key) ? 1 : 0;
  }

  keysWithPrefix(prefix: string): string[] {
    return [...this.store.keys()].filter((key) => key.startsWith(prefix));
  }

  ttlSeconds(key: string): number | null {
    const entry = this.store.get(key);
    if (!entry || entry.expiresAt === null) return null;
    return Math.round((entry.expiresAt - Date.now()) / 1000);
  }
}

describe("secondary storage adapter (R1)", () => {
  test("get returns null on miss, value on hit, null after delete", async () => {
    const s = createSecondaryStorage(new FakeRedis());
    expect(await s.get("k")).toBeNull();
    await s.set("k", "v", 60);
    expect(await s.get("k")).toBe("v");
    await s.delete("k");
    expect(await s.get("k")).toBeNull();
  });

  test("keys live under the better-auth: prefix", async () => {
    const redis = new FakeRedis();
    const s = createSecondaryStorage(redis);
    await s.set("token-1", "v", 60);
    expect(redis.keysWithPrefix(SECONDARY_STORAGE_PREFIX)).toEqual([
      `${SECONDARY_STORAGE_PREFIX}token-1`,
    ]);
    expect(SECONDARY_STORAGE_PREFIX).toBe("better-auth:");
  });

  test("set without a ttl stores a persistent entry", async () => {
    const redis = new FakeRedis();
    const s = createSecondaryStorage(redis);
    await s.set("persistent", "v");
    expect(await s.get("persistent")).toBe("v");
    expect(
      redis.ttlSeconds(`${SECONDARY_STORAGE_PREFIX}persistent`),
    ).toBeNull();
  });

  test("expired entries read as a miss", async () => {
    const redis = new FakeRedis();
    const s = createSecondaryStorage(redis);
    await s.set("short", "v", -1);
    expect(await s.get("short")).toBeNull();
  });

  test("Redis failures degrade to miss/no-op instead of throwing", async () => {
    const redis = new FakeRedis();
    const s = createSecondaryStorage(redis);
    redis.failures = true;
    await expect(s.get("k")).resolves.toBeNull();
    await expect(s.set("k", "v", 60)).resolves.toBeUndefined();
    await expect(s.delete("k")).resolves.toBeUndefined();
  });
});

describe("secondary storage wiring", () => {
  test("singleton proxies to the unset client as a DB-only miss", async () => {
    const { auth } = await import("./index");
    const storage = (auth as any).options.secondaryStorage;
    expect(storage).toBeDefined();
    // No Redis wired in this test process: reads miss so better-auth falls
    // through to the database row (storeSessionInDatabase below), and
    // writes/deletes are harmless no-ops.
    await expect(storage.get("missing")).resolves.toBeNull();
    await expect(storage.set("k", "v", 60)).resolves.toBeUndefined();
    await expect(storage.delete("k")).resolves.toBeUndefined();
  });

  test("session config keeps DB rows, 7d expiry, and cookie cache", async () => {
    const { auth } = await import("./index");
    const session = (auth as any).options.session;
    expect(session.storeSessionInDatabase).toBe(true);
    expect(session.expiresIn).toBe(60 * 60 * 24 * 7);
    expect(session.cookieCache?.enabled).toBe(true);
  });

  test("boot setter routes singleton reads through the shared client", async () => {
    const redis = new FakeRedis();
    setAuthSecondaryStorageRedis(redis);
    const { auth } = await import("./index");
    const storage = (auth as any).options.secondaryStorage;
    await storage.set("boot-key", "boot-value", 60);
    expect(redis.keysWithPrefix(SECONDARY_STORAGE_PREFIX)).toContain(
      `${SECONDARY_STORAGE_PREFIX}boot-key`,
    );
  });
});

describe("login → cache-hit → revoke → denied (R1)", () => {
  const email = `secondary.${Date.now()}@cogito.test`;
  const password = "ValidPass1";

  async function cleanupUser() {
    const [row] = await db
      .select({ id: userRow.id })
      .from(userRow)
      .where(eq(userRow.email, email));
    if (row) {
      await db
        .delete(verificationRow)
        .where(like(verificationRow.identifier, `%${email}%`));
      await db.delete(userRow).where(eq(userRow.id, row.id));
    }
  }

  afterEach(async () => {
    setAuthEmailSender(null as any);
    await cleanupUser();
  });

  async function signInCookie(testAuth: { api: any }): Promise<string> {
    await testAuth.api.signUpEmail({
      body: { email, password, name: "Secondary Tester" },
      headers: new Headers(),
    });
    const signIn = await testAuth.api.signInEmail({
      body: { email, password },
      headers: new Headers(),
      asResponse: true,
    });
    expect(signIn.status).toBe(200);
    const sessionCookie = signIn.headers
      .getSetCookie()
      .find((c: string) => c.includes("better-auth.session_token"));
    expect(sessionCookie).toBeDefined();
    return sessionCookie!.split(";")[0]!;
  }

  test("login caches the session in Redis; revoke clears both stores", async () => {
    const redis = new FakeRedis();
    const testAuth = createAuth({ secondaryStorageRedis: redis });
    const cookie = await signInCookie(testAuth);
    const headers = new Headers({ cookie });

    // Cache-hit: the session resolves and a better-auth: entry exists.
    const active = await testAuth.api.getSession({ headers });
    expect(active?.user.email).toBe(email);
    const cachedKeys = redis.keysWithPrefix(SECONDARY_STORAGE_PREFIX);
    expect(cachedKeys.length).toBeGreaterThan(0);
    // 7d session expiry is honored as the Redis TTL (within clock skew).
    const sessionKeys = cachedKeys.filter(
      (key) =>
        !key.includes("active-sessions-") && !key.includes("verification:"),
    );
    expect(sessionKeys.length).toBeGreaterThan(0);
    const ttl = redis.ttlSeconds(sessionKeys[0]!);
    expect(ttl).not.toBeNull();
    expect(ttl!).toBeGreaterThan(6 * 24 * 60 * 60);

    // Revoke via password reset (revokeSessionsOnPasswordReset): every
    // session row and every Redis session entry disappears, while the
    // unrelated OTP-verification entry keeps its own lifecycle.
    const resetTokens: string[] = [];
    setAuthEmailSender(async ({ token }) => {
      resetTokens.push(token);
    });
    const resetResponse = await testAuth.api.requestPasswordReset({
      body: { email, redirectTo: "http://localhost:3000/reset-password" },
      headers: new Headers(),
      asResponse: true,
    });
    expect(resetResponse.status).toBe(200);
    expect(resetTokens).toHaveLength(1);
    const resetDone = await testAuth.api.resetPassword({
      body: { newPassword: "NewValidPass1", token: resetTokens[0]! },
      headers: new Headers(),
      asResponse: true,
    });
    expect(resetDone.status).toBe(200);

    const remaining = redis
      .keysWithPrefix(SECONDARY_STORAGE_PREFIX)
      .filter((key) => !key.includes("verification:"));
    expect(remaining).toEqual([]);
    const [dbRow] = await db
      .select({ id: sessionRow.id })
      .from(sessionRow)
      .where(eq(sessionRow.userId, active!.user.id));
    expect(dbRow).toBeUndefined();

    // Denied: the revoked cookie no longer resolves a session.
    await expect(testAuth.api.getSession({ headers })).resolves.toBeNull();
  });

  test("kill-Redis-mid-test still serves sessions from the database", async () => {
    const redis = new FakeRedis();
    const testAuth = createAuth({ secondaryStorageRedis: redis });
    const cookie = await signInCookie(testAuth);
    const headers = new Headers({ cookie });

    redis.failures = true;
    // Never 500s: reads degrade to the database row.
    const active = await testAuth.api.getSession({ headers });
    expect(active?.user.email).toBe(email);
  });
});
