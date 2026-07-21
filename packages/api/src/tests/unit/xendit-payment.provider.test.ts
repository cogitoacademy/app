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
    ).rejects.toThrow("Payment provider error");
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
    ).rejects.toThrow("Unknown payment status");
  });

  test("verifyWebhook rejects malformed JSON", async () => {
    await expect(
      provider.verifyWebhook("not-json", opts.webhookToken),
    ).rejects.toThrow("Invalid webhook payload: malformed JSON");
  });

  test("verifyWebhook parses PENDING status", async () => {
    const body = JSON.stringify({
      event_id: "evt_007",
      data: { reference_id: "xendit-pay_000", status: "PENDING" },
    });
    const payload = await provider.verifyWebhook(body, opts.webhookToken);
    expect(payload.status).toBe("PENDING");
  });

  test("verifyWebhook handles missing reference_id gracefully", async () => {
    const body = JSON.stringify({
      event_id: "evt_008",
      data: { status: "PAID" },
    });
    const payload = await provider.verifyWebhook(body, opts.webhookToken);
    expect(payload.providerReference).toBe("");
    expect(payload.providerEventId).toBe("evt_008");
  });

  test("verifyWebhook falls back to body-level id and reference_id", async () => {
    const body = JSON.stringify({
      id: "body-level-id",
      reference_id: "body-level-ref",
      status: "PAID",
    });
    const payload = await provider.verifyWebhook(body, opts.webhookToken);
    expect(payload.providerReference).toBe("body-level-ref");
    expect(payload.providerEventId).toBe("body-level-id");
  });
});

describe("XenditPaymentProvider - QR_CODE and VIRTUAL_ACCOUNT", () => {
  test("createIntent with QR_CODE payment method", async () => {
    const qrProvider = createXenditPaymentProvider({
      ...opts,
      defaultPaymentMethod: "qris",
    });

    const calls: Array<{ body: string }> = [];
    globalThis.fetch = mock(((_url: string, init: RequestInit) => {
      calls.push({ body: init.body as string });
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              id: "pr_qr",
              reference_id: "xendit-pay_qr",
              status: "PENDING",
              actions: [{ url: "https://checkout.xendit.co/qr" }],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    }) as never);

    const result = await qrProvider.createIntent({
      paymentId: "pay_qr",
      amountIdr: 50000,
      providerReference: "xendit-pay_qr",
    });
    expect(result.checkoutUrl).toBe("https://checkout.xendit.co/qr");

    const parsedBody = JSON.parse(calls[0].body);
    expect(parsedBody.payment_method.type).toBe("QR_CODE");
    expect(parsedBody.payment_method.qr_code).toBeDefined();
    expect(parsedBody.payment_method.qr_code.channel_code).toBe("ID_DANA");
  });

  test("createIntent with VIRTUAL_ACCOUNT payment method", async () => {
    const vaProvider = createXenditPaymentProvider({
      ...opts,
      defaultPaymentMethod: "va_bca",
    });

    const calls: Array<{ body: string }> = [];
    globalThis.fetch = mock(((_url: string, init: RequestInit) => {
      calls.push({ body: init.body as string });
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              id: "pr_va",
              reference_id: "xendit-pay_va",
              status: "PENDING",
              payment_method: { url: "https://checkout.xendit.co/va" },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    }) as never);

    const result = await vaProvider.createIntent({
      paymentId: "pay_va",
      amountIdr: 100000,
      providerReference: "xendit-pay_va",
    });
    expect(result.checkoutUrl).toBe("https://checkout.xendit.co/va");

    const parsedBody = JSON.parse(calls[0].body);
    expect(parsedBody.payment_method.type).toBe("VIRTUAL_ACCOUNT");
    expect(parsedBody.payment_method.virtual_account).toBeDefined();
    expect(parsedBody.payment_method.virtual_account.channel_code).toBe("BCA");
  });

  test("createIntent returns checkoutUrl from payment_method.url when actions missing", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              id: "pr_123",
              reference_id: "xendit-pay_123",
              status: "PENDING",
              payment_method: { url: "https://checkout.xendit.co/fallback" },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    ) as never;

    const provider = createXenditPaymentProvider(opts);
    const result = await provider.createIntent({
      paymentId: "pay_123",
      amountIdr: 430000,
      providerReference: "xendit-pay_123",
    });
    expect(result.checkoutUrl).toBe("https://checkout.xendit.co/fallback");
  });

  test("createIntent throws when no checkout URL in response", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              id: "pr_123",
              reference_id: "xendit-pay_123",
              status: "PENDING",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    ) as never;

    const provider = createXenditPaymentProvider(opts);
    await expect(
      provider.createIntent({
        paymentId: "pay_999",
        amountIdr: 50000,
        providerReference: "xendit-pay_999",
      }),
    ).rejects.toThrow("Payment provider returned invalid response");
  });

  test("createIntent handles non-JSON error response", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response("Internal Server Error", {
          status: 500,
          statusText: "Internal Server Error",
        }),
      ),
    ) as never;

    const provider = createXenditPaymentProvider(opts);
    await expect(
      provider.createIntent({
        paymentId: "pay_500",
        amountIdr: 50000,
        providerReference: "xendit-pay_500",
      }),
    ).rejects.toThrow("Payment provider error: 500 Internal Server Error");
  });
});
