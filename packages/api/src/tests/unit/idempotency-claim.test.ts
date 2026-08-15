import { describe, expect, test } from "bun:test";
import { IdempotencyStore } from "../../lib/idempotency";

describe("IdempotencyStore.claim", () => {
  test("only the first caller wins; release allows re-claim", async () => {
    const store = new IdempotencyStore({ prefix: "test:idem" });
    const first = await store.claim("evt-1");
    const second = await store.claim("evt-1");
    expect(first).toBe(true);
    expect(second).toBe(false);
    await store.release("evt-1");
    expect(await store.claim("evt-1")).toBe(true);
  });

  test("claim + markProcessed round-trips with an in-memory redis", async () => {
    const { InMemoryRedis } = await import("../../lib/redis");
    const store = new IdempotencyStore({
      prefix: "test:idem",
      redis: new InMemoryRedis(),
    });
    expect(await store.claim("evt-2")).toBe(true);
    expect(await store.claim("evt-2")).toBe(false);
    await store.markProcessed("evt-2", { ok: true });
    expect(await store.isProcessed("evt-2")).toBe(true);
    await store.release("evt-2");
    expect(await store.claim("evt-2")).toBe(true);
  });
});
