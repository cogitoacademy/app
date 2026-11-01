import { describe, expect, test } from "bun:test";
import { isLateTutorAbsenceNotice } from "../../modules/academy-class/academy-class.service";

describe("class tutor absence notice timing", () => {
  const start = new Date("2026-11-01T12:00:00.000Z");

  test("does not mark a notice exactly 24 hours before start late", () => {
    expect(
      isLateTutorAbsenceNotice(
        new Date(start.getTime() - 24 * 60 * 60 * 1000),
        start,
      ),
    ).toBe(false);
  });

  test("marks notices inside 24 hours and after start late", () => {
    expect(isLateTutorAbsenceNotice(new Date(start.getTime() - 1), start)).toBe(
      true,
    );
    expect(
      isLateTutorAbsenceNotice(
        new Date(start.getTime() + 60 * 60 * 1000),
        start,
      ),
    ).toBe(true);
  });
});
