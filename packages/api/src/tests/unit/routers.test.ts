import { describe, expect, test } from "bun:test";
import { createRouterClient } from "@orpc/server";
import { appRouter } from "../../routers";

describe("appRouter", () => {
  test("healthCheck returns OK", async () => {
    const client = createRouterClient(appRouter, { context: {} as any });
    await expect(client.healthCheck()).resolves.toBe("OK");
  });
});
