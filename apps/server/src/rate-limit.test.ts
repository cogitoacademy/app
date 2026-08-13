import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("payment rate limit path", () => {
  test("rate limiter targets payment.createPurchase", () => {
    const routes = readFileSync(
      new URL("./routes.ts", import.meta.url),
      "utf-8",
    );
    expect(routes).toContain('path === "/rpc/payment.createPurchase"');
    expect(routes).not.toContain('path === "/rpc/payment.createIntent"');
  });
});
