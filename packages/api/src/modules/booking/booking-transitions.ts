import type { BookingState } from "./booking-state.types";

const TRANSITIONS: Record<
  BookingState,
  { to: BookingState[]; auto?: boolean }
> = {
  draft: { to: ["awaiting_marks_hold"] },
  awaiting_marks_hold: { to: ["awaiting_tutor_review", "expired"] },
  awaiting_tutor_review: {
    to: [
      "declined",
      "confirmed",
      "reschedule_proposed",
      "expired",
      "cancelled",
      "late_cancelled",
    ],
  },
  awaiting_participant_confirmation: {
    to: ["awaiting_reconfirmation", "awaiting_tutor_review", "expired"],
  },
  awaiting_reconfirmation: {
    to: ["confirmed", "expired"],
  },
  awaiting_admin_room_approval: {
    to: ["scheduled", "reschedule_proposed", "cancelled"],
  },
  confirmed: {
    to: [
      "awaiting_admin_room_approval",
      "scheduled",
      "cancelled",
      "late_cancelled",
    ],
  },
  scheduled: {
    to: ["completed", "cancelled", "late_cancelled", "no_show"],
  },
  completed: { to: [] },
  declined: { to: [] },
  cancelled: { to: [] },
  late_cancelled: { to: [] },
  no_show: { to: [] },
  expired: { to: [] },
  reschedule_proposed: {
    to: ["awaiting_reconfirmation", "declined"],
  },
};

export { TRANSITIONS };

export function canTransition(
  from: BookingState | null,
  to: BookingState,
): boolean {
  if (!from) return true;
  return TRANSITIONS[from]?.to.includes(to) ?? false;
}
