import { describe, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { webhookIdempotency } from "@cogito-app/api/lib/idempotency";
import { IdempotencyStore } from "@cogito-app/api/lib/idempotency";
import { runWithTrace } from "@cogito-app/api/lib/trace";

// Stub the API services so the webhook route runs without a DB: only the
// traceId round-trip on the idempotency record is under test here.
mock.module("@cogito-app/api", () => ({
  services: {
    payment: {
      provider: {
        verifyWebhook: async () => ({
          providerReference: "stub:user1:pkg1",
          providerEventId: "evt_trace_roundtrip",
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

describe("webhook traceId persistence (T1)", () => {
  function postWebhook() {
    const app = paymentsWebhook(new Elysia());
    return app.handle(
      new Request("http://localhost/webhooks/payments/stub", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-timestamp": new Date().toISOString(),
        },
        body: JSON.stringify({ data: { status: "PAID" } }),
      }),
    );
  }

  test("idempotency record round-trips the active traceId", async () => {
    const realClaim = webhookIdempotency.claim;
    const realMarkProcessed = webhookIdempotency.markProcessed;
    webhookIdempotency.claim = mock(async (_key: string) => true);
    const markProcessedMock = mock(async (_key: string, _result: unknown) => {});
    webhookIdempotency.markProcessed = markProcessedMock;
    try {
      const res = await runWithTrace(
        { traceId: "req_hook", userId: "u_hook" },
        () => postWebhook(),
      );

      expect(res.status).toBe(200);
      expect(markProcessedMock).toHaveBeenCalledTimes(1);
      const firstCall = markProcessedMock.mock.calls[0]!;
      expect(firstCall[0]).toBe("stub:evt_trace_roundtrip:PAID");
      expect(firstCall[1]).toMatchObject({
        ok: true,
        traceId: "req_hook",
        userId: "u_hook",
      });
    } finally {
      webhookIdempotency.claim = realClaim;
      webhookIdempotency.markProcessed = realMarkProcessed;
    }

    // Round-trip: a stored record carries the trace back out (fresh
    // in-memory store — no shared Redis state touched).
    const store = new IdempotencyStore();
    await store.markProcessed("stub:evt_trace_roundtrip:PAID", {
      ok: true,
      traceId: "req_hook",
    });
    expect(
      await store.getResult("stub:evt_trace_roundtrip:PAID"),
    ).toMatchObject({ traceId: "req_hook" });
  });

  test("no trace keys are stored with no active trace", async () => {
    const realClaim = webhookIdempotency.claim;
    const realMarkProcessed = webhookIdempotency.markProcessed;
    webhookIdempotency.claim = mock(async (_key: string) => true);
    const markProcessedMock = mock(async (_key: string, _result: unknown) => {});
    webhookIdempotency.markProcessed = markProcessedMock;
    try {
      const res = await postWebhook();

      expect(res.status).toBe(200);
      expect(markProcessedMock.mock.calls[0]![1]).toEqual({ ok: true });
    } finally {
      webhookIdempotency.claim = realClaim;
      webhookIdempotency.markProcessed = realMarkProcessed;
    }
  });
});
