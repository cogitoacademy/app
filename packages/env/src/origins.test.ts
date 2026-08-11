import { describe, expect, test } from "bun:test";

import { getAuthTrustedOrigins, isAllowedFrontendOrigin } from "./origins";

describe("getAuthTrustedOrigins", () => {
  test("keeps production restricted to the configured origin", () => {
    expect(
      getAuthTrustedOrigins("https://app.cogitoacademy.id", "production"),
    ).toEqual(["https://app.cogitoacademy.id"]);
  });

  test("adds loopback and private network patterns in development", () => {
    const origins = getAuthTrustedOrigins(
      "http://localhost:3000",
      "development",
    );

    expect(origins).toContain("http://127.0.0.1:3000");
    expect(origins).toContain("http://10.*.*.*:3000");
    expect(origins).toContain("http://172.16.*.*:3000");
    expect(origins).toContain("http://172.31.*.*:3000");
    expect(origins).toContain("http://192.168.*.*:3000");
  });
});

describe("isAllowedFrontendOrigin", () => {
  const configuredOrigin = "http://localhost:3000";

  test.each([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://10.0.0.2:3000",
    "http://172.16.4.5:3000",
    "http://172.31.255.254:3000",
    "http://192.168.1.78:3000",
  ])("allows development origin %s", (origin) => {
    expect(
      isAllowedFrontendOrigin(origin, configuredOrigin, "development"),
    ).toBe(true);
  });

  test.each([
    "http://172.15.0.1:3000",
    "http://172.32.0.1:3000",
    "http://192.168.1.78:5173",
    "https://192.168.1.78:3000",
    "https://example.com",
    "not-a-url",
  ])("rejects untrusted development origin %s", (origin) => {
    expect(
      isAllowedFrontendOrigin(origin, configuredOrigin, "development"),
    ).toBe(false);
  });

  test("does not allow development origins in production", () => {
    expect(
      isAllowedFrontendOrigin(
        "http://127.0.0.1:3000",
        "https://app.cogitoacademy.id",
        "production",
      ),
    ).toBe(false);
  });
});
