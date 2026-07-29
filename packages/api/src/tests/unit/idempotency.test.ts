import { describe, it, expect } from "bun:test";
import { IdempotencyStore } from "../../lib/idempotency";

describe("IdempotencyStore getOrSet", () => {
  it("executes fn only once for concurrent calls with same key", async () => {
    const store = new IdempotencyStore();
    let callCount = 0;

    const fn = async () => {
      callCount++;
      await new Promise((r) => setTimeout(r, 10));
      return { value: callCount };
    };

    const [r1, r2, r3] = await Promise.all([
      store.getOrSet("test-key", fn),
      store.getOrSet("test-key", fn),
      store.getOrSet("test-key", fn),
    ]);

    expect(callCount).toBe(1);
    expect((r1 as { value: number }).value).toBe(1);
    expect((r2 as { value: number }).value).toBe(1);
    expect((r3 as { value: number }).value).toBe(1);
  });

  it("returns cached result for subsequent calls", async () => {
    const store = new IdempotencyStore();
    let callCount = 0;

    const fn = async () => {
      callCount++;
      return { data: "result" };
    };

    const r1 = await store.getOrSet("key1", fn);
    const r2 = await store.getOrSet("key1", fn);

    expect(callCount).toBe(1);
    expect(r1).toEqual({ data: "result" });
    expect(r2).toEqual({ data: "result" });
  });
});