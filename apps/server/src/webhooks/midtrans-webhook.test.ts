import { createHash } from "crypto";
import { describe, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { webhookIdempotency } from "@cogito-app/api/lib/idempotency";
import { WebhookSignatureError } from "@cogito-app/api/modules/payment/payment.errors";

const ORDER_ID = "550e8400-e29b-41d4-a716-446655440000";
const SERVER_KEY = "SB-Mid-server-test123";

function signatureFor(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  key: string,
) {
  return createHash("sha512")
    .update(orderId + statusCode + grossAmount + key)
    .digest("hex");
}

function midtransBody(overrides: Record<string, unknown> = {}) {
  const base: Record<string, unknown> = {
    transaction_time: "2026-09-03 10:00:00",
    transaction_status: "settlement",
    transaction_id: "57d5293c-e65f-4a29-95e4-5959c3fa335b",
    status_message: "midtrans payment notification",
    status_code: "200",
    payment_type: "qris",
    order_id: ORDER_ID,
    merchant_id: "G123456789",
    gross_amount: "430000.00",
    fraud_status: "accept",
    currency: "IDR",
  };
  const body = { ...base, ...overrides };
  body.signature_key = signatureFor(
    String(body.order_id),
    String(body.status_code),
    String(body.gross_amount),
    SERVER_KEY,
  );
  return body;
}

describe("midtrans webhook route", () => {
  test("verifies the body signature_key and confirms the payment (no signature header needed)", async () => {
    webhookIdempotency.claim = mock(async (_k: string, _ttl?: number) => true);
    const markProcessedMock = mock(async () => {});
    webhookIdempotency.markProcessed = markProcessedMock;
    mock.module("@cogito-app/api", () => ({
      services: {
        payment: {
          provider: {
            verifyWebhook: async (rawBody: string) => {
              const body = JSON.parse(rawBody);
              return {
                providerReference: "midtrans:user1:starter",
                providerEventId: body.transaction_id,
                status: "SETTLED",
                receiptUrl: null,
                failureReason: null,
              };
            },
          },
          confirmFromWebhook: mock(async () => ({ status: "SETTLED" })),
        },
      },
    }));
    const { paymentsWebhook } = await import("./payments");
    const app = paymentsWebhook(new Elysia());
    const res = await app.handle(
      new Request("http://localhost/webhooks/payments/midtrans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(midtransBody()),
      }),
    );
    expect(res.status).toBe(200);
    expect(markProcessedMock).toHaveBeenCalled();
  });

  test("rejects a midtrans webhook with an invalid body signature (401)", async () => {
    webhookIdempotency.claim = mock(async (_k: string, _ttl?: number) => true);
    mock.module("@cogito-app/api", () => ({
      services: {
        payment: {
          provider: {
            verifyWebhook: async () => {
              throw new WebhookSignatureError();
            },
          },
          confirmFromWebhook: mock(async () => ({ status: "SETTLED" })),
        },
      },
    }));
    const { paymentsWebhook } = await import("./payments");
    const app = paymentsWebhook(new Elysia());
    const body = midtransBody();
    body.signature_key = "deadbeef";
    const res = await app.handle(
      new Request("http://localhost/webhooks/payments/midtrans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    expect(res.status).toBe(401);
  });
});
