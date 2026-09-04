import { createHash } from "crypto";
import { expect, test, describe, mock, afterEach } from "bun:test";
import { createMidtransPaymentProvider } from "../../modules/payment/midtrans-payment.provider";

const opts = {
  serverKey: "SB-Mid-server-test123",
  merchantId: "G123456789",
  mode: "test" as const,
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

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

function notificationBody(
  overrides: Record<string, unknown> = {},
  key = opts.serverKey,
) {
  const base = {
    transaction_time: "2026-09-03 10:00:00",
    transaction_status: "settlement",
    transaction_id: "57d5293c-e65f-4a29-95e4-5959c3fa335b",
    status_message: "midtrans payment notification",
    status_code: "200",
    payment_type: "qris",
    order_id: "550e8400-e29b-41d4-a716-446655440000",
    merchant_id: opts.merchantId,
    gross_amount: "430000.00",
    fraud_status: "accept",
    currency: "IDR",
  };
  const body = { ...base, ...overrides };
  body.signature_key = signatureFor(
    String(body.order_id),
    String(body.status_code),
    String(body.gross_amount),
    key,
  );
  return body;
}

describe("MidtransPaymentProvider createIntent (Snap)", () => {
  const provider = createMidtransPaymentProvider(opts);

  test("posts the Snap request shape and parses redirect_url", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = mock((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(
        new Response(
          JSON.stringify({
            token: "66e4fa55-fdac-4ef9-91b5-733b97d1b862",
            redirect_url:
              "https://app.sandbox.midtrans.com/snap/v2/vtweb/66e4fa55-fdac-4ef9-91b5-733b97d1b862",
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      );
    }) as never;

    const result = await provider.createIntent({
      paymentId: "550e8400-e29b-41d4-a716-446655440000",
      amountIdr: 430000,
      providerReference: "midtrans:user1:starter",
    });
    expect(result.checkoutUrl).toBe(
      "https://app.sandbox.midtrans.com/snap/v2/vtweb/66e4fa55-fdac-4ef9-91b5-733b97d1b862",
    );
    // The payment UUID is the order_id (unique per attempt, valid charset).
    expect(result.paymentRequestId).toBe(
      "550e8400-e29b-41d4-a716-446655440000",
    );

    expect(calls.length).toBe(1);
    expect(calls[0]!.url).toBe(
      "https://app.sandbox.midtrans.com/snap/v1/transactions",
    );
    expect(calls[0]!.init.headers).toMatchObject({
      "content-type": "application/json",
      accept: "application/json",
    });
    const auth = calls[0]!.init.headers as Record<string, string>;
    expect(auth.authorization).toBe(
      `Basic ${Buffer.from(`${opts.serverKey}:`).toString("base64")}`,
    );

    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body).toEqual({
      transaction_details: {
        order_id: "550e8400-e29b-41d4-a716-446655440000",
        gross_amount: 430000,
      },
    });
  });

  test("uses the production Snap endpoint in live mode", async () => {
    const liveProvider = createMidtransPaymentProvider({
      ...opts,
      mode: "live",
    });
    const calls: Array<{ url: string }> = [];
    globalThis.fetch = mock((url: string) => {
      calls.push({ url });
      return Promise.resolve(
        new Response(
          JSON.stringify({
            token: "t",
            redirect_url: "https://app.midtrans.com/snap/v2/vtweb/t",
          }),
          { status: 201 },
        ),
      );
    }) as never;

    await liveProvider.createIntent({
      paymentId: "pay-live-1",
      amountIdr: 100000,
      providerReference: "midtrans:user1:starter",
    });
    expect(calls[0]!.url).toBe("https://app.midtrans.com/snap/v1/transactions");
  });

  test("rejects a response without redirect_url", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ token: "t" }), { status: 201 }),
      ),
    ) as never;

    await expect(
      provider.createIntent({
        paymentId: "pay-invalid",
        amountIdr: 100000,
        providerReference: "midtrans:user1:starter",
      }),
    ).rejects.toThrow("Payment provider returned invalid response");
  });

  test("surfaces bounded Midtrans error details on 4xx", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            status_code: "400",
            status_message:
              "transaction_details.gross_amount is not equal to the sum of item_details",
          }),
          { status: 400, statusText: "Bad Request" },
        ),
      ),
    ) as never;

    await expect(
      provider.createIntent({
        paymentId: "pay-4xx",
        amountIdr: 100000,
        providerReference: "midtrans:user1:starter",
      }),
    ).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message:
        "Payment provider error: 400 400 - transaction_details.gross_amount is not equal to the sum of item_details",
    });
  });

  test("maps a non-JSON 5xx to service unavailable", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response("gateway down", {
          status: 503,
          statusText: "Service Unavailable",
        }),
      ),
    ) as never;

    await expect(
      provider.createIntent({
        paymentId: "pay-5xx",
        amountIdr: 100000,
        providerReference: "midtrans:user1:starter",
      }),
    ).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message: "Payment provider error: 503 Service Unavailable",
    });
  });

  test("handles an unreadable error response body", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        text: async () => {
          throw new Error("response body unavailable");
        },
      }),
    ) as never;

    await expect(
      provider.createIntent({
        paymentId: "pay-unreadable",
        amountIdr: 100000,
        providerReference: "midtrans:user1:starter",
      }),
    ).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message: "Payment provider error: 502 Bad Gateway",
    });
  });

  test("retries transient AbortError failures", async () => {
    const abortError = new Error("request aborted");
    abortError.name = "AbortError";
    globalThis.fetch = mock(() => {
      throw abortError;
    }) as never;

    await expect(
      provider.createIntent({
        paymentId: "pay-abort",
        amountIdr: 100000,
        providerReference: "midtrans:user1:starter",
      }),
    ).rejects.toThrow("request aborted");
  });

  test("logs the open circuit-breaker state after repeated provider failures", async () => {
    const circuitProvider = createMidtransPaymentProvider(opts);
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
            providerReference: `midtrans-circuit-${attempt}`,
          }),
        ).rejects.toThrow("circuit outage");
      }

      await expect(
        circuitProvider.createIntent({
          paymentId: "pay_circuit_open",
          amountIdr: 50000,
          providerReference: "midtrans-circuit-open",
        }),
      ).rejects.toThrow("Circuit breaker is open");
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });
});

