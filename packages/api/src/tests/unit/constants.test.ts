import { describe, test, expect } from "bun:test";
import { INVITE_EXPIRY_DAYS } from "../../shared/constants";

describe("Shared Constants", () => {
  test("INVITE_EXPIRY_DAYS is 7", () => {
    expect(INVITE_EXPIRY_DAYS).toBe(7);
  });
});
