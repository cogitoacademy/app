import { describe, test, expect } from "bun:test";
import { SECURITY_HEADERS } from "../../lib/security-headers";

describe("SECURITY_HEADERS", () => {
  test("contains X-Content-Type-Options", () => {
    expect(SECURITY_HEADERS["X-Content-Type-Options"]).toBe("nosniff");
  });

  test("contains X-Frame-Options", () => {
    expect(SECURITY_HEADERS["X-Frame-Options"]).toBe("DENY");
  });

  test("contains X-XSS-Protection", () => {
    expect(SECURITY_HEADERS["X-XSS-Protection"]).toBe("0");
  });

  test("contains Referrer-Policy", () => {
    expect(SECURITY_HEADERS["Referrer-Policy"]).toBe(
      "strict-origin-when-cross-origin",
    );
  });

  test("contains Permissions-Policy", () => {
    expect(SECURITY_HEADERS["Permissions-Policy"]).toBe(
      "camera=(), microphone=(), geolocation=()",
    );
  });

  test("contains Content-Security-Policy", () => {
    expect(SECURITY_HEADERS["Content-Security-Policy"]).toBe(
      "default-src 'self'; frame-ancestors 'none'",
    );
  });

  test("has exactly 6 headers", () => {
    expect(Object.keys(SECURITY_HEADERS)).toHaveLength(6);
  });
});
