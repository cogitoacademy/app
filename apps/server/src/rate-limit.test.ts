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
      new URL("./routes/rate-limits.ts", import.meta.url),
      "utf-8",
    );
    expect(paths).toContain('"/rpc/invite/verify"');
    expect(paths).toContain('"/rpc/booking/"');
    expect(routes).toContain("invite: { windowMs: 60_000, maxRequests: 10 }");
    expect(routes).toContain("booking: { windowMs: 60_000, maxRequests: 30 }");
  });
});

describe("L3: email-OTP verify is throttled by the app-level auth limiter (defense-in-depth)", () => {
  test("email-otp verify-email path is matched by the auth limiter", () => {
    const paths = readFileSync(
      new URL("./rate-limit-paths.ts", import.meta.url),
      "utf-8",
    );
    const routes = readFileSync(
      new URL("./routes/rate-limits.ts", import.meta.url),
      "utf-8",
    );

    // /api/auth/* must be matched by the app-level auth limiter (10/min/IP,
    // Redis-backed) — the plan's L3 acceptance criterion. The matcher uses
    // segment-boundary prefixes (S4) so exact better-auth endpoints without
    // trailing slashes are also covered.
    expect(paths).toContain('"/api/auth/email-otp"');
    expect(paths).toContain('"/api/auth/request-password-reset"');
    expect(paths).toContain('"/api/auth/reset-password"');
    expect(paths).toContain("urlPath === p || urlPath.startsWith(`${p}/`)");

    // routes/rate-limits.ts must apply the auth limiter to matched auth paths.
    expect(routes).toContain('limiters.get("auth")');
    expect(routes).toContain("matchAuthPath(path)");
  });
});
