import { describe, test, expect } from "bun:test";
import { generateRequestId, getClientIp } from "../../lib/request-id";

describe("generateRequestId", () => {
  test("returns string starting with req_", () => {
    const id = generateRequestId();
    expect(id.startsWith("req_")).toBe(true);
  });

  test("produces unique values", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateRequestId());
    }
    expect(ids.size).toBe(100);
  });

  test("contains underscore separator between timestamp and random part", () => {
    const id = generateRequestId();
    const parts = id.split("_");
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(parts[0]).toBe("req");
  });
});

describe("getClientIp", () => {
  const server = { requestIP: () => ({ address: "203.0.113.9" }) };

  test("ignores client-supplied headers when not trusting the proxy", () => {
    const request = new Request("http://localhost", {
      headers: { "x-real-ip": "1.2.3.4", "x-forwarded-for": "5.6.7.8" },
    });
    expect(getClientIp(request, false, server)).toBe("203.0.113.9");
  });

  test("falls back to unknown when no server address is available", () => {
    const request = new Request("http://localhost", {
      headers: { "x-real-ip": "1.2.3.4" },
    });
    expect(getClientIp(request, false)).toBe("unknown");
  });

  test("uses first x-forwarded-for hop when trusting the proxy", () => {
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "9.9.9.9, 8.8.8.8" },
    });
    expect(getClientIp(request, true, server)).toBe("9.9.9.9");
  });
});
