import { describe, expect, test } from "bun:test";
import {
  buildProposeRescheduleInput,
  isSameScheduleMinute,
  resolveRescheduleCurrentStart,
} from "./booking-reschedule-action";

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

describe("buildProposeRescheduleInput", () => {
  test("includes sessionId for per-session series reschedule", () => {
    const input = buildProposeRescheduleInput({
      bookingId: "booking-1",
      sessionId: "session-2",
      proposedStartAt: new Date("2026-09-10T02:00:00.000Z"),
      reason: "Need a new time",
    });

    expect(input).toEqual({
      bookingId: "booking-1",
      sessionId: "session-2",
      availabilitySlotId: undefined,
      proposedStartAt: new Date("2026-09-10T02:00:00.000Z"),
      reason: "Need a new time",
    });
  });

  test("omits sessionId for booking-level solo/group reschedule", () => {
    const input = buildProposeRescheduleInput({
      bookingId: "booking-1",
      proposedStartAt: new Date("2026-09-10T02:00:00.000Z"),
      reason: "Need a new time",
    });

    expect(input.sessionId).toBeUndefined();
    expect(input.bookingId).toBe("booking-1");
  });
});

describe("resolveRescheduleCurrentStart", () => {
  test("prefers the session start for per-session validation", () => {
    expect(
      resolveRescheduleCurrentStart({
        currentStartAt: "2026-09-01T02:00:00.000Z",
        sessionStartAt: "2026-09-08T02:00:00.000Z",
      }),
    ).toBe("2026-09-08T02:00:00.000Z");
  });

  test("falls back to booking start for booking-level reschedule", () => {
    expect(
      resolveRescheduleCurrentStart({
        currentStartAt: "2026-09-01T02:00:00.000Z",
      }),
    ).toBe("2026-09-01T02:00:00.000Z");
  });
});
