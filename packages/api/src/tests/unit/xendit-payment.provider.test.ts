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

describe("XenditPaymentProvider (2024-11-11 API)", () => {
  const provider = createXenditPaymentProvider(opts);

  test("createIntent posts the 2024-11-11 request shape and parses the top-level response", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = mock((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id: "pr_123",
            payment_request_id: "pr_123",
            reference_id: "xendit-pay_123",
            status: "REQUIRES_ACTION",
            actions: [
              {
                type: "REDIRECT_CUSTOMER",
                value: "https://checkout.xendit.co/test",
                descriptor: "WEB_URL",
              },
            ],
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      );
    }) as never;

    const result = await provider.createIntent({
      paymentId: "pay_123",
      amountIdr: 430000,
      providerReference: "xendit-pay_123",
    });
    expect(result.checkoutUrl).toBe("https://checkout.xendit.co/test");

    expect(calls.length).toBe(1);
    expect(calls[0]!.url).toBe("https://api.xendit.co/v3/payment_requests");
    expect(calls[0]!.init.headers).toMatchObject({
      "api-version": "2024-11-11",
      "content-type": "application/json",
    });

    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body).toMatchObject({
      reference_id: "xendit-pay_123",
      type: "PAY",
      country: "ID",
      currency: "IDR",
      request_amount: 430000,
      channel_code: "OVO",
      channel_properties: {
        success_return_url: opts.successRedirectUrl,
        failure_return_url: opts.failureRedirectUrl,
      },
      metadata: { paymentId: "pay_123" },
    });
    // Legacy v3 fields must NOT be present.
    expect(body.amount).toBeUndefined();
    expect(body.payment_method).toBeUndefined();
    expect(body.success_redirect_url).toBeUndefined();
  });

  test("createIntent maps qris channel to QRIS and parses PRESENT_TO_CUSTOMER action", async () => {
    const qrProvider = createXenditPaymentProvider({
      ...opts,
      defaultPaymentMethod: "qris",
    });
    const calls: Array<{ init: RequestInit }> = [];
    globalThis.fetch = mock((_url: string, init: RequestInit) => {
      calls.push({ init });
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id: "pr_qr",
            payment_request_id: "pr_qr",
            reference_id: "xendit-pay_qr",
            status: "REQUIRES_ACTION",
            actions: [
              {
                type: "PRESENT_TO_CUSTOMER",
                descriptor: "QR_STRING",
                value: "000201010211QRISDATA",
              },
            ],
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      );
    }) as never;

    const result = await qrProvider.createIntent({
      paymentId: "pay_qr",
      amountIdr: 50000,
      providerReference: "xendit-pay_qr",
    });
    expect(result.checkoutUrl).toBe("000201010211QRISDATA");

    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body.channel_code).toBe("QRIS");
    expect(body.channel_properties).toMatchObject({
      success_return_url: opts.successRedirectUrl,
      failure_return_url: opts.failureRedirectUrl,
    });
  });

  test("createIntent maps va_bca channel to BCA", async () => {
    const vaProvider = createXenditPaymentProvider({
      ...opts,
      defaultPaymentMethod: "va_bca",
    });
    const calls: Array<{ init: RequestInit }> = [];
    globalThis.fetch = mock((_url: string, init: RequestInit) => {
      calls.push({ init });
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id: "pr_va",
            payment_request_id: "pr_va",
            reference_id: "xendit-pay_va",
            status: "REQUIRES_ACTION",
            actions: [
              {
                type: "PRESENT_TO_CUSTOMER",
                descriptor: "VIRTUAL_ACCOUNT_NUMBER",
                value: "8881761038089006",
              },
            ],
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      );
    }) as never;

    const result = await vaProvider.createIntent({
      paymentId: "pay_va",
      amountIdr: 100000,
      providerReference: "xendit-pay_va",
    });
    expect(result.checkoutUrl).toBe("8881761038089006");
    expect(JSON.parse(calls[0]!.init.body as string).channel_code).toBe("BCA");
  });

  test("createIntent includes customer for e-wallet channels", async () => {
    const calls: Array<{ init: RequestInit }> = [];
    globalThis.fetch = mock((_url: string, init: RequestInit) => {
      calls.push({ init });
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id: "pr_c",
            payment_request_id: "pr_c",
            reference_id: "xendit-pay_c",
            status: "REQUIRES_ACTION",
            actions: [
              {
                type: "REDIRECT_CUSTOMER",
                value: "https://checkout.xendit.co/c",
                descriptor: "WEB_URL",
              },
            ],
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      );
    }) as never;

    const providerWithCustomer = createXenditPaymentProvider({
      ...opts,
      customer: {
        referenceId: "cust_1",
        givenNames: "Student",
        email: "student@example.com",
        mobileNumber: "+628123456789",
      },
    });
    const result = await providerWithCustomer.createIntent({
      paymentId: "pay_c",
      amountIdr: 100000,
      providerReference: "xendit-pay_c",
    });
    expect(result.checkoutUrl).toBe("https://checkout.xendit.co/c");

    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body.customer).toMatchObject({
      reference_id: "cust_1",
      given_names: "Student",
      email: "student@example.com",
      mobile_number: "+628123456789",
    });
  });

  test("createIntent throws on API error", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error_code: "API_VALIDATION_ERROR",
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

  test("createIntent throws when no checkout URL in response", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            id: "pr_123",
            payment_request_id: "pr_123",
            reference_id: "xendit-pay_123",
            status: "REQUIRES_ACTION",
            actions: [],
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      ),
    ) as never;

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

    await expect(
      provider.createIntent({
        paymentId: "pay_500",
        amountIdr: 50000,
        providerReference: "xendit-pay_500",
      }),
    ).rejects.toThrow("Payment provider error: 500 Internal Server Error");
  });
});

