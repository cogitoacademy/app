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

describe("invite and booking rate limit paths", () => {
  test("rate limiters target invite.verify and booking procedures", () => {
    const routes = readFileSync(
      new URL("./routes.ts", import.meta.url),
      "utf-8",
    );
    expect(routes).toContain('path.startsWith("/rpc/invite.verify")');
    expect(routes).toContain('path.startsWith("/rpc/booking.")');
    expect(routes).toContain('keyPrefix: "invite"');
    expect(routes).toContain('keyPrefix: "booking"');
  });
});
