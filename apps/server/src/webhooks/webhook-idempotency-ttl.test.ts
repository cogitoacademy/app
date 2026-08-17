import { afterAll, describe, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { getRedisClient } from "@cogito-app/api/lib/redis";
import { webhookIdempotency } from "@cogito-app/api/lib/idempotency";

// Stub the API services so the webhook route runs without a DB: only the
// idempotency claim TTL is under test here.
mock.module("@cogito-app/api", () => ({
  services: {
    payment: {
      provider: {
        verifyWebhook: async () => ({
          providerReference: "stub:user1:pkg1",
          providerEventId: "evt_claim_ttl",
          status: "PAID",
          receiptUrl: null,
          failureReason: null,
        }),
      },
      confirmFromWebhook: async () => ({ status: "PAID" }),
    },
  },
}));

const { paymentsWebhook } = await import("./payments");

describe("webhook idempotency claim TTL (R7)", () => {
  const claim = webhookIdempotency.claim;
  const markProcessed = webhookIdempotency.markProcessed;
  const release = webhookIdempotency.release;

  afterAll(() => {
    webhookIdempotency.claim = claim;
    webhookIdempotency.markProcessed = markProcessed;
    webhookIdempotency.release = release;
    getRedisClient().quit();
  });

  test("claims the idempotency key with a 120s TTL, not the 24h store TTL", async () => {
    const claimMock = mock(async (_key: string, _ttlSeconds?: number) => true);
    const markProcessedMock = mock(async () => {});
    webhookIdempotency.claim = claimMock;
    webhookIdempotency.markProcessed = markProcessedMock;

    const app = paymentsWebhook(new Elysia());
    const res = await app.handle(
      new Request("http://localhost/webhooks/payments/stub", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-timestamp": new Date().toISOString(),
        },
        body: JSON.stringify({ data: { status: "PAID" } }),
      }),
    );

    expect(res.status).toBe(200);
    expect(claimMock).toHaveBeenCalledWith("stub:evt_claim_ttl", 120);
  });
});