describe("XenditPaymentProvider verifyWebhook (2024-11-11)", () => {
  const provider = createXenditPaymentProvider(opts);

  test("accepts valid token and parses SUCCEEDED from data.payment_id", async () => {
    const body = JSON.stringify({
      event: "payment.succeeded",
      data: {
        id: "py_001",
        payment_request_id: "pr_123",
        payment_id: "py_001",
        reference_id: "xendit-pay_123",
        status: "SUCCEEDED",
      },
    });

    const payload = await provider.verifyWebhook(body, opts.webhookToken);
    expect(payload.providerReference).toBe("xendit-pay_123");
    expect(payload.providerEventId).toBe("py_001");
    expect(payload.status).toBe("PAID");
  });

  test("derives providerEventId from data.payment_request_id when payment_id is absent", async () => {
    const body = JSON.stringify({
      event: "payment_request.paid",
      data: {
        id: "pr_123",
        payment_request_id: "pr_123",
        reference_id: "xendit-pay_456",
        status: "SUCCEEDED",
      },
    });

    const payload = await provider.verifyWebhook(body, opts.webhookToken);
    expect(payload.providerEventId).toBe("pr_123");
    expect(payload.providerReference).toBe("xendit-pay_456");
    expect(payload.status).toBe("PAID");
  });

  test("falls back to body-level payment_id", async () => {
    const body = JSON.stringify({
      event: "payment.succeeded",
      payment_id: "py_789",
      data: {
        id: "py_789",
        reference_id: "ref_789",
        status: "SUCCEEDED",
      },
    });

    const payload = await provider.verifyWebhook(body, opts.webhookToken);
    expect(payload.providerEventId).toBe("py_789");
    expect(payload.status).toBe("PAID");
  });

  test("maps REQUIRES_ACTION to PENDING", async () => {
    const body = JSON.stringify({
      event: "payment_request.created",
      data: {
        id: "pr_abc",
        payment_request_id: "pr_abc",
        reference_id: "ref_abc",
        status: "REQUIRES_ACTION",
      },
    });

    const payload = await provider.verifyWebhook(body, opts.webhookToken);
    expect(payload.status).toBe("PENDING");
  });

  test("maps AUTHORIZED to PENDING", async () => {
    const body = JSON.stringify({
      event: "payment.authorized",
      data: {
        id: "py_auth",
        payment_id: "py_auth",
        reference_id: "ref_auth",
        status: "AUTHORIZED",
      },
    });

    const payload = await provider.verifyWebhook(body, opts.webhookToken);
    expect(payload.status).toBe("PENDING");
  });

  test("maps CANCELED to FAILED", async () => {
    const body = JSON.stringify({
      event: "payment.canceled",
      data: {
        id: "py_cancel",
        payment_id: "py_cancel",
        reference_id: "ref_cancel",
        status: "CANCELED",
      },
    });

    const payload = await provider.verifyWebhook(body, opts.webhookToken);
    expect(payload.status).toBe("FAILED");
  });

  test("parses failure_code from data", async () => {
    const body = JSON.stringify({
      event: "payment.failed",
      data: {
        id: "py_fail",
        payment_id: "py_fail",
        reference_id: "ref_fail",
        status: "FAILED",
        failure_code: "DECLINED",
      },
    });

    const payload = await provider.verifyWebhook(body, opts.webhookToken);
    expect(payload.status).toBe("FAILED");
    expect(payload.failureReason).toBe("DECLINED");
  });

  test("rejects invalid token", async () => {
    const body = JSON.stringify({
      data: { id: "x", reference_id: "x", status: "SUCCEEDED" },
    });

    await expect(provider.verifyWebhook(body, "wrong_token")).rejects.toThrow(
      "Invalid webhook token",
    );
  });

  test("rejects unknown status", async () => {
    const body = JSON.stringify({
      data: { id: "x", reference_id: "x", status: "UNKNOWN" },
    });

    await expect(
      provider.verifyWebhook(body, opts.webhookToken),
    ).rejects.toThrow("Unknown payment status");
  });

  test("rejects malformed JSON", async () => {
    await expect(
      provider.verifyWebhook("not-json", opts.webhookToken),
    ).rejects.toThrow("Invalid webhook payload: malformed JSON");
  });

  test("handles missing reference gracefully", async () => {
    const body = JSON.stringify({
      data: { id: "py_missing", payment_id: "py_missing", status: "SUCCEEDED" },
    });

    const payload = await provider.verifyWebhook(body, opts.webhookToken);
    expect(payload.providerEventId).toBe("py_missing");
  });
});
