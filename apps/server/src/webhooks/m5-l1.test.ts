import { describe, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { webhookIdempotency } from "@cogito-app/api/lib/idempotency";
import { PaymentNotFoundError } from "@cogito-app/api/modules/payment/payment.errors";
import { paymentWebhookIdempotencyKey } from "./payments";

const basePayload = {
  providerReference: "stub:user1:pkg1",
  providerEventId: "evt_m5",
  status: "PAID",
  receiptUrl: null,
  failureReason: null,
};

const requestFor = (payload: Record<string, unknown>) =>
  new Request("http://localhost/webhooks/payments/stub", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-timestamp": new Date().toISOString(),
    },
    body: JSON.stringify(payload),
  });

describe("webhook M5/L1 failure handling", () => {
  test("uses lifecycle status and fallback reference in idempotency keys", () => {
    expect(paymentWebhookIdempotencyKey("xendit", basePayload)).toBe(
      "xendit:evt_m5:PAID",
    );
    expect(
      paymentWebhookIdempotencyKey("xendit", {
        ...basePayload,
        status: "PENDING",
      }),
    ).toBe("xendit:evt_m5:PENDING");
    expect(
      paymentWebhookIdempotencyKey("xendit", {
        ...basePayload,
        providerEventId: null,
      }),
    ).toBe("xendit:stub:user1:pkg1:PAID");
  });

  test("L1: event with no event id AND no reference → 400", async () => {
    webhookIdempotency.claim = mock(async (_k: string, _ttl?: number) => true);
    mock.module("@cogito-app/api", () => ({
      services: {
        payment: {
          provider: {
            verifyWebhook: async () => ({
              providerReference: null,
              providerEventId: null,
              status: "PAID",
            }),
          },
          confirmFromWebhook: mock(async () => ({ status: "PAID" })),
        },
      },
    }));
    const { paymentsWebhook } = await import("./payments");
    const app = paymentsWebhook(new Elysia());
    const res = await app.handle(requestFor({ data: { status: "PAID" } }));
    expect(res.status).toBe(400);
  });

  test("M5: PaymentNotFoundError → 404, claim NOT released (marked processed)", async () => {
    webhookIdempotency.claim = mock(async (_k: string, _ttl?: number) => true);
    const markProcessedMock = mock(async () => {});
    const releaseMock = mock(async () => {});
    webhookIdempotency.markProcessed = markProcessedMock;
    webhookIdempotency.release = releaseMock;
    mock.module("@cogito-app/api", () => ({
      services: {
        payment: {
          provider: {
            verifyWebhook: async () => basePayload,
          },
          confirmFromWebhook: mock(async () => {
            throw new PaymentNotFoundError("stub:user1:pkg1");
          }),
        },
      },
    }));
    const { paymentsWebhook } = await import("./payments");
    const app = paymentsWebhook(new Elysia());
    const res = await app.handle(requestFor(basePayload));
    expect(res.status).toBe(404);
    expect(markProcessedMock).toHaveBeenCalled();
    expect(releaseMock).not.toHaveBeenCalled();
  });

  test("M5: transient DB error → 500, claim released (retryable)", async () => {
    webhookIdempotency.claim = mock(async (_k: string, _ttl?: number) => true);
    const releaseMock = mock(async () => {});
    webhookIdempotency.release = releaseMock;
    mock.module("@cogito-app/api", () => ({
      services: {
        payment: {
          provider: {
            verifyWebhook: async () => basePayload,
          },
          confirmFromWebhook: mock(async () => {
            throw new Error("connection reset");
          }),
        },
      },
    }));
    const { paymentsWebhook } = await import("./payments");
    const app = paymentsWebhook(new Elysia());
    const res = await app.handle(requestFor(basePayload));
    expect(res.status).toBe(500);
    expect(releaseMock).toHaveBeenCalled();
  });

  test("M5: unknown payment status → 400, claim NOT released", async () => {
    webhookIdempotency.claim = mock(async (_k: string, _ttl?: number) => true);
    const markProcessedMock = mock(async () => {});
    const releaseMock = mock(async () => {});
    webhookIdempotency.markProcessed = markProcessedMock;
    webhookIdempotency.release = releaseMock;
    mock.module("@cogito-app/api", () => ({
      services: {
        payment: {
          provider: {
            verifyWebhook: async () => basePayload,
          },
          confirmFromWebhook: mock(async () => {
            throw new Error("Unknown payment status: BOGUS");
          }),
        },
      },
    }));
    const { paymentsWebhook } = await import("./payments");
    const app = paymentsWebhook(new Elysia());
    const res = await app.handle(requestFor(basePayload));
    expect(res.status).toBe(400);
    expect(markProcessedMock).toHaveBeenCalled();
    expect(releaseMock).not.toHaveBeenCalled();
  });
});
