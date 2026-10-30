import { describe, expect, test } from "bun:test";
import {
  isScheduleChangeExitOpen,
  scheduleChangeExitDeadline,
} from "../../modules/academy-class/academy-class.service";

describe("ordinary Academy schedule-change exit window", () => {
  const notifiedAt = new Date("2026-10-30T00:00:00.000Z");

  test("uses the earlier of 24 hours after notification and the new start", () => {
    expect(
      scheduleChangeExitDeadline(
        notifiedAt,
        new Date("2026-10-30T12:00:00.000Z"),
      ),
    ).toEqual(new Date("2026-10-30T12:00:00.000Z"));
    expect(
      scheduleChangeExitDeadline(
        notifiedAt,
        new Date("2026-11-02T12:00:00.000Z"),
      ),
    ).toEqual(new Date("2026-10-31T00:00:00.000Z"));
  });

  test("requires cancellation strictly before the deadline", () => {
    const deadline = new Date("2026-10-31T00:00:00.000Z");
    expect(
      isScheduleChangeExitOpen(new Date(deadline.getTime() - 1), deadline),
    ).toBe(true);
    expect(isScheduleChangeExitOpen(deadline, deadline)).toBe(false);
    expect(
      isScheduleChangeExitOpen(new Date(deadline.getTime() + 1), deadline),
    ).toBe(false);
  });
});
