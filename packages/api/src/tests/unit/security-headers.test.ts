import { describe, test, expect, mock } from "bun:test";

mock.module("@cogito-app/env/server", () => ({
  env: {
    CORS_ORIGIN: "https://app.example.com",
  },
}));

const { SECURITY_HEADERS, buildCSP } =
  await import("../../lib/security-headers");

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

  test("has exactly 6 headers", () => {
    expect(Object.keys(SECURITY_HEADERS)).toHaveLength(6);
  });
});

describe("buildCSP", () => {
  test("includes connect-src with provided origin", () => {
    const csp = buildCSP("https://app.example.com");
    expect(csp).toContain("connect-src 'self' https://app.example.com");
  });

  test("includes script-src 'self'", () => {
    const csp = buildCSP("https://app.example.com");
    expect(csp).toContain("script-src 'self'");
  });

  test("includes style-src 'self' 'unsafe-inline'", () => {
    const csp = buildCSP("https://app.example.com");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  });

  test("includes img-src 'self' data: https:", () => {
    const csp = buildCSP("https://app.example.com");
    expect(csp).toContain("img-src 'self' data: https:");
  });

  test("includes frame-ancestors 'none'", () => {
    const csp = buildCSP("https://app.example.com");
    expect(csp).toContain("frame-ancestors 'none'");
  });
});
