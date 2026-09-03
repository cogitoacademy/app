import { createHash } from "crypto";
import { describe, expect, test } from "bun:test";
import { createPaymentModule } from "../../modules/payment";

const MIDTRANS_SERVER_KEY = "SB-Mid-server-test";

function midtransSignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
) {
  return createHash("sha512")
    .update(orderId + statusCode + grossAmount + MIDTRANS_SERVER_KEY)
    .digest("hex");
}

describe("createPaymentModule provider selection (C4)", () => {
  const base = {
    db: {} as any,
    wallet: { getOrCreate: async () => ({}), credit: async () => ({}) } as any,
    webhookSecret: "test-payment-webhook-secret",
  };

  test("throws when provider=xendit but xenditConfig is missing (no silent stub fallback)", () => {
    expect(() => createPaymentModule({ ...base, provider: "xendit" })).toThrow(
      /Xendit credentials are missing/,
    );
  });

  test("throws when provider=midtrans but midtransConfig is missing (no silent stub fallback)", () => {
    expect(() =>
      createPaymentModule({ ...base, provider: "midtrans" }),
    ).toThrow(/Midtrans credentials are missing/);
  });

  test("throws on an unknown provider value", () => {
    expect(() =>
      createPaymentModule({ ...base, provider: "other" as never }),
    ).toThrow(/Unknown payment provider/);
  });

  test("selects the stub provider when provider=stub", () => {
    const module = createPaymentModule({ ...base, provider: "stub" });
    expect(module.service).toBeDefined();
    expect(module.handler).toBeDefined();
  });

  test("selects the xendit provider when provider=xendit with full config", () => {
    const module = createPaymentModule({
      ...base,
      provider: "xendit",
      xenditConfig: {
        secretKey: "sk_test",
        webhookToken: "wh_token",
        mode: "test",
        successRedirectUrl: "http://localhost:3000/success",
        failureRedirectUrl: "http://localhost:3000/failure",
      },
    });
    expect(module.service).toBeDefined();
  });

  test("selects the midtrans provider when provider=midtrans with full config", () => {
    const module = createPaymentModule({
      ...base,
      provider: "midtrans",
      midtransConfig: {
        serverKey: "SB-Mid-server-test",
        merchantId: "G123456789",
        mode: "test",
      },
    });
    expect(module.service).toBeDefined();
  });

  test("midtrans resolvePayment maps the payment UUID back to the stored provider reference", async () => {
    const record = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      providerReference: "midtrans:user1:starter",
    };
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [record],
          }),
        }),
      }),
    } as any;
    const module = createPaymentModule({
      ...base,
      db,
      provider: "midtrans",
      midtransConfig: {
        serverKey: "SB-Mid-server-test",
        merchantId: "G123456789",
        mode: "test",
      },
    });
    // The provider's verifyWebhook resolves the order_id (payment UUID) to the
    // stored provider reference through the module's resolvePayment closure.
    const payload = await module.service.provider.verifyWebhook(
      JSON.stringify({
        order_id: "550e8400-e29b-41d4-a716-446655440000",
        status_code: "200",
        gross_amount: "430000.00",
        transaction_status: "settlement",
        transaction_id: "txn-1",
        signature_key: midtransSignature(
          "550e8400-e29b-41d4-a716-446655440000",
          "200",
          "430000.00",
        ),
      }),
      "",
    );
    expect(payload.providerReference).toBe("midtrans:user1:starter");
    expect(payload.status).toBe("SETTLED");
  });

  test("midtrans resolvePayment falls back to the order_id when no row matches", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      }),
    } as any;
    const module = createPaymentModule({
      ...base,
      db,
      provider: "midtrans",
      midtransConfig: {
        serverKey: "SB-Mid-server-test",
        merchantId: "G123456789",
        mode: "test",
      },
    });
    const payload = await module.service.provider.verifyWebhook(
      JSON.stringify({
        order_id: "550e8400-e29b-41d4-a716-446655440000",
        status_code: "200",
        gross_amount: "430000.00",
        transaction_status: "settlement",
        transaction_id: "txn-2",
        signature_key: midtransSignature(
          "550e8400-e29b-41d4-a716-446655440000",
          "200",
          "430000.00",
        ),
      }),
      "",
    );
    expect(payload.providerReference).toBe(
      "550e8400-e29b-41d4-a716-446655440000",
    );
  });
});
