import { describe, expect, test } from "bun:test";
import { isSameScheduleMinute } from "./booking-reschedule-action";

describe("isSameScheduleMinute", () => {
  test("matches the active schedule at minute precision", () => {
    expect(
      isSameScheduleMinute("2026-08-30T03:15:42.000Z", "2026-08-30", "10:15"),
    ).toBe(true);
  });

  test("allows a genuinely different proposed minute", () => {
    expect(
      isSameScheduleMinute("2026-08-30T03:15:00.000Z", "2026-08-30", "10:16"),
    ).toBe(false);
  });

  test("can compare against an existing pending proposal", () => {
    expect(
      isSameScheduleMinute(
        new Date("2026-08-30T03:15:00.000Z"),
        "2026-08-30",
        "10:15",
      ),
    ).toBe(true);
  });
});
