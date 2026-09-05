import { afterEach, describe, expect, mock, test } from "bun:test";
import { createResendEmailProvider } from "../../modules/email/resend-email.provider";
import { createGoogleMeetingProvider } from "../../modules/meeting/google-meeting.provider";
import { COGITO_NS, InMemoryRedis } from "../../lib/redis";
import type { RedisClient } from "../../lib/redis";
import type { DbOrTx } from "../../lib/tx";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFailingFetch(): void {
  globalThis.fetch = mock(() =>
    Promise.reject(new Error("network down")),
  ) as unknown as typeof fetch;
}

const unusedDb = {} as DbOrTx;

describe("named circuit breakers (M1)", () => {
  test("resend failures persist under cogito:cb:resend, never default", async () => {
    stubFailingFetch();
    const redis = new InMemoryRedis();
    const provider = createResendEmailProvider(
      "test-key",
      "from@cogito.test",
      redis as unknown as RedisClient,
    );
    await expect(
      provider.send({
        to: "user@example.com",
        subject: "subject",
        html: "<p>hi</p>",
        category: "auth",
      }),
    ).rejects.toThrow();
    const state = await redis.hgetall(`${COGITO_NS.CIRCUIT_BREAKER}:resend`);
    expect(state.failureCount).toBe("1");
    expect(await redis.hgetall(`${COGITO_NS.CIRCUIT_BREAKER}:default`)).toEqual(
      {},
    );
  });

  test("google-meet failures persist under cogito:cb:google-meet", async () => {
    stubFailingFetch();
    const redis = new InMemoryRedis();
    const provider = createGoogleMeetingProvider(
      {
        authType: "oauth_refresh_token",
        calendarId: "primary",
        clientId: "client-id",
        clientSecret: "client-secret",
        refreshToken: "refresh-token",
      },
      unusedDb,
      redis as unknown as RedisClient,
    );
    const result = await provider.probe!();
    expect(result.ok).toBe(false);
    const state = await redis.hgetall(
      `${COGITO_NS.CIRCUIT_BREAKER}:google-meet`,
    );
    expect(state.failureCount).toBe("1");
  });

  test("resend and google-meet use distinct Redis keys", async () => {
    stubFailingFetch();
    const redis = new InMemoryRedis();
    const email = createResendEmailProvider(
      "test-key",
      "from@cogito.test",
      redis as unknown as RedisClient,
    );
    await expect(
      email.send({
        to: "user@example.com",
        subject: "subject",
        html: "<p>hi</p>",
        category: "auth",
      }),
    ).rejects.toThrow();
    const meeting = createGoogleMeetingProvider(
      {
        authType: "oauth_refresh_token",
        calendarId: "primary",
        clientId: "client-id",
        clientSecret: "client-secret",
        refreshToken: "refresh-token",
      },
      unusedDb,
      redis as unknown as RedisClient,
    );
    await meeting.probe!();
    const keys = await redis.keys("cogito:cb:*");
    expect(keys).toContain("cogito:cb:resend");
    expect(keys).toContain("cogito:cb:google-meet");
    expect(keys).not.toContain("cogito:cb:default");
  });
});
