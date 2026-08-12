import { describe, expect, test } from "bun:test";

import { ipAllowed } from "./payments";

describe("ipAllowed", () => {
  test("allows all IPs when allowlist is empty", () => {
    const request = new Request("https://example.com/webhook", {
      headers: { "x-forwarded-for": "203.0.113.9" },
    });
    expect(ipAllowed(request, [])).toBe(true);
  });

  test("allows a listed IP via x-forwarded-for", () => {
    const request = new Request("https://example.com/webhook", {
      headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
    });
    expect(ipAllowed(request, ["203.0.113.9"])).toBe(true);
  });

  test("allows a listed IP via x-real-ip when x-forwarded-for is absent", () => {
    const request = new Request("https://example.com/webhook", {
      headers: { "x-real-ip": "198.51.100.7" },
    });
    expect(ipAllowed(request, ["198.51.100.7"])).toBe(true);
  });

  test("rejects an unlisted IP", () => {
    const request = new Request("https://example.com/webhook", {
      headers: { "x-forwarded-for": "192.0.2.55" },
    });
    expect(ipAllowed(request, ["203.0.113.9"])).toBe(false);
  });

  test("rejects when no IP headers are present", () => {
    const request = new Request("https://example.com/webhook");
    expect(ipAllowed(request, ["203.0.113.9"])).toBe(false);
  });
});