describe("MidtransPaymentProvider verifyWebhook (signature_key)", () => {
  const provider = createMidtransPaymentProvider(opts);

  test("accepts a valid signature and maps settlement to SETTLED", async () => {
    const body = JSON.stringify(notificationBody());
    const payload = await provider.verifyWebhook(body, "");
    expect(payload.providerReference).toBe(
      "550e8400-e29b-41d4-a716-446655440000",
    );
    expect(payload.providerEventId).toBe(
      "57d5293c-e65f-4a29-95e4-5959c3fa335b",
    );
    expect(payload.status).toBe("SETTLED");
    expect(payload.failureReason).toBeNull();
  });

  test("resolves the stored provider reference via resolvePayment", async () => {
    const resolvingProvider = createMidtransPaymentProvider({
      ...opts,
      resolvePayment: async (paymentId) =>
        paymentId === "550e8400-e29b-41d4-a716-446655440000"
          ? { providerReference: "midtrans:user1:starter" }
          : null,
    });
    const body = JSON.stringify(notificationBody());
    const payload = await resolvingProvider.verifyWebhook(body, "");
    expect(payload.providerReference).toBe("midtrans:user1:starter");
  });

  test("falls back to order_id when resolvePayment fails", async () => {
    const failingProvider = createMidtransPaymentProvider({
      ...opts,
      resolvePayment: async () => {
        throw new Error("db down");
      },
    });
    const body = JSON.stringify(notificationBody());
    const payload = await failingProvider.verifyWebhook(body, "");
    expect(payload.providerReference).toBe(
      "550e8400-e29b-41d4-a716-446655440000",
    );
  });

  test("rejects a signed notification for a different merchant_id", async () => {
    const body = JSON.stringify(
      notificationBody({ merchant_id: "G999999999" }),
    );
    await expect(provider.verifyWebhook(body, "")).rejects.toThrow(
      "Invalid webhook signature",
    );
  });

  test("accepts a signed notification with the configured merchant_id", async () => {
    const body = JSON.stringify(
      notificationBody({ merchant_id: opts.merchantId }),
    );
    const payload = await provider.verifyWebhook(body, "");
    expect(payload.status).toBe("SETTLED");
  });

  test("rejects an invalid signature", async () => {
    const body = JSON.stringify(
      notificationBody({}, "SB-Mid-server-wrong-key"),
    );
    await expect(provider.verifyWebhook(body, "")).rejects.toThrow(
      "Invalid webhook signature",
    );
  });

  test("rejects a tampered payload with a valid-looking signature", async () => {
    const body = notificationBody();
    body.gross_amount = "999999.00"; // tamper after signing
    await expect(
      provider.verifyWebhook(JSON.stringify(body), ""),
    ).rejects.toThrow("Invalid webhook signature");
  });

  test("rejects a body missing signature fields", async () => {
    const body = JSON.stringify({ order_id: "x", status_code: "200" });
    await expect(provider.verifyWebhook(body, "")).rejects.toThrow(
      "Invalid webhook signature",
    );
  });

  test("rejects malformed JSON", async () => {
    await expect(provider.verifyWebhook("not-json", "")).rejects.toThrow(
      "Invalid webhook payload: malformed JSON",
    );
  });

  test("maps capture with fraud accept to PAID", async () => {
    const body = JSON.stringify(
      notificationBody({
        transaction_status: "capture",
        payment_type: "credit_card",
      }),
    );
    const payload = await provider.verifyWebhook(body, "");
    expect(payload.status).toBe("PAID");
  });

  test("maps capture with fraud deny to FAILED", async () => {
    const body = JSON.stringify(
      notificationBody({
        transaction_status: "capture",
        fraud_status: "deny",
        payment_type: "credit_card",
      }),
    );
    const payload = await provider.verifyWebhook(body, "");
    expect(payload.status).toBe("FAILED");
  });

  test("maps capture with fraud challenge to PENDING", async () => {
    const body = JSON.stringify(
      notificationBody({
        transaction_status: "capture",
        fraud_status: "challenge",
        payment_type: "credit_card",
      }),
    );
    const payload = await provider.verifyWebhook(body, "");
    expect(payload.status).toBe("PENDING");
  });

  test("maps pending to PENDING", async () => {
    const body = JSON.stringify(
      notificationBody({ transaction_status: "pending" }),
    );
    const payload = await provider.verifyWebhook(body, "");
    expect(payload.status).toBe("PENDING");
  });

  test("maps deny/cancel/failure to FAILED with failure reason", async () => {
    for (const status of ["deny", "cancel", "failure"]) {
      const body = JSON.stringify(
        notificationBody({
          transaction_status: status,
          status_message: "Payment rejected by provider",
        }),
      );
      const payload = await provider.verifyWebhook(body, "");
      expect(payload.status).toBe("FAILED");
      expect(payload.failureReason).toBe("Payment rejected by provider");
    }
  });

  test("maps expire to EXPIRED", async () => {
    const body = JSON.stringify(
      notificationBody({ transaction_status: "expire" }),
    );
    const payload = await provider.verifyWebhook(body, "");
    expect(payload.status).toBe("EXPIRED");
  });

  test("maps refund and partial_refund to REFUNDED", async () => {
    for (const status of ["refund", "partial_refund"]) {
      const body = JSON.stringify(
        notificationBody({ transaction_status: status }),
      );
      const payload = await provider.verifyWebhook(body, "");
      expect(payload.status).toBe("REFUNDED");
    }
  });

  test("rejects an unknown status", async () => {
    const body = JSON.stringify(
      notificationBody({ transaction_status: "bogus" }),
    );
    await expect(provider.verifyWebhook(body, "")).rejects.toThrow(
      "Unknown payment status",
    );
  });

  test("uses the dedicated webhook signature key when configured", async () => {
    const dedicatedKey = "dedicated-signature-key";
    const dedicatedProvider = createMidtransPaymentProvider({
      ...opts,
      webhookSignatureKey: dedicatedKey,
    });
    const body = JSON.stringify(notificationBody({}, dedicatedKey));
    const payload = await dedicatedProvider.verifyWebhook(body, "");
    expect(payload.status).toBe("SETTLED");

    // A body signed with the server key must now be rejected.
    const serverKeyBody = JSON.stringify(notificationBody());
    await expect(
      dedicatedProvider.verifyWebhook(serverKeyBody, ""),
    ).rejects.toThrow("Invalid webhook signature");
  });
});

