import { describe, expect, test } from "bun:test";
import {
  formatDateValue,
  formatTimeValue,
  toSessionStart,
} from "./booking-session-time";

const WIB = "Asia/Jakarta";

describe("formatDateValue", () => {
  test("formats a WIB instant as YYYY-MM-DD in the booking timezone", () => {
    // 2026-09-08 11:00 WIB = 04:00 UTC.
    expect(formatDateValue("2026-09-08T04:00:00.000Z", WIB)).toBe("2026-09-08");
  });

  test("keeps the WIB calendar day for a near-midnight slot", () => {
    // 2026-09-08 00:30 WIB = 2026-09-07T17:30:00Z — the UTC day differs.
    expect(formatDateValue("2026-09-07T17:30:00.000Z", WIB)).toBe("2026-09-08");
  });

  test("accepts a Date object", () => {
    expect(formatDateValue(new Date("2026-09-08T04:00:00.000Z"), WIB)).toBe(
      "2026-09-08",
    );
  });
});

describe("formatTimeValue", () => {
  test("formats a WIB instant as HH:MM in the booking timezone", () => {
    expect(formatTimeValue("2026-09-08T04:00:00.000Z", WIB)).toBe("11:00");
  });

  test("renders midnight as 00:00 (never 24:00)", () => {
    expect(formatTimeValue("2026-09-08T00:00:00+07:00", WIB)).toBe("00:00");
  });

  test("renders 23:30 as 23:30", () => {
    expect(formatTimeValue("2026-09-08T23:30:00+07:00", WIB)).toBe("23:30");
  });
});

describe("toSessionStart", () => {
  test("builds the exact UTC instant for a WIB wall-clock pick", () => {
    // User picks date 8 / time 11:00 WIB → 2026-09-08T04:00:00.000Z.
    expect(toSessionStart("2026-09-08", "11:00", WIB).toISOString()).toBe(
      "2026-09-08T04:00:00.000Z",
    );
  });

  test("round-trips a slot's own start time without drift", () => {
    const slot = new Date("2026-09-08T04:00:00.000Z");
    const time = formatTimeValue(slot, WIB);
    const built = toSessionStart(slot, time, WIB);
    expect(built.toISOString()).toBe("2026-09-08T04:00:00.000Z");
  });

  test("round-trips a near-midnight slot without off-by-one-day drift", () => {
    // Slot at 2026-09-08 00:30 WIB = 2026-09-07T17:30:00Z.
    const slot = new Date("2026-09-07T17:30:00.000Z");
    const time = formatTimeValue(slot, WIB);
    expect(time).toBe("00:30");
    const built = toSessionStart(slot, time, WIB);
    expect(built.toISOString()).toBe("2026-09-07T17:30:00.000Z");
    // Displaying the built instant in WIB must show date 8 / 00:30.
    expect(formatDateValue(built, WIB)).toBe("2026-09-08");
    expect(formatTimeValue(built, WIB)).toBe("00:30");
  });

  test("round-trips a late-evening slot without drift", () => {
    const slot = new Date("2026-09-08T23:30:00+07:00");
    const time = formatTimeValue(slot, WIB);
    expect(time).toBe("23:30");
    const built = toSessionStart(slot, time, WIB);
    expect(built.toISOString()).toBe("2026-09-08T16:30:00.000Z");
  });

  test("derives the offset from the timezone instead of hardcoding +07:00", () => {
    // A DST timezone must resolve to its own offset at the target date.
    const ny = toSessionStart("2026-07-15", "12:00", "America/New_York");
    expect(ny.toISOString()).toBe("2026-07-15T16:00:00.000Z");
    const nyWinter = toSessionStart("2026-01-15", "12:00", "America/New_York");
    expect(nyWinter.toISOString()).toBe("2026-01-15T17:00:00.000Z");
  });
});
