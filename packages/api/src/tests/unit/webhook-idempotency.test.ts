import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { IdempotencyStore } from "../../lib/idempotency";

describe("webhook-idempotency", () => {
  let store: IdempotencyStore;

  beforeEach(() => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    store = new IdempotencyStore({
      maxAgeMs: 24 * 60 * 60 * 1000,
      cleanupIntervalMs: 60 * 60 * 1000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("isProcessed", () => {
    it("returns false for unprocessed webhooks", () => {
      expect(store.isProcessed("evt_123")).toBe(false);
    });

    it("returns true after marking a webhook as processed", () => {
      store.markProcessed("evt_123", { ok: true });
      expect(store.isProcessed("evt_123")).toBe(true);
    });

    it("returns false for different keys", () => {
      store.markProcessed("evt_123", { ok: true });
      expect(store.isProcessed("evt_456")).toBe(false);
    });
  });

  describe("markProcessed / getResult", () => {
    it("stores and retrieves a result", () => {
      const result = { ok: true, providerReference: "ref_1" };
      store.markProcessed("evt_123", result);
      expect(store.getResult("evt_123")).toEqual(result);
    });

    it("returns undefined for unknown keys", () => {
      expect(store.getResult("evt_unknown")).toBeUndefined();
    });

    it("overwrites previous results for the same key", () => {
      store.markProcessed("evt_123", { ok: true });
      store.markProcessed("evt_123", { ok: false });
      expect(store.getResult("evt_123")).toEqual({ ok: false });
    });
  });

  describe("cleanup", () => {
    it("removes entries older than 24 hours", () => {
      store.markProcessed("evt_old", { ok: true });

      vi.advanceTimersByTime(25 * 60 * 60 * 1000);

      store.markProcessed("evt_new", { ok: true });

      expect(store.isProcessed("evt_old")).toBe(false);
      expect(store.isProcessed("evt_new")).toBe(true);
    });

    it("keeps entries within 24 hours", () => {
      store.markProcessed("evt_recent", { ok: true });

      vi.advanceTimersByTime(12 * 60 * 60 * 1000);

      store.markProcessed("evt_trigger_cleanup", { ok: true });

      expect(store.isProcessed("evt_recent")).toBe(true);
    });
  });
});
