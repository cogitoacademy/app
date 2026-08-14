import { describe, expect, test } from "bun:test";
import { stubCheckoutEnabled } from "./payments";

describe("stubCheckoutEnabled", () => {
  test("false when not all three conditions hold", () => {
    expect(stubCheckoutEnabled("development", "stub", false)).toBe(false);
  });
  test("true only when all three conditions hold", () => {
    expect(stubCheckoutEnabled("development", "stub", true)).toBe(true);
    expect(stubCheckoutEnabled("production", "stub", true)).toBe(false);
    expect(stubCheckoutEnabled("development", "xendit", true)).toBe(false);
  });
});
