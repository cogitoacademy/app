import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("payment rate limit path", () => {
  test("rate limiter targets payment.createPurchase via slash key", () => {
    const paths = readFileSync(
      new URL("./rate-limit-paths.ts", import.meta.url),
      "utf-8",
    );
    expect(paths).toContain('"/rpc/payment/createPurchase"');
    expect(paths).not.toContain('"/rpc/payment.createIntent"');
  });
});

describe("invite and booking rate limit paths", () => {
  test("rate limiters target invite.verify and booking procedures", () => {
    const paths = readFileSync(
      new URL("./rate-limit-paths.ts", import.meta.url),
      "utf-8",
    );
    const routes = readFileSync(
      new URL("./routes.ts", import.meta.url),
      "utf-8",
    );
    expect(paths).toContain('"/rpc/invite/verify"');
    expect(paths).toContain('"/rpc/booking/"');
    expect(routes).toContain('keyPrefix: "invite"');
    expect(routes).toContain('keyPrefix: "booking"');
  });
});
