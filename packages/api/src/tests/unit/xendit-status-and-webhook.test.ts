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
    successRedirectUrl: "https://example.com/success",
    failureRedirectUrl: "https://example.com/failure",
    defaultPaymentMethod: opts?.defaultPaymentMethod as any,
  });
}

describe("mapXenditStatus", () => {
  test("maps PENDING to PENDING", () => {
    expect(mapXenditStatus("PENDING")).toBe("PENDING");
  });

  test("maps PAID to PAID", () => {
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

  test("throws for unknown status", () => {
    expect(() => mapXenditStatus("UNKNOWN")).toThrow("Unknown payment status");
  });
});

describe("XenditPaymentProvider verifyWebhook", () => {
  test("rejects empty token", async () => {
    const provider = createProvider();
    await expect(
      provider.verifyWebhook(JSON.stringify({ data: { status: "PAID" } }), ""),
    ).rejects.toThrow("Invalid webhook token");
  });

  test("rejects mismatched token", async () => {
    const provider = createProvider();
    await expect(
      provider.verifyWebhook(
        JSON.stringify({ data: { status: "PAID" } }),
        "wrong-token",
      ),
    ).rejects.toThrow("Invalid webhook token");
  });

  test("rejects malformed JSON", async () => {
    const provider = createProvider();
    await expect(
      provider.verifyWebhook("not json", "test-webhook-token"),
    ).rejects.toThrow("Invalid webhook payload");
  });

  test("verifies valid webhook with data wrapper", async () => {
    const provider = createProvider();
    const payload = JSON.stringify({
      event_id: "evt_123",
      data: {
        id: "pay_123",
        reference_id: "ref_456",
        status: "PAID",
        failure_code: null,
        receipt_url: "https://receipt.example.com",
      },
    });

    const result = await provider.verifyWebhook(payload, "test-webhook-token");

    expect(result.providerReference).toBe("ref_456");
    expect(result.providerEventId).toBe("evt_123");
    expect(result.status).toBe("PAID");
    expect(result.failureReason).toBeNull();
    expect(result.receiptUrl).toBe("https://receipt.example.com");
  });

  test("verifies valid webhook without data wrapper (top-level)", async () => {
    const provider = createProvider();
    const payload = JSON.stringify({
      event_id: "evt_456",
      id: "pay_456",
      reference_id: "ref_789",
      status: "FAILED",
      failure_code: "PAYMENT_DENIED",
      receipt_url: null,
    });

    const result = await provider.verifyWebhook(payload, "test-webhook-token");

    expect(result.providerReference).toBe("ref_789");
    expect(result.providerEventId).toBe("evt_456");
    expect(result.status).toBe("FAILED");
    expect(result.failureReason).toBe("PAYMENT_DENIED");
    expect(result.receiptUrl).toBeNull();
  });

  test("uses id when reference_id is missing", async () => {
    const provider = createProvider();
    const payload = JSON.stringify({
      event_id: "evt_789",
      data: {
        id: "pay_only",
        status: "PENDING",
      },
    });

    const result = await provider.verifyWebhook(payload, "test-webhook-token");

    expect(result.providerReference).toBe("pay_only");
    expect(result.providerEventId).toBe("evt_789");
  });

  test("uses event_id when present, falls back to id", async () => {
    const provider = createProvider();
    const payload = JSON.stringify({
      event_id: "evt_priority",
      id: "pay_fallback",
      data: {
        id: "pay_data",
        status: "EXPIRED",
      },
    });

    const result = await provider.verifyWebhook(payload, "test-webhook-token");

    expect(result.providerEventId).toBe("evt_priority");
  });
});
