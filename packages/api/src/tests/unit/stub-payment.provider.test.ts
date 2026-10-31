import { createHmac } from "crypto";
import { describe, expect, test } from "bun:test";
import {
  createIntent,
  createStubPaymentProvider,
} from "../../modules/payment/stub-payment.provider";

const secret = "stub-secret";

describe("stub payment provider", () => {
  test.each([
    {
      timestamp: "2040-01-01T00:00:00Z",
      expected: new Date("2040-01-01T00:00:00Z"),
    },
    { timestamp: "invalid", expected: null },
    { timestamp: null, expected: null },
  ])(
    "normalizes signed provider timestamps: $timestamp",
    async ({ timestamp, expected }) => {
      const provider = createStubPaymentProvider(secret);
      const body = JSON.stringify({
        status: "PAID",
        providerReference: "ref_1",
        providerSuccessAt: timestamp,
      });
      const signature = createHmac("sha256", secret).update(body).digest("hex");
      expect(
        (await provider.verifyWebhook(body, signature)).providerSuccessAt,
      ).toEqual(expected);
    },
  );

  test("creates a deterministic checkout intent", async () => {
    await expect(
      createIntent({
        paymentId: "pay_1",
        amountIdr: 50000,
        providerReference: "stub:user:pkg",
      }),
    ).resolves.toEqual({
      checkoutUrl: "/webhooks/payments/stub/checkout?ref=stub:user:pkg",
      paymentRequestId: "pr-stub-pay_1",
    });
  });

  test("returns a deterministic refund id", async () => {
    const provider = createStubPaymentProvider(secret);
    await expect(provider.refund!("pr_1", 50000)).resolves.toEqual({
      providerRefundId: "rfd-stub-pr_1",
    });
  });

  test("verifies a webhook HMAC and parses its payload", async () => {
    const provider = createStubPaymentProvider(secret);
    const body = JSON.stringify({ status: "PAID", providerReference: "ref_1" });
    const signature = createHmac("sha256", secret).update(body).digest("hex");

    await expect(provider.verifyWebhook(body, signature)).resolves.toEqual({
      ...JSON.parse(body),
      providerSuccessAt: null,
    });
    await expect(provider.verifyWebhook(body, "00".repeat(32))).rejects.toThrow(
      "Invalid webhook signature",
    );
  });
});
