import { describe, expect, test } from "bun:test";
import { reportDateWindow } from "../../modules/report-export/report-export.window";

describe("three-month report window", () => {
  test("starts at the scheduled date's WIB midnight and includes generation time", () => {
    const generatedAt = new Date("2026-10-22T04:30:00.000Z");
    expect(reportDateWindow(generatedAt)).toEqual({
      startAt: new Date("2026-07-21T17:00:00.000Z"),
      endAt: generatedAt,
    });
  });

  test("clamps the start day when the target month is shorter", () => {
    expect(
      reportDateWindow(new Date("2026-05-31T04:00:00.000Z")).startAt,
    ).toEqual(new Date("2026-02-27T17:00:00.000Z"));
  });

  test("rejects an invalid generation date", () => {
    expect(() => reportDateWindow(new Date(Number.NaN))).toThrow(
      "Report generation time must be a valid date",
    );
  });
});
