import { describe, expect, test } from "bun:test";
import { getClientIp } from "@cogito-app/api/lib/request-id";

describe("getClientIp", () => {
  test("ignores x-forwarded-for when not trusting proxy", () => {
    const req = new Request("http://x/", {
      headers: { "x-forwarded-for": "6.6.6.6", "x-real-ip": "10.0.0.1" },
    });
    expect(getClientIp(req, false)).toBe("unknown");
  });

  test("uses first x-forwarded-for hop when trusting proxy", () => {
    const req = new Request("http://x/", {
      headers: { "x-forwarded-for": "6.6.6.6, 10.0.0.1" },
    });
    expect(getClientIp(req, true)).toBe("6.6.6.6");
  });

  test("falls back to unknown when no IP headers present", () => {
    const req = new Request("http://x/");
    expect(getClientIp(req, true)).toBe("unknown");
    expect(getClientIp(req, false)).toBe("unknown");
  });

  test("prefers the socket address over spoofable headers when untrusted", () => {
    const req = new Request("http://x/", {
      headers: { "x-forwarded-for": "6.6.6.6", "x-real-ip": "10.0.0.1" },
    });
    const server = { requestIP: () => ({ address: "203.0.113.9" }) };
    expect(getClientIp(req, false, server)).toBe("203.0.113.9");
  });
});
