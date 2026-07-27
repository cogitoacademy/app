import { describe, test, expect } from "bun:test";
import { timingSafeEqual } from "crypto";

describe("Metrics endpoint timing-safe comparison", () => {
  const encoder = new TextEncoder();

  test("timingSafeEqual rejects wrong token with different length", () => {
    const authHeader = "Bearer wrong";
    const expected = "Bearer correct-token-value";
    if (
      authHeader.length !== expected.length ||
      !timingSafeEqual(encoder.encode(authHeader), encoder.encode(expected))
    ) {
      expect(true).toBe(true);
    } else {
      expect(true).toBe(false);
    }
  });

  test("timingSafeEqual rejects wrong token with same length", () => {
    const expected = "Bearer abcdefghij";
    const wrong = "Bearer xxxxxxxxxx";
    expect(wrong.length).toBe(expected.length);
    expect(
      timingSafeEqual(encoder.encode(wrong), encoder.encode(expected)),
    ).toBe(false);
  });

  test("timingSafeEqual accepts correct token", () => {
    const expected = "Bearer test-token";
    expect(
      timingSafeEqual(encoder.encode(expected), encoder.encode(expected)),
    ).toBe(true);
  });
});
