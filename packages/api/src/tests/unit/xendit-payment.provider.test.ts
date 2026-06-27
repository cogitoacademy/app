import { expect, test, describe, mock, afterEach } from "bun:test";
import { createXenditPaymentProvider } from "../../modules/payment/xendit-payment.provider";

const opts = {
  secretKey: "xnd_development_test123",
  webhookToken: "wh_token_test_abc",
  successRedirectUrl: "http://localhost:3000/balance?status=success",
  failureRedirectUrl: "http://localhost:3000/balance?status=failed",
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("XenditPaymentProvider", () => {
  const provider = createXenditPaymentProvider(opts);

  test("createIntent returns checkoutUrl from actions[0].url", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              id: "pr_123",
              reference_id: "xendit-pay_123",
              status: "PENDING",
              actions: [{ url: "https://checkout.xendit.co/test" }],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    ) as never;

    const result = await provider.createIntent({
      paymentId: "pay_123",
      amountIdr: 430000,
      providerReference: "xendit-pay_123",
    });
    expect(result.checkoutUrl).toBe("https://checkout.xendit.co/test");
  });

  test("createIntent throws on API error", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error_code: "API_ERROR",
            message: "Invalid amount",
          }),
          { status: 400, headers: { "content-type": "application/json" } },
        ),
      ),
    ) as never;

    await expect(
      provider.createIntent({
        paymentId: "pay_456",
        amountIdr: 0,
        providerReference: "xendit-pay_456",
      }),
    ).rejects.toThrow("Xendit API error");
  });

  test("verifyWebhook accepts valid token and parses PAID", async () => {
    const body = JSON.stringify({
      event_id: "evt_001",
      data: {
        id: "pr_123",
        reference_id: "xendit-pay_123",
        status: "PAID",
      },
    });

    const payload = await provider.verifyWebhook(body, opts.webhookToken);
    expect(payload.providerReference).toBe("xendit-pay_123");
    expect(payload.providerEventId).toBe("evt_001");
    expect(payload.status).toBe("PAID");
  });

  test("verifyWebhook parses SETTLED", async () => {
    const body = JSON.stringify({
      event_id: "evt_002",
      data: { reference_id: "xendit-pay_456", status: "SETTLED" },
    });

    const payload = await provider.verifyWebhook(body, opts.webhookToken);
    expect(payload.status).toBe("SETTLED");
  });

  test("verifyWebhook parses FAILED with failure_code", async () => {
    const body = JSON.stringify({
      event_id: "evt_003",
      data: {
        reference_id: "xendit-pay_789",
        status: "FAILED",
        failure_code: "DECLINED",
      },
    });

    const payload = await provider.verifyWebhook(body, opts.webhookToken);
    expect(payload.status).toBe("FAILED");
    expect(payload.failureReason).toBe("DECLINED");
  });

  test("verifyWebhook parses EXPIRED", async () => {
    const body = JSON.stringify({
      event_id: "evt_004",
      data: { reference_id: "xendit-pay_000", status: "EXPIRED" },
    });

    const payload = await provider.verifyWebhook(body, opts.webhookToken);
    expect(payload.status).toBe("EXPIRED");
  });

  test("verifyWebhook rejects invalid token", async () => {
    const body = JSON.stringify({
      event_id: "evt_005",
      data: { reference_id: "x", status: "PAID" },
    });

    await expect(provider.verifyWebhook(body, "wrong_token")).rejects.toThrow(
      "Invalid webhook token",
    );
  });

  test("verifyWebhook rejects unknown status", async () => {
    const body = JSON.stringify({
      event_id: "evt_006",
      data: { reference_id: "x", status: "UNKNOWN" },
    });

    await expect(
      provider.verifyWebhook(body, opts.webhookToken),
    ).rejects.toThrow("Unknown Xendit status");
  });
});
