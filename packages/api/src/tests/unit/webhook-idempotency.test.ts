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
    test("returns false for unprocessed webhooks", async () => {
      expect(await store.isProcessed("evt_123")).toBe(false);
    });

    test("returns true after marking a webhook as processed", async () => {
      await store.markProcessed("evt_123", { status: "processed" });
      expect(await store.isProcessed("evt_123")).toBe(true);
    });

    test("returns false for different keys", async () => {
      await store.markProcessed("evt_123", { status: "processed" });
      expect(await store.isProcessed("evt_456")).toBe(false);
    });
  });

  describe("markProcessed / getResult", () => {
    test("stores and retrieves a result", async () => {
      const result = { status: "processed", providerReference: "ref_1" };
      await store.markProcessed("evt_123", result);
      expect(await store.getResult("evt_123")).toEqual(result);
    });

    test("returns undefined for unknown keys", async () => {
      expect(await store.getResult("evt_unknown")).toBeUndefined();
    });

    test("overwrites previous results for the same key", async () => {
      await store.markProcessed("evt_123", { status: "processed" });
      await store.markProcessed("evt_123", { status: "failed" });
      expect(await store.getResult("evt_123")).toEqual({ status: "failed" });
    });
  });

  describe("cleanup", () => {
    test("removes entries older than maxAge", async () => {
      const shortLived = new IdempotencyStore({
        maxAgeMs: 100,
        cleanupIntervalMs: 0,
      });
      await shortLived.markProcessed("evt_old", { status: "processed" });

      const after = Date.now() + 200;
      const originalNow = Date.now;
      Date.now = () => after;
      try {
        expect(await shortLived.isProcessed("evt_old")).toBe(false);
      } finally {
        Date.now = originalNow;
      }
    });

    test("keeps entries within maxAge", async () => {
      await store.markProcessed("evt_recent", { status: "processed" });
      expect(await store.isProcessed("evt_recent")).toBe(true);
    });
  });

  describe("eviction", () => {
    test("evicts oldest entry when maxEntries is exceeded", async () => {
      const smallStore = new IdempotencyStore({ maxEntries: 2 });
      await smallStore.markProcessed("key_1", { status: "processed" });
      await smallStore.markProcessed("key_2", { status: "processed" });
      await smallStore.markProcessed("key_3", { status: "processed" });
      expect(await smallStore.isProcessed("key_1")).toBe(false);
      expect(await smallStore.isProcessed("key_2")).toBe(true);
      expect(await smallStore.isProcessed("key_3")).toBe(true);
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
