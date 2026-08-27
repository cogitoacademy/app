import { expect, test, describe, mock, afterEach } from "bun:test";
import { createXenditPaymentProvider } from "../../modules/payment/xendit-payment.provider";

const opts = {
  secretKey: "xnd_development_test123",
  webhookToken: "wh_token_test_abc",
  mode: "test" as const,
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

  test("createIntent retries transient network failures", async () => {
    globalThis.fetch = mock(() => {
      throw new TypeError("network failure");
    }) as never;

    await expect(
      provider.createIntent({
        paymentId: "pay_network",
        amountIdr: 50000,
        providerReference: "xendit-pay-network",
      }),
    ).rejects.toThrow("network failure");
  });

  test("createIntent retries AbortError failures", async () => {
    const abortError = new Error("request aborted");
    abortError.name = "AbortError";
    globalThis.fetch = mock(() => {
      throw abortError;
    }) as never;

    await expect(
      provider.createIntent({
        paymentId: "pay_abort",
        amountIdr: 50000,
        providerReference: "xendit-pay-abort",
      }),
    ).rejects.toThrow("request aborted");
  });

  test("logs the open circuit-breaker state after repeated provider failures", async () => {
    const circuitProvider = createXenditPaymentProvider(opts);
    const originalSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((callback: TimerHandler) => {
      if (typeof callback === "function") callback();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;
    try {
      globalThis.fetch = mock(() => {
        throw new TypeError("circuit outage");
      }) as never;

      for (let attempt = 0; attempt < 5; attempt++) {
        await expect(
          circuitProvider.createIntent({
            paymentId: `pay_circuit_${attempt}`,
            amountIdr: 50000,
            providerReference: `xendit-circuit-${attempt}`,
          }),
        ).rejects.toThrow("circuit outage");
      }

      await expect(
        circuitProvider.createIntent({
          paymentId: "pay_circuit_open",
          amountIdr: 50000,
          providerReference: "xendit-circuit-open",
        }),
      ).rejects.toThrow("Circuit breaker is open");
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
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

describe("XenditPaymentProvider refund", () => {
  test("creates a provider-side refund and returns its id", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = mock((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(
        new Response(JSON.stringify({ id: "rfd_123" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
      );
    }) as never;
    const provider = createXenditPaymentProvider(opts);

    await expect(
      provider.refund("pr_123", 43_000, "CUSTOMER_REQUEST"),
    ).resolves.toEqual({ providerRefundId: "rfd_123" });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.xendit.co/v3/refunds");
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      payment_request_id: "pr_123",
      currency: "IDR",
      amount: 43_000,
      reason: "CUSTOMER_REQUEST",
    });
  });

  test("maps a JSON refund provider error to service unavailable", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error_code: "REFUND_FAILED" }), {
          status: 422,
          statusText: "Unprocessable Entity",
        }),
      ),
    ) as never;
    const provider = createXenditPaymentProvider(opts);

    await expect(provider.refund("pr_123", 43_000)).rejects.toThrow(
      "Payment provider refund error: 422 REFUND_FAILED",
    );
  });

  test("maps a non-JSON refund provider error to service unavailable", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response("gateway down", {
          status: 503,
          statusText: "Service Unavailable",
        }),
      ),
    ) as never;
    const provider = createXenditPaymentProvider(opts);

    await expect(provider.refund("pr_123", 43_000)).rejects.toThrow(
      "Payment provider refund error: 503 Service Unavailable",
    );
  });

  test("rejects a successful refund response without an id", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({}), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
      ),
    ) as never;
    const provider = createXenditPaymentProvider(opts);

    await expect(provider.refund("pr_123", 43_000)).rejects.toThrow(
      "Payment provider returned invalid refund response",
    );
  });

  test("refund retries transient AbortError failures", async () => {
    const abortError = new Error("refund request aborted");
    abortError.name = "AbortError";
    globalThis.fetch = mock(() => {
      throw abortError;
    }) as never;
    const provider = createXenditPaymentProvider(opts);

    await expect(provider.refund("pr_abort", 43_000)).rejects.toThrow(
      "refund request aborted",
    );
  });
});
