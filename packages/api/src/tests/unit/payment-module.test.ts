import { describe, expect, test } from "bun:test";
import { createPaymentModule } from "../../modules/payment";

describe("createPaymentModule provider selection (C4)", () => {
  const base = {
    db: {} as any,
    wallet: { getOrCreate: async () => ({}), credit: async () => ({}) } as any,
    webhookSecret: "test-payment-webhook-secret",
  };

  test("throws when provider=xendit but xenditConfig is missing (no silent stub fallback)", () => {
    expect(() =>
      createPaymentModule({ ...base, provider: "xendit" }),
    ).toThrow(/Xendit credentials are missing/);
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
        successRedirectUrl: "http://localhost:3000/success",
        failureRedirectUrl: "http://localhost:3000/failure",
      },
    });
    expect(module.service).toBeDefined();
  });
});
