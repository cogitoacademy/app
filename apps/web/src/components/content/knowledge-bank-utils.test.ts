import { describe, expect, test } from "bun:test";
import { getCategoryLabel } from "./knowledge-bank-utils";
describe("Knowledge Bank category labels", () => {
  test("preserves category spelling, separators and case", () => {
    for (const category of [
      "position-paper",
      "My Resource CATEGORY",
      "SMA",
      "other",
    ]) {
      expect(getCategoryLabel(category)).toBe(category);
    }
  });
});
