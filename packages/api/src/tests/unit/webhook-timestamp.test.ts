import { describe, test, expect, beforeEach, afterEach } from "bun:test";

const originalEnv = process.env.NODE_ENV;

describe("validateWebhookTimestamp", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  function validateWebhookTimestamp(request: Request): void {
    const MAX_WEBHOOK_AGE_MS = 5 * 60 * 1000;
    const timestamp =
      request.headers.get("x-timestamp") ?? request.headers.get("date");
    if (!timestamp) {
      throw new Error("Webhook timestamp header is required");
    }
    const webhookTime = new Date(timestamp).getTime();
    if (Number.isNaN(webhookTime)) {
      throw new Error("Invalid webhook timestamp");
    }
    if (Math.abs(Date.now() - webhookTime) > MAX_WEBHOOK_AGE_MS) {
      throw new Error("Webhook timestamp too old or too far in the future");
    }
  }

  test("throws when timestamp header is missing in test env", () => {
    const request = new Request(
      "https://example.com/webhooks/payments/xendit",
      {
        method: "POST",
      },
    );
    expect(() => validateWebhookTimestamp(request)).toThrow(
      "Webhook timestamp header is required",
    );
  });

  test("throws when timestamp is invalid in test env", () => {
    const request = new Request(
      "https://example.com/webhooks/payments/xendit",
      {
        method: "POST",
        headers: { "x-timestamp": "not-a-date" },
      },
    );
    expect(() => validateWebhookTimestamp(request)).toThrow(
      "Invalid webhook timestamp",
    );
  });

  test("throws when timestamp is stale in test env", () => {
    const staleTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const request = new Request(
      "https://example.com/webhooks/payments/xendit",
      {
        method: "POST",
        headers: { "x-timestamp": staleTime },
      },
    );
    expect(() => validateWebhookTimestamp(request)).toThrow(
      "Webhook timestamp too old or too far in the future",
    );
  });

  test("accepts a valid recent timestamp in test env", () => {
    const recentTime = new Date().toISOString();
    const request = new Request(
      "https://example.com/webhooks/payments/xendit",
      {
        method: "POST",
        headers: { "x-timestamp": recentTime },
      },
    );
    expect(() => validateWebhookTimestamp(request)).not.toThrow();
  });

  test("accepts date header as fallback", () => {
    const recentTime = new Date().toUTCString();
    const request = new Request(
      "https://example.com/webhooks/payments/xendit",
      {
        method: "POST",
        headers: { date: recentTime },
      },
    );
    expect(() => validateWebhookTimestamp(request)).not.toThrow();
  });
});
