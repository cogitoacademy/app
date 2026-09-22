import { describe, expect, test } from "bun:test";
import { getDateOverrideValidationError } from "./availability-override-validation";

const minimumDate = new Date(Date.now() + 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);
const ranges = [{ start: "09:00", end: "12:00" }];
const now = new Date(`${minimumDate}T08:00:00+07:00`).getTime();

describe("getDateOverrideValidationError", () => {
  test("accepts future dates and valid ranges", () => {
    expect(
      getDateOverrideValidationError({
        dates: [minimumDate],
        ranges,
        minimumDate,
        now,
        existingSlots: [],
      }),
    ).toBeNull();
  });

  test("rejects a missing date", () => {
    expect(
      getDateOverrideValidationError({
        dates: [],
        ranges,
        minimumDate,
        now,
        existingSlots: [],
      }),
    ).toBe("Choose at least one date.");
  });

  test("rejects invalid and overlapping ranges", () => {
    expect(
      getDateOverrideValidationError({
        dates: [minimumDate],
        ranges: [{ start: "12:00", end: "11:00" }],
        minimumDate,
        now,
        existingSlots: [],
      }),
    ).toBe("Every end time must be after its start time.");

    expect(
      getDateOverrideValidationError({
        dates: [minimumDate],
        ranges: [
          { start: "09:00", end: "12:00" },
          { start: "11:00", end: "13:00" },
        ],
        minimumDate,
        now,
        existingSlots: [],
      }),
    ).toBe("Override time ranges must not overlap.");
  });

  test("rejects an existing one-off conflict but allows recurring replacement", () => {
    const existingSlots = [
      {
        startDate: `${minimumDate}T10:00:00+07:00`,
        endDate: `${minimumDate}T11:00:00+07:00`,
        isRecurring: false,
      },
      {
        startDate: `${minimumDate}T09:00:00+07:00`,
        endDate: `${minimumDate}T12:00:00+07:00`,
        isRecurring: true,
      },
    ];

    expect(
      getDateOverrideValidationError({
        dates: [minimumDate],
        ranges,
        minimumDate,
        now,
        existingSlots,
      }),
    ).toContain("has an existing one-off availability window");

    expect(
      getDateOverrideValidationError({
        dates: [minimumDate],
        ranges: [{ start: "13:00", end: "14:00" }],
        minimumDate,
        now,
        existingSlots: [existingSlots[1]!],
      }),
    ).toBeNull();
  });

  test("allows a same-day future slot and rejects a time that has passed", () => {
    expect(
      getDateOverrideValidationError({
        dates: [minimumDate],
        ranges: [{ start: "20:00", end: "22:00" }],
        minimumDate,
        now,
        existingSlots: [],
      }),
    ).toBeNull();

    expect(
      getDateOverrideValidationError({
        dates: [minimumDate],
        ranges: [{ start: "07:00", end: "09:00" }],
        minimumDate,
        now,
        existingSlots: [],
      }),
    ).toBe("Every override start time must be in the future.");
  });
});
