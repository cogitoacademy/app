export const BOOKING_STATES = [
  "draft",
  "awaiting_marks_hold",
  "awaiting_tutor_review",
  "declined",
  "reschedule_proposed",
  "awaiting_reconfirmation",
  "awaiting_admin_room_approval",
  "awaiting_participant_confirmation",
  "confirmed",
  "scheduled",
  "cancelled",
  "late_cancelled",
  "no_show",
  "expired",
  "completed",
] as const;

export type BookingState = (typeof BOOKING_STATES)[number];

export const BOOKING_EVENTS = [
  "submit",
  "hold_ok",
  "tutor_accept",
  "tutor_decline",
  "propose_reschedule",
  "student_accept_reschedule",
  "student_reject_reschedule",
  "admin_assign_room",
  "admin_propose_reschedule",
  "no_room",
  "headcount_full",
  "headcount_below_min",
  "all_reconfirmed",
  "deadline_missed",
  "cancel_pre_h2",
  "cancel_post_h2",
  "session_start",
  "tutor_complete",
  "admin_override",
] as const;

export type BookingEvent = (typeof BOOKING_EVENTS)[number];

export interface BookingTransition {
  from: BookingState;
  event: BookingEvent;
  to: BookingState;
}

export const TERMINAL_STATES: BookingState[] = [
  "declined",
  "cancelled",
  "late_cancelled",
  "no_show",
  "expired",
  "completed",
];
