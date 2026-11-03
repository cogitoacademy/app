import { describe, expect, test } from "bun:test";
import { funnelShare, hasNoPublishedTutor } from "./admin-analytics-utils";

describe("funnelShare", () => {
  test("returns the percentage of the registered base", () => {
    expect(funnelShare(25, 200)).toBe(12.5);
    expect(funnelShare(200, 200)).toBe(100);
  });

  test("returns null instead of dividing by zero", () => {
    expect(funnelShare(0, 0)).toBeNull();
    expect(funnelShare(10, 0)).toBeNull();
    expect(funnelShare(10, -1)).toBeNull();
    expect(funnelShare(10, Number.NaN)).toBeNull();
  });
});

describe("hasNoPublishedTutor", () => {
  test("flags demand without published tutor supply", () => {
    expect(hasNoPublishedTutor(3, 0)).toBe(true);
  });

  test("does not flag rows with supply or without demand", () => {
    expect(hasNoPublishedTutor(3, 2)).toBe(false);
    expect(hasNoPublishedTutor(0, 0)).toBe(false);
  });
});
