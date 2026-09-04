import { describe, expect, test } from "bun:test";

import { snapTimeToQuarter, stepQuarterHour } from "./minute-time-input";

describe("quarter-hour time controls", () => {
  test("moves aligned times by exactly 15 minutes", () => {
    expect(stepQuarterHour("09:00", 1)).toBe("09:15");
    expect(stepQuarterHour("09:15", -1)).toBe("09:00");
  });

  test("moves an unaligned time to the next or previous quarter", () => {
    expect(stepQuarterHour("09:07", 1)).toBe("09:15");
    expect(stepQuarterHour("09:07", -1)).toBe("09:00");
  });

  test("snaps a custom starting value to the nearest quarter", () => {
    expect(snapTimeToQuarter("09:07")).toBe("09:00");
    expect(snapTimeToQuarter("09:08")).toBe("09:15");
  });
});
