export type NotificationTarget =
  | { to: "/class-reports" }
  | { to: "/my-classes" }
  | { to: "/bookings" }
  | { to: "/balance" }
  | { to: "/achievements" }
  | { to: "/notifications" }
  | { to: "/admin-classes" }
  | { to: "/bookings/$bookingId"; bookingId: string }
  | { to: "/classes/$classId"; classId: string };

type NotificationLike = {
  bookingId: string | null;
  category: string;
  metadata: Record<string, unknown> | null;
};

function readClassId(metadata: Record<string, unknown> | null) {
  const value = metadata?.classId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function getNotificationTarget(
  notification: NotificationLike,
  role: string | undefined,
): NotificationTarget {
  if (notification.metadata?.action === "class-session-report") {
    return { to: "/class-reports" };
  }
  if (notification.bookingId) {
    return { to: "/bookings/$bookingId", bookingId: notification.bookingId };
  }

  const classId = readClassId(notification.metadata);
  if (classId) {
    if (role === "tutor") return { to: "/my-classes" };
    if (role === "admin") return { to: "/admin-classes" };
    if (role === "student") return { to: "/classes/$classId", classId };
  }

  switch (notification.category) {
    case "achievement":
      return { to: "/achievements" };
    case "booking":
    case "override":
      return { to: "/bookings" };
    case "payment":
    case "refund":
      return { to: "/balance" };
    default:
      return { to: "/notifications" };
  }
}
