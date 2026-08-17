import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { matchRateLimitPath } from "./rate-limit-paths";

describe("matchRateLimitPath maps real slash-key RPC URLs", () => {
  test("payment.createPurchase matches /rpc/payment/createPurchase", () => {
    expect(matchRateLimitPath("/rpc/payment/createPurchase")).toBe("payment");
  });

  test("dotted /rpc/payment.createPurchase does not match (regression R1)", () => {
    expect(matchRateLimitPath("/rpc/payment.createPurchase")).toBeNull();
  });

  test("invite verify matches /rpc/invite/verify", () => {
    expect(matchRateLimitPath("/rpc/invite/verify")).toBe("invite");
  });

  test("booking procedures match /rpc/booking/*", () => {
    expect(matchRateLimitPath("/rpc/booking/listMine")).toBe("booking");
    expect(matchRateLimitPath("/rpc/booking/create")).toBe("booking");
  });

  test("student search matches /rpc/auth/searchStudents", () => {
    expect(matchRateLimitPath("/rpc/auth/searchStudents")).toBe("search");
    expect(matchRateLimitPath("/rpc/auth/searchStudents?q=x")).toBe("search");
  });

  test("other paths are not rate limited", () => {
    expect(matchRateLimitPath("/rpc/wallet/getBalance")).toBeNull();
    expect(matchRateLimitPath("/health")).toBeNull();
  });
});

describe("routes.ts uses the slash-key patterns", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf-8");

  test("rate-limit hook delegates to matchRateLimitPath", () => {
    expect(routes).toContain("matchRateLimitPath");
    expect(routes).not.toContain('path === "/rpc/payment.createPurchase"');
    expect(routes).not.toContain('path.startsWith("/rpc/invite.verify")');
    expect(routes).not.toContain('path.startsWith("/rpc/booking.")');
    expect(routes).not.toContain(
      'path.startsWith("/rpc/auth.students/search")',
    );
  });
});