describe("MidtransPaymentProvider getPaymentRequestStatus", () => {
  const provider = createMidtransPaymentProvider(opts);

  test("maps the authoritative status and resolves the provider reference", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const resolvingProvider = createMidtransPaymentProvider({
      ...opts,
      resolvePayment: async (paymentId) =>
        paymentId === "550e8400-e29b-41d4-a716-446655440000"
          ? { providerReference: "midtrans:user1:starter" }
          : null,
    });
    globalThis.fetch = mock((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(
        Response.json({
          transaction_status: "settlement",
          transaction_id: "txn-1",
          order_id: "550e8400-e29b-41d4-a716-446655440000",
          fraud_status: "accept",
        }),
      );
    }) as never;

    await expect(
      resolvingProvider.getPaymentRequestStatus!(
        "550e8400-e29b-41d4-a716-446655440000",
      ),
    ).resolves.toEqual({
      providerReference: "midtrans:user1:starter",
      providerEventId: "txn-1",
      status: "SETTLED",
      failureReason: null,
      receiptUrl: null,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(
      "https://api.sandbox.midtrans.com/v2/550e8400-e29b-41d4-a716-446655440000/status",
    );
  });

  test("uses the production status endpoint in live mode", async () => {
    const liveProvider = createMidtransPaymentProvider({
      ...opts,
      mode: "live",
    });
    const calls: Array<{ url: string }> = [];
    globalThis.fetch = mock((url: string) => {
      calls.push({ url });
      return Promise.resolve(
        Response.json({ transaction_status: "pending", order_id: "pay-live" }),
      );
    }) as never;

    await liveProvider.getPaymentRequestStatus!("pay-live");
    expect(calls[0]!.url).toBe("https://api.midtrans.com/v2/pay-live/status");
  });

  test("rejects provider errors", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response("unavailable", { status: 503, statusText: "Unavailable" }),
      ),
    ) as never;
    await expect(
      provider.getPaymentRequestStatus!("pay-error"),
    ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });
});

describe("MidtransPaymentProvider refund", () => {
  const provider = createMidtransPaymentProvider(opts);

  test("creates a provider-side refund and returns its key", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = mock((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(
        new Response(JSON.stringify({ refund_key: "rfd-123" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }) as never;

    await expect(
      provider.refund(
        "550e8400-e29b-41d4-a716-446655440000",
        43_000,
        "CUSTOMER_REQUEST",
      ),
    ).resolves.toEqual({ providerRefundId: "rfd-123" });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      "https://api.sandbox.midtrans.com/v2/550e8400-e29b-41d4-a716-446655440000/refund",
    );
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      amount: 43_000,
      reason: "CUSTOMER_REQUEST",
    });
  });

  test("maps a JSON refund provider error to service unavailable", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            status_code: "406",
            status_message: "Refund failed",
          }),
          { status: 406, statusText: "Not Acceptable" },
        ),
      ),
    ) as never;

    await expect(provider.refund("pay-1", 43_000)).rejects.toThrow(
      "Payment provider refund error: 406 406 - Refund failed",
    );
  });

  test("rejects a successful refund response without a key", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    ) as never;

    await expect(provider.refund("pay-1", 43_000)).rejects.toThrow(
      "Payment provider returned invalid refund response",
    );
  });
});
