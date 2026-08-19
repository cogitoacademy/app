import { describe, expect, test } from "bun:test";
import { seedAllowed, seedAdminPassword } from "./seed";

describe("seed guards", () => {
  test("seedAllowed is false in production without explicit flag", () => {
    expect(seedAllowed("production", undefined)).toBe(false);
    expect(seedAllowed("production", "true")).toBe(true);
    expect(seedAllowed("development", undefined)).toBe(true);
  });

  test("seedAllowed treats staging like production", () => {
    expect(seedAllowed("staging", undefined)).toBe(false);
    expect(seedAllowed("staging", "true")).toBe(true);
  });

  test("seedAdminPassword rejects short or missing passwords", () => {
    expect(seedAdminPassword(undefined)).toBeNull();
    expect(seedAdminPassword("short")).toBeNull();
    expect(seedAdminPassword("a-strong-12-char-pw")).toBe(
      "a-strong-12-char-pw",
    );
  });
});
