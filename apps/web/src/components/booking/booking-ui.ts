const STATE_LABELS: Record<string, string> = {
  awaiting_tutor_review: "Awaiting tutor",
  declined: "Declined",
  reschedule_proposed: "Reschedule proposed",
  awaiting_reconfirmation: "Awaiting reconfirmation",
  awaiting_admin_room_approval: "Awaiting room approval",
  awaiting_participant_confirmation: "Awaiting participants",
  confirmed: "Confirmed",
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
  late_cancelled: "Late cancelled",
  no_show: "No show",
  expired: "Expired",
};

const STATE_DESCRIPTIONS: Record<string, string> = {
  awaiting_tutor_review: "The tutor still needs to review this request.",
  declined: "The tutor declined this booking request.",
  reschedule_proposed: "A new session time has been proposed.",
  awaiting_reconfirmation: "Participants need to confirm the updated details.",
  awaiting_admin_room_approval: "Cogito is confirming an offline room.",
  awaiting_participant_confirmation: "Waiting for all participants to confirm.",
  confirmed: "Everyone has confirmed the session.",
  scheduled: "This session is ready to go.",
  completed: "This session has been completed.",
  cancelled: "This booking was cancelled.",
  late_cancelled: "This booking was cancelled after the cutoff.",
  no_show: "This session was marked as a no-show.",
  expired: "The confirmation window expired.",
};

const TERMINAL_STATES = new Set([
  "completed",
  "cancelled",
  "late_cancelled",
  "declined",
  "no_show",
  "expired",
]);

type StateVariant = "warning" | "info" | "success" | "danger" | "secondary";

export function getBookingStateLabel(state: string) {
  return STATE_LABELS[state] ?? state.replaceAll("_", " ");
}

export function getBookingStateDescription(state: string) {
  return STATE_DESCRIPTIONS[state] ?? "Booking status updated.";
}

export function getBookingStateVariant(state: string): StateVariant {
  if (["completed", "confirmed"].includes(state)) return "success";
  if (["scheduled"].includes(state)) return "info";
  if (TERMINAL_STATES.has(state)) return "danger";
  if (state.startsWith("awaiting") || state === "reschedule_proposed") {
    return "warning";
  }
  return "secondary";
}

export function getBookingTypeLabel(type: string) {
  if (type === "solo") return "Solo session";
  if (type === "group") return "Group session";
  if (type === "series") return "Session series";
  return type;
}

export function canCancelBooking(state: string) {
  return !TERMINAL_STATES.has(state);
}

export function formatBookingDate(
  value: string | Date,
  timeZone = "Asia/Jakarta",
) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(new Date(value));
}

export function formatBookingDateOnly(
  value: string | Date,
  timeZone = "Asia/Jakarta",
) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(new Date(value));
}

export function formatBookingTimeRange(
  start: string | Date,
  end: string | Date,
  timeZone = "Asia/Jakarta",
) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
  return `${formatter.format(new Date(start))} - ${formatter.format(new Date(end))}`;
}
