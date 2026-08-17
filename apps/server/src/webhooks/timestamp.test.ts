import { describe, test, expect } from "bun:test";
import { validateWebhookTimestamp } from "./payments";

describe("validateWebhookTimestamp", () => {
  test("throws when timestamp header is missing", () => {
    const request = new Request(
      "https://example.com/webhooks/payments/xendit",
      {
        method: "POST",
      },
    );
    expect(() => validateWebhookTimestamp(request, "stub")).toThrow(
      "Webhook timestamp header is required",
    );
  });

  test("throws when timestamp is invalid", () => {
    const request = new Request(
      "https://example.com/webhooks/payments/xendit",
      {
        method: "POST",
        headers: { "x-timestamp": "not-a-date" },
      },
    );
    expect(() => validateWebhookTimestamp(request, "stub")).toThrow(
      "Invalid webhook timestamp",
    );
  });

  test("throws when timestamp is stale", () => {
    const staleTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const request = new Request(
      "https://example.com/webhooks/payments/xendit",
      {
        method: "POST",
        headers: { "x-timestamp": staleTime },
      },
    );
    expect(() => validateWebhookTimestamp(request, "stub")).toThrow(
      "Webhook timestamp too old or too far in the future",
    );
  });

  test("accepts a valid recent timestamp", () => {
    const recentTime = new Date().toISOString();
    const request = new Request(
      "https://example.com/webhooks/payments/xendit",
      {
        method: "POST",
        headers: { "x-timestamp": recentTime },
      },
    );
    expect(() => validateWebhookTimestamp(request, "stub")).not.toThrow();
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
    expect(() => validateWebhookTimestamp(request, "stub")).not.toThrow();
  });

  test("L4: skips timestamp validation for xendit (no documented timestamp header)", () => {
    const request = new Request(
      "https://example.com/webhooks/payments/xendit",
      {
        method: "POST",
      },
    );
    expect(() => validateWebhookTimestamp(request, "xendit")).not.toThrow();
  });
});
