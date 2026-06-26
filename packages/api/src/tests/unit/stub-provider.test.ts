import { expect, test, describe } from "bun:test";
import { createStubPaymentProvider } from "../../modules/payment/stub-payment.provider";

const SECRET = "test-webhook-secret-32-chars-long-xxxxx";

async function signBody(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );
  return Buffer.from(sig).toString("hex");
}

describe("StubPaymentProvider", () => {
  const provider = createStubPaymentProvider(SECRET);

  test("createIntent returns checkoutUrl containing providerReference", async () => {
    const result = await provider.createIntent({
      paymentId: "pay_123",
      amountIdr: 430000,
      providerReference: "stub-pay_123",
    });
    expect(result.checkoutUrl).toContain("stub-pay_123");
  });

  test("verifyWebhook accepts valid HMAC signature", async () => {
    const body = JSON.stringify({
      providerReference: "stub-pay_123",
      providerEventId: "evt_1",
      status: "succeeded",
    });
    const signature = await signBody(body, SECRET);

    const payload = await provider.verifyWebhook(body, signature);
    expect(payload.providerReference).toBe("stub-pay_123");
    expect(payload.providerEventId).toBe("evt_1");
    expect(payload.status).toBe("succeeded");
  });

  test("verifyWebhook rejects invalid signature", async () => {
    const body = JSON.stringify({
      providerReference: "x",
      providerEventId: "y",
      status: "succeeded",
    });
    await expect(provider.verifyWebhook(body, "deadbeef")).rejects.toThrow(
      "Invalid webhook signature",
    );
  });
});
