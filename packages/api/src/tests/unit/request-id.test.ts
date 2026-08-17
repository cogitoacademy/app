import { describe, test, expect } from "bun:test";
import {
  generateRequestId,
  getClientIp,
  isValidUploadKey,
  openApiAccessDenied,
  readBodyWithLimit,
} from "../../lib/request-id";

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

  test("falls back to the server socket address when trusting the proxy and no header exists", () => {
    const request = new Request("http://localhost");
    expect(getClientIp(request, true, server)).toBe("203.0.113.9");
  });

  test("trims whitespace around the first x-forwarded-for hop", () => {
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "  1.2.3.4  , 8.8.8.8" },
    });
    expect(getClientIp(request, true, server)).toBe("1.2.3.4");
  });

  test("falls back to unknown when trusting the proxy with no header and no server", () => {
    const request = new Request("http://localhost");
    expect(getClientIp(request, true)).toBe("unknown");
  });

  test("falls back to unknown when the server has no socket address", () => {
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });
    expect(getClientIp(request, false, { requestIP: () => null })).toBe(
      "unknown",
    );
  });
});

describe("isValidUploadKey", () => {
  test("accepts well-formed keys", () => {
    expect(isValidUploadKey("user-1/uuid-avatar.png")).toBe(true);
    expect(isValidUploadKey("a/b/c.pdf")).toBe(true);
  });

  test("rejects empty, traversal, and absolute keys", () => {
    expect(isValidUploadKey("")).toBe(false);
    expect(isValidUploadKey("../evil.png")).toBe(false);
    expect(isValidUploadKey("a/../../evil.png")).toBe(false);
    expect(isValidUploadKey("/etc/passwd")).toBe(false);
  });
});

describe("readBodyWithLimit", () => {
  test("returns empty body for a bodyless request", async () => {
    const request = new Request("http://localhost");
    expect(await readBodyWithLimit(request, 1000)).toEqual({
      body: "",
      tooLarge: false,
    });
  });

  test("reads a small body within the limit", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      body: "hello world",
    });
    expect(await readBodyWithLimit(request, 1000)).toEqual({
      body: "hello world",
      tooLarge: false,
    });
  });

  test("reads a chunked body across multiple reads", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      body: "abcdef",
    });
    expect(await readBodyWithLimit(request, 1000)).toEqual({
      body: "abcdef",
      tooLarge: false,
    });
  });

  test("returns tooLarge when the body exceeds the limit", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      body: "a".repeat(2048),
    });
    expect(await readBodyWithLimit(request, 1000)).toEqual({
      body: "",
      tooLarge: true,
    });
  });
});

describe("openApiAccessDenied", () => {
  test("returns 404 in production regardless of session", () => {
    const response = openApiAccessDenied("production", true);
    expect(response).not.toBeNull();
    expect(response!.status).toBe(404);
  });

  test("returns 401 when there is no session outside production", () => {
    const response = openApiAccessDenied("development", false);
    expect(response).not.toBeNull();
    expect(response!.status).toBe(401);
  });

  test("returns null when there is a session outside production", () => {
    expect(openApiAccessDenied("development", true)).toBeNull();
  });
});
