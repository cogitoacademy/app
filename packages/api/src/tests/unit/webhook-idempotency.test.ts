import { describe, test, expect, beforeEach } from "bun:test";
import {
  IdempotencyStore,
  generateIdempotencyKey,
} from "../../lib/idempotency";

describe("webhook-idempotency", () => {
  let store: IdempotencyStore;

  beforeEach(() => {
    store = new IdempotencyStore({
      maxAgeMs: 24 * 60 * 60 * 1000,
      cleanupIntervalMs: 0,
    });
  });

  describe("isProcessed", () => {
    test("returns false for unprocessed webhooks", () => {
      expect(store.isProcessed("evt_123")).toBe(false);
    });

    test("returns true after marking a webhook as processed", () => {
      store.markProcessed("evt_123", { ok: true });
      expect(store.isProcessed("evt_123")).toBe(true);
    });

    test("returns false for different keys", () => {
      store.markProcessed("evt_123", { ok: true });
      expect(store.isProcessed("evt_456")).toBe(false);
    });
  });

  describe("markProcessed / getResult", () => {
    test("stores and retrieves a result", () => {
      const result = { ok: true, providerReference: "ref_1" };
      store.markProcessed("evt_123", result);
      expect(store.getResult("evt_123")).toEqual(result);
    });

    test("returns undefined for unknown keys", () => {
      expect(store.getResult("evt_unknown")).toBeUndefined();
    });

    test("overwrites previous results for the same key", () => {
      store.markProcessed("evt_123", { ok: true });
      store.markProcessed("evt_123", { ok: false });
      expect(store.getResult("evt_123")).toEqual({ ok: false });
    });
  });

  describe("cleanup", () => {
    test("removes entries older than maxAge", () => {
      const shortLived = new IdempotencyStore({
        maxAgeMs: 100,
        cleanupIntervalMs: 0,
      });
      shortLived.markProcessed("evt_old", { ok: true });

      const after = Date.now() + 200;
      const originalNow = Date.now;
      Date.now = () => after;
      try {
        expect(shortLived.isProcessed("evt_old")).toBe(false);
      } finally {
        Date.now = originalNow;
      }
    });

    test("keeps entries within maxAge", () => {
      store.markProcessed("evt_recent", { ok: true });
      expect(store.isProcessed("evt_recent")).toBe(true);
    });
  });

  describe("eviction", () => {
    test("evicts oldest entry when maxEntries is exceeded", () => {
      const smallStore = new IdempotencyStore({ maxEntries: 2 });
      smallStore.markProcessed("key_1", { ok: true });
      smallStore.markProcessed("key_2", { ok: true });
      smallStore.markProcessed("key_3", { ok: true });
      expect(smallStore.isProcessed("key_1")).toBe(false);
      expect(smallStore.isProcessed("key_2")).toBe(true);
      expect(smallStore.isProcessed("key_3")).toBe(true);
    });
  });

  describe("generateIdempotencyKey", () => {
    test("creates key with prefix and single part", () => {
      expect(generateIdempotencyKey("booking", "abc123")).toBe(
        "booking:abc123",
      );
    });

    test("creates key with prefix and multiple parts", () => {
      expect(
        generateIdempotencyKey("payment", "user_1", "booking_2", "hold"),
      ).toBe("payment:user_1:booking_2:hold");
    });

    test("creates key with prefix and no parts", () => {
      expect(generateIdempotencyKey("webhook")).toBe("webhook:");
    });
  });
});
