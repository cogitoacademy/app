import { createHash } from "crypto";
import { expect, test, describe, mock, afterEach, beforeEach } from "bun:test";
import { createMidtransPaymentProvider } from "../../modules/payment/midtrans-payment.provider";

const opts = {
  serverKey: "SB-Mid-server-test123",
  merchantId: "G123456789",
  mode: "test" as const,
};

test("authenticated status rejects a response bound to another order", async () => {
  const provider = createMidtransPaymentProvider(opts);
  statusApiState = {
    order_id: "different-order",
    transaction_status: "pending",
  };
  await expect(
    provider.getPaymentRequestStatus!("requested-order"),
  ).rejects.toThrow("provider returned a different order");
});

test("refund webhook requires the authenticated provider state to confirm the refund", async () => {
  const provider = createMidtransPaymentProvider(opts);
  const body = notificationBody({ transaction_status: "refund" });
  statusApiState = { ...statusApiState, transaction_status: "pending" };
  await expect(
    provider.verifyWebhook(JSON.stringify(body), ""),
  ).rejects.toThrow("provider has not confirmed a refund");
});

test.each([
  null,
  123,
  "not-a-time",
  "2026-01-01T10:00:00",
  "2026-01-01T10:00:00+99:99",
])(
  "status tolerates unusable success timestamp %s without inventing provider time",
  async (timestamp) => {
    const provider = createMidtransPaymentProvider(opts);
    statusApiState = {
      order_id: "order1",
      transaction_status: "settlement",
      gross_amount: "50000.00",
      currency: "IDR",
      payment_type: "bank_transfer",
      settlement_time: timestamp,
    };
    const result = await provider.getPaymentRequestStatus!("order1");
    expect(result.providerSuccessAt).toBeUndefined();
    expect(result.providerSuccessTimeStatus).toBe("unavailable");
  },
);

test("refund history without usable evidence cannot supply a refund identity", async () => {
  const provider = createMidtransPaymentProvider(opts);
  statusApiState = {
    order_id: "order1",
    transaction_status: "refund",
    gross_amount: "50000.00",
    currency: "IDR",
    refunds: [null, "invalid", {}, { refund_key: "" }],
  };
  expect(
    (await provider.getPaymentRequestStatus!("order1")).providerRefundIdentity,
  ).toBeUndefined();
});

test("provider failures tolerate non-string diagnostic code and message", async () => {
  const provider = createMidtransPaymentProvider(opts);
  globalThis.fetch = mock(async () =>
    Response.json(
      { status_code: 502, status_message: { private: "invalid" } },
      { status: 502 },
    ),
  ) as never;
  await expect(
    provider.createIntent({
      paymentId: "pay1",
      amountIdr: 50000,
      providerReference: "ref1",
    }),
  ).rejects.toThrow("Payment provider");
});

const originalFetch = globalThis.fetch;
let statusApiState: Record<string, unknown>;

