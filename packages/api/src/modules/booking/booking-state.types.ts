export const BOOKING_STATE = {
  AWAITING_TUTOR_REVIEW: "awaiting_tutor_review",
  DECLINED: "declined",
  RESCHEDULE_PROPOSED: "reschedule_proposed",
  AWAITING_RECONFIRMATION: "awaiting_reconfirmation",
  AWAITING_ADMIN_ROOM_APPROVAL: "awaiting_admin_room_approval",
  AWAITING_PARTICIPANT_CONFIRMATION: "awaiting_participant_confirmation",
  CONFIRMED: "confirmed",
  SCHEDULED: "scheduled",
  CANCELLED: "cancelled",
  LATE_CANCELLED: "late_cancelled",
  NO_SHOW: "no_show",
  EXPIRED: "expired",
  COMPLETED: "completed",
} as const;

export const BOOKING_STATES = [
  BOOKING_STATE.AWAITING_TUTOR_REVIEW,
  BOOKING_STATE.DECLINED,
  BOOKING_STATE.RESCHEDULE_PROPOSED,
  BOOKING_STATE.AWAITING_RECONFIRMATION,
  BOOKING_STATE.AWAITING_ADMIN_ROOM_APPROVAL,
  BOOKING_STATE.AWAITING_PARTICIPANT_CONFIRMATION,
  BOOKING_STATE.CONFIRMED,
  BOOKING_STATE.SCHEDULED,
  BOOKING_STATE.CANCELLED,
  BOOKING_STATE.LATE_CANCELLED,
  BOOKING_STATE.NO_SHOW,
  BOOKING_STATE.EXPIRED,
  BOOKING_STATE.COMPLETED,
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
  BOOKING_STATE.DECLINED,
  BOOKING_STATE.CANCELLED,
  BOOKING_STATE.LATE_CANCELLED,
  BOOKING_STATE.NO_SHOW,
  BOOKING_STATE.EXPIRED,
  BOOKING_STATE.COMPLETED,
];
