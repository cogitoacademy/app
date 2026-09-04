import { describe, test, expect } from "bun:test";
import {
  mapXenditStatus,
  createXenditPaymentProvider,
} from "../../modules/payment/xendit-payment.provider";

function createProvider(opts?: {
  secretKey?: string;
  defaultPaymentMethod?: string;
}) {
  return createXenditPaymentProvider({
    secretKey: opts?.secretKey ?? "test-secret-key",
    webhookToken: "test-webhook-token",
    mode: "test",
    successRedirectUrl: "https://example.com/success",
    failureRedirectUrl: "https://example.com/failure",
    defaultPaymentMethod: opts?.defaultPaymentMethod as any,
  });
}

describe("mapXenditStatus (2024-11-11)", () => {
  test("maps SUCCEEDED to PAID", () => {
    expect(mapXenditStatus("SUCCEEDED")).toBe("PAID");
  });

  test("maps REQUIRES_ACTION to PENDING", () => {
    expect(mapXenditStatus("REQUIRES_ACTION")).toBe("PENDING");
  });

  test("maps AUTHORIZED to PENDING", () => {
    expect(mapXenditStatus("AUTHORIZED")).toBe("PENDING");
  });

  test("maps CANCELED to FAILED", () => {
    expect(mapXenditStatus("CANCELED")).toBe("FAILED");
  });

  test("maps PENDING to PENDING (legacy event)", () => {
    expect(mapXenditStatus("PENDING")).toBe("PENDING");
  });

  test("maps PAID to PAID (legacy event)", () => {
    expect(mapXenditStatus("PAID")).toBe("PAID");
  });

  test("maps SETTLED to SETTLED", () => {
    expect(mapXenditStatus("SETTLED")).toBe("SETTLED");
  });

  test("maps FAILED to FAILED", () => {
    expect(mapXenditStatus("FAILED")).toBe("FAILED");
  });

  test("maps EXPIRED to EXPIRED", () => {
    expect(mapXenditStatus("EXPIRED")).toBe("EXPIRED");
  });

  test("maps REFUNDED to REFUNDED (R5)", () => {
    expect(mapXenditStatus("REFUNDED")).toBe("REFUNDED");
  });

  test("throws for unknown status", () => {
    expect(() => mapXenditStatus("UNKNOWN")).toThrow("Unknown payment status");
  });
});

describe("XenditPaymentProvider verifyWebhook (2024-11-11)", () => {
  test("rejects empty token", async () => {
    const provider = createProvider();
    await expect(
      provider.verifyWebhook(
        JSON.stringify({ data: { status: "SUCCEEDED" } }),
        "",
      ),
    ).rejects.toThrow("Invalid webhook signature");
  });

  test("rejects mismatched token", async () => {
    const provider = createProvider();
    await expect(
      provider.verifyWebhook(
        JSON.stringify({ data: { status: "SUCCEEDED" } }),
        "wrong-token",
      ),
    ).rejects.toThrow("Invalid webhook signature");
  });

  test("rejects malformed JSON", async () => {
    const provider = createProvider();
    await expect(
      provider.verifyWebhook("not json", "test-webhook-token"),
    ).rejects.toThrow("Invalid webhook payload");
  });

  test("parses a payment.succeeded webhook (data.payment_id)", async () => {
    const provider = createProvider();
    const payload = JSON.stringify({
      event: "payment.succeeded",
      data: {
        id: "py_123",
        payment_id: "py_123",
        payment_request_id: "pr_456",
        reference_id: "ref_456",
        status: "SUCCEEDED",
        failure_code: null,
      },
    });

    const result = await provider.verifyWebhook(payload, "test-webhook-token");

    expect(result.providerReference).toBe("ref_456");
    expect(result.providerEventId).toBe("py_123");
    expect(result.status).toBe("PAID");
    expect(result.failureReason).toBeNull();
  });

  test("parses a payment_request.paid webhook (data.payment_request_id)", async () => {
    const provider = createProvider();
    const payload = JSON.stringify({
      event: "payment_request.paid",
      data: {
        id: "pr_456",
        payment_request_id: "pr_456",
        reference_id: "ref_789",
        status: "SUCCEEDED",
        failure_code: null,
      },
    });

    const result = await provider.verifyWebhook(payload, "test-webhook-token");

    expect(result.providerReference).toBe("ref_789");
    expect(result.providerEventId).toBe("pr_456");
    expect(result.status).toBe("PAID");
  });

  test("parses a failed webhook with failure_code", async () => {
    const provider = createProvider();
    const payload = JSON.stringify({
      event: "payment.failed",
      data: {
        id: "py_789",
        payment_id: "py_789",
        reference_id: "ref_000",
        status: "FAILED",
        failure_code: "PAYMENT_DENIED",
      },
    });

    const result = await provider.verifyWebhook(payload, "test-webhook-token");

    expect(result.providerReference).toBe("ref_000");
    expect(result.status).toBe("FAILED");
    expect(result.failureReason).toBe("PAYMENT_DENIED");
  });

  test("uses body-level payment_id when data is absent", async () => {
    const provider = createProvider();
    const payload = JSON.stringify({
      event: "payment.succeeded",
      payment_id: "py_body",
      reference_id: "ref_body",
      status: "SUCCEEDED",
    });

    const result = await provider.verifyWebhook(payload, "test-webhook-token");

    expect(result.providerReference).toBe("ref_body");
    expect(result.providerEventId).toBe("py_body");
    expect(result.status).toBe("PAID");
  });
});