beforeEach(() => {
  statusApiState = {};
  globalThis.fetch = mock(() =>
    Promise.resolve(Response.json({ ...statusApiState })),
  ) as never;
});

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
    settlement_time: "2026-09-03 10:05:00",
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
  statusApiState = {
    transaction_status: body.transaction_status,
    transaction_id: body.transaction_id,
    order_id: body.order_id,
    payment_type: body.payment_type,
    fraud_status: body.fraud_status,
    status_message: body.status_message,
    gross_amount: body.gross_amount,
    refund_amount: body.refund_amount,
    currency: body.currency,
    transaction_time: body.transaction_time,
    settlement_time: body.settlement_time,
    refunds: body.refunds,
  };
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

  test("uses authenticated settlement_time for a settled non-card payment", async () => {
    const body = JSON.stringify(
      notificationBody({
        transaction_time: "2026-09-03 08:00:00",
        settlement_time: "2026-09-03 08:05:00",
      }),
    );
    statusApiState.transaction_time = "2026-09-03T10:00:00+07:00";
    statusApiState.settlement_time = "2026-09-03T10:05:00+07:00";
    const payload = await provider.verifyWebhook(body, "");
    expect(payload.providerSuccessAt).toEqual(
      new Date("2026-09-03T10:05:00+07:00"),
    );
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  test("keeps a settled card time unresolved because transaction_time is initiation time", async () => {
    const body = JSON.stringify(
      notificationBody({
        transaction_status: "settlement",
        payment_type: "credit_card",
        transaction_time: "2026-09-03 08:00:00",
        settlement_time: "2026-09-03 08:05:00",
      }),
    );
    statusApiState.transaction_time = "2026-09-03T10:00:00+07:00";
    statusApiState.settlement_time = "2026-09-03T10:05:00+07:00";
    const payload = await provider.verifyWebhook(body, "");
    expect(payload.providerSuccessAt).toBeUndefined();
    expect(payload.providerSuccessTimeStatus).toBe("unavailable");
  });

  test("does not infer non-card settlement time when provider payment type is missing", async () => {
    const body = JSON.stringify(notificationBody());
    statusApiState.payment_type = undefined;
    statusApiState.settlement_time = "2026-09-03T10:05:00+07:00";
    const payload = await provider.verifyWebhook(body, "");
    expect(payload.status).toBe("SETTLED");
    expect(payload.providerSuccessAt).toBeUndefined();
    expect(payload.providerSuccessTimeStatus).toBe("unavailable");
  });

  test("delayed success notification returns authenticated refund state", async () => {
    const body = JSON.stringify(
      notificationBody({ transaction_status: "settlement" }),
    );
    statusApiState.transaction_status = "refund";
    statusApiState.payment_type = "credit_card";
    statusApiState.transaction_time = "2026-09-03T10:00:00+07:00";
    const payload = await provider.verifyWebhook(body, "");
    expect(payload).toMatchObject({
      status: "REFUNDED",
      providerSuccessTimeStatus: "unavailable",
    });
    expect(payload.providerSuccessAt).toBeUndefined();
  });

  test("marks a refunded non-card payment unresolved when status omits settlement time", async () => {
    const body = JSON.stringify(
      notificationBody({ transaction_status: "refund", payment_type: "qris" }),
    );
    statusApiState.transaction_status = "refund";
    statusApiState.payment_type = "qris";
    statusApiState.settlement_time = undefined;
    const payload = await provider.verifyWebhook(body, "");
    expect(payload).toMatchObject({
      status: "REFUNDED",
      providerSuccessTimeStatus: "unavailable",
      amountIdr: 430_000,
      currency: "IDR",
    });
    expect(payload.providerSuccessAt).toBeUndefined();
  });

  test("accepts card capture but leaves its KOL ordering time unresolved", async () => {
    const body = JSON.stringify(
      notificationBody({
        transaction_status: "capture",
        payment_type: "credit_card",
        transaction_time: "2026-09-03 08:00:00",
      }),
    );
    statusApiState.transaction_time = "2026-09-03T10:00:00+07:00";
    const payload = await provider.verifyWebhook(body, "");
    expect(payload.status).toBe("PAID");
    expect(payload.providerSuccessAt).toBeUndefined();
    expect(payload.providerSuccessTimeStatus).toBe("unavailable");
  });

  test("accepts a non-card settlement but leaves its ordering unresolved when settlement_time is missing", async () => {
    const body = JSON.stringify(
      notificationBody({ settlement_time: undefined }),
    );
    statusApiState.settlement_time = undefined;
    const payload = await provider.verifyWebhook(body, "");
    expect(payload.status).toBe("SETTLED");
    expect(payload.providerSuccessAt).toBeUndefined();
    expect(payload.providerSuccessTimeStatus).toBe("unavailable");
  });

  test("does not treat an impossible provider calendar date as KOL success time", async () => {
    const body = JSON.stringify(notificationBody());
    statusApiState.settlement_time = "2026-02-31T10:05:00+07:00";
    const payload = await provider.verifyWebhook(body, "");
    expect(payload.status).toBe("SETTLED");
    expect(payload.providerSuccessAt).toBeUndefined();
    expect(payload.providerSuccessTimeStatus).toBe("unavailable");
  });

  test("does not confirm a success notification while authenticated status is pending", async () => {
    const body = JSON.stringify(notificationBody());
    statusApiState.transaction_status = "pending";
    statusApiState.settlement_time = undefined;
    await expect(provider.verifyWebhook(body, "")).rejects.toThrow(
      "provider has not confirmed a successful payment",
    );
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

  test("rejects a webhook with an invalid amount or currency", async () => {
    const body = JSON.stringify(notificationBody({ gross_amount: "0" }));

    await expect(provider.verifyWebhook(body, "")).rejects.toThrow(
      "Invalid webhook payment amount or currency",
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
    for (const [status, refundKind] of [
      ["refund", "full"],
      ["partial_refund", "partial"],
    ] as const) {
      const body = JSON.stringify(
        notificationBody({
          transaction_status: status,
          refund_amount: status === "refund" ? "430000.00" : "20000.00",
        }),
      );
      const payload = await provider.verifyWebhook(body, "");
      expect(payload).toMatchObject({
        status: "REFUNDED",
        refundKind,
      });
    }
  });

  test("ignores unsigned webhook refund details and returns status-API evidence", async () => {
    const body = notificationBody({
      transaction_status: "refund",
      refund_amount: "50000.00",
      refunds: [
        {
          refund_chargeback_id: 111,
          refund_amount: "50000.00",
          created_at: "2026-10-23T10:00:00+07:00",
        },
      ],
    });
    statusApiState.refunds = [
      {
        refund_chargeback_id: 222,
        refund_amount: "50000.00",
        created_at: "2026-10-23T10:05:00+07:00",
      },
    ];

    const payload = await provider.verifyWebhook(JSON.stringify(body), "");
    expect(payload.refundKind).toBe("full");
    expect(payload.providerRefundIdentity).toMatch(/^[a-f0-9]{64}$/);
    const webhookOnlyIdentity = createHash("sha256")
      .update(
        JSON.stringify([
          {
            identity: "111",
            amountIdr: 50_000,
            createdAt: "2026-10-23T03:00:00.000Z",
          },
        ]),
      )
      .digest("hex");
    expect(payload.providerRefundIdentity).not.toBe(webhookOnlyIdentity);
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
          payment_type: "bank_transfer",
          gross_amount: "350000.00",
          currency: "IDR",
          transaction_time: "2026-09-03T10:00:00+07:00",
          settlement_time: "2026-09-03T10:05:00+07:00",
        }),
      );
    }) as never;

    const status = await resolvingProvider.getPaymentRequestStatus!(
      "550e8400-e29b-41d4-a716-446655440000",
    );
    expect(status).toMatchObject({
      providerReference: "midtrans:user1:starter",
      providerEventId: "txn-1",
      status: "SETTLED",
      failureReason: null,
      receiptUrl: null,
      amountIdr: 350_000,
      currency: "IDR",
      providerSuccessAt: new Date("2026-09-03T10:05:00+07:00"),
      providerSuccessTimeStatus: "verified",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(
      "https://api.sandbox.midtrans.com/v2/550e8400-e29b-41d4-a716-446655440000/status",
    );
  });

  test("uses authenticated refund history to distinguish partial from full on the same transaction", async () => {
    let response: Record<string, unknown> = {
      transaction_status: "partial_refund",
      transaction_id: "txn-refund-same",
      order_id: "pay-refund-same",
      gross_amount: "50000.00",
      refund_amount: "20000.00",
      currency: "IDR",
      refunds: [
        {
          refund_chargeback_id: 11,
          refund_amount: "20000.00",
          created_at: "2026-10-23 10:00:00",
        },
      ],
    };
    globalThis.fetch = mock(() =>
      Promise.resolve(Response.json(response)),
    ) as never;

    const partial = await provider.getPaymentRequestStatus!("pay-refund-same");
    expect(partial).toMatchObject({
      providerEventId: "txn-refund-same",
      status: "REFUNDED",
      refundKind: "partial",
      refundAmountIdr: 20_000,
      currency: "IDR",
    });
    expect(partial.providerRefundIdentity).toMatch(/^[a-f0-9]{64}$/);

    response = {
      ...response,
      transaction_status: "refund",
      refund_amount: "50000.00",
      refunds: [
        ...((response.refunds as Array<Record<string, unknown>>) ?? []),
        {
          refund_chargeback_id: 12,
          refund_amount: "30000.00",
          created_at: "2026-10-23 10:05:00",
        },
      ],
    };
    const full = await provider.getPaymentRequestStatus!("pay-refund-same");
    expect(full).toMatchObject({
      providerEventId: "txn-refund-same",
      status: "REFUNDED",
      refundKind: "full",
      refundAmountIdr: 50_000,
      currency: "IDR",
    });
    expect(full.providerRefundIdentity).toMatch(/^[a-f0-9]{64}$/);
    expect(full.providerRefundIdentity).not.toBe(
      partial.providerRefundIdentity,
    );
  });

  test("filters malformed refund history and accepts safe fallback identities", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        Response.json({
          transaction_status: "refund",
          order_id: "pay-refund-history",
          gross_amount: "50000.00",
          refund_amount: "50000.00",
          currency: "IDR",
          refunds: [
            null,
            { refund_chargeback_id: 1.5, refund_key: "fallback-key" },
            { refund_key: "x".repeat(129) },
            {
              refund_chargeback_id: 12,
              refund_amount: "12.50",
              created_at: "2026-10-23 10:00:00",
            },
            {
              refund_key: "later-key",
              refund_amount: "20.00",
              created_at: "2026-10-23T10:05:00+07:00",
            },
          ],
        }),
      ),
    ) as never;

    const status =
      await provider.getPaymentRequestStatus!("pay-refund-history");
    expect(status.status).toBe("REFUNDED");
    expect(status.providerRefundIdentity).toMatch(/^[a-f0-9]{64}$/);
  });

  test("omits refund identity when the authenticated history is not an array", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        Response.json({
          transaction_status: "refund",
          order_id: "pay-refund-no-history",
          gross_amount: "50000.00",
          currency: "IDR",
          refunds: { refund_key: "not-an-array" },
        }),
      ),
    ) as never;

    const status = await provider.getPaymentRequestStatus!(
      "pay-refund-no-history",
    );
    expect(status.status).toBe("REFUNDED");
    expect(status.providerRefundIdentity).toBeUndefined();
  });

  test("rejects a successful status without a valid IDR amount and currency", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        Response.json({
          transaction_status: "settlement",
          order_id: "pay-bound",
          payment_type: "bank_transfer",
          settlement_time: "2026-09-03T10:05:00+07:00",
        }),
      ),
    ) as never;
    await expect(
      provider.getPaymentRequestStatus!("pay-bound"),
    ).rejects.toThrow("missing a valid IDR amount or currency");
  });

  test("rejects a successful status in a non-IDR currency", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        Response.json({
          transaction_status: "settlement",
          order_id: "pay-bound",
          payment_type: "bank_transfer",
          gross_amount: "350000.00",
          currency: "USD",
          settlement_time: "2026-09-03T10:05:00+07:00",
        }),
      ),
    ) as never;
    await expect(
      provider.getPaymentRequestStatus!("pay-bound"),
    ).rejects.toThrow("missing a valid IDR amount or currency");
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

  test("retries transient TypeError and TimeoutError failures", async () => {
    const originalSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((callback: TimerHandler) => {
      if (typeof callback === "function") callback();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;

    try {
      const typeErrorProvider = createMidtransPaymentProvider(opts);
      globalThis.fetch = mock(() => {
        throw new TypeError("network unavailable");
      }) as never;
      await expect(
        typeErrorProvider.getPaymentRequestStatus!("pay-type-error"),
      ).rejects.toThrow("network unavailable");

      const timeoutError = new Error("request timed out");
      timeoutError.name = "TimeoutError";
      const timeoutProvider = createMidtransPaymentProvider(opts);
      globalThis.fetch = mock(() => {
        throw timeoutError;
      }) as never;
      await expect(
        timeoutProvider.getPaymentRequestStatus!("pay-timeout"),
      ).rejects.toThrow("request timed out");
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
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
