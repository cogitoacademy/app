import { describe, expect, test } from "bun:test";
import { getNotificationTarget } from "./notification-destination";

function notification(
  overrides: Partial<{
    bookingId: string | null;
    category: string;
    metadata: Record<string, unknown> | null;
  }> = {},
) {
  return {
    bookingId: null,
    category: "schedule",
    metadata: null,
    ...overrides,
  };
}

describe("getNotificationTarget", () => {
  test("opens the tutor class list for class schedule updates", () => {
    expect(
      getNotificationTarget(
        notification({ metadata: { classId: "c1" } }),
        "tutor",
      ),
    ).toEqual({ to: "/my-classes" });
  });

  test("opens class details for students and classes studio for admins", () => {
    expect(
      getNotificationTarget(
        notification({ metadata: { classId: "c1" } }),
        "student",
      ),
    ).toEqual({ to: "/classes/$classId", classId: "c1" });
    expect(
      getNotificationTarget(
        notification({ metadata: { classId: "c1" } }),
        "admin",
      ),
    ).toEqual({ to: "/admin-classes" });
  });

  test("keeps booking notifications on the booking detail", () => {
    expect(
      getNotificationTarget(notification({ bookingId: "b1" }), "tutor"),
    ).toEqual({ to: "/bookings/$bookingId", bookingId: "b1" });
  });

  test("routes report reminders to the reporting workspace", () => {
    expect(
      getNotificationTarget(
        notification({ metadata: { action: "class-session-report" } }),
        "tutor",
      ),
    ).toEqual({ to: "/class-reports" });
  });

  test("does not send schedule updates to the competition calendar", () => {
    expect(getNotificationTarget(notification(), "tutor")).toEqual({
      to: "/notifications",
    });
  });
});
