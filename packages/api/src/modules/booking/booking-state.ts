import type {
  BookingEvent,
  BookingState,
  BookingTransition,
} from "./booking-state.types";
import { TERMINAL_STATES } from "./booking-state.types";
import { preconditionFailed } from "../../lib/errors";

const TRANSITIONS: BookingTransition[] = [
  { from: "draft", event: "submit", to: "awaiting_marks_hold" },
  {
    from: "awaiting_marks_hold",
    event: "hold_ok",
    to: "awaiting_tutor_review",
  },
  { from: "awaiting_marks_hold", event: "deadline_missed", to: "expired" },
  { from: "awaiting_tutor_review", event: "tutor_decline", to: "declined" },
  { from: "awaiting_tutor_review", event: "tutor_accept", to: "confirmed" },
  {
    from: "awaiting_tutor_review",
    event: "propose_reschedule",
    to: "reschedule_proposed",
  },
  { from: "awaiting_tutor_review", event: "deadline_missed", to: "expired" },
  { from: "awaiting_tutor_review", event: "cancel_pre_h2", to: "cancelled" },
  {
    from: "awaiting_tutor_review",
    event: "cancel_post_h2",
    to: "late_cancelled",
  },
  {
    from: "reschedule_proposed",
    event: "student_accept_reschedule",
    to: "awaiting_reconfirmation",
  },
  {
    from: "reschedule_proposed",
    event: "student_reject_reschedule",
    to: "declined",
  },
  {
    from: "confirmed",
    event: "admin_assign_room",
    to: "awaiting_admin_room_approval",
  },
  { from: "confirmed", event: "session_start", to: "scheduled" },
  { from: "confirmed", event: "cancel_pre_h2", to: "cancelled" },
  { from: "confirmed", event: "cancel_post_h2", to: "late_cancelled" },
  {
    from: "awaiting_admin_room_approval",
    event: "admin_assign_room",
    to: "scheduled",
  },
  {
    from: "awaiting_admin_room_approval",
    event: "admin_propose_reschedule",
    to: "reschedule_proposed",
  },
  { from: "awaiting_admin_room_approval", event: "no_room", to: "cancelled" },
  {
    from: "awaiting_participant_confirmation",
    event: "headcount_below_min",
    to: "awaiting_reconfirmation",
  },
  {
    from: "awaiting_participant_confirmation",
    event: "headcount_full",
    to: "awaiting_tutor_review",
  },
  {
    from: "awaiting_reconfirmation",
    event: "all_reconfirmed",
    to: "confirmed",
  },
  { from: "awaiting_reconfirmation", event: "deadline_missed", to: "expired" },
  { from: "scheduled", event: "cancel_pre_h2", to: "cancelled" },
  { from: "scheduled", event: "cancel_post_h2", to: "late_cancelled" },
  { from: "scheduled", event: "session_start", to: "no_show" },
  { from: "scheduled", event: "tutor_complete", to: "completed" },
];

const TERMINAL_SET = new Set<BookingState>(TERMINAL_STATES);

function lookup(
  from: BookingState,
  event: BookingEvent,
): BookingState | undefined {
  return TRANSITIONS.find((t) => t.from === from && t.event === event)?.to;
}

export function canTransition(
  from: BookingState,
  event: BookingEvent,
): boolean {
  if (event === "admin_override" && TERMINAL_SET.has(from)) {
    return true;
  }
  return lookup(from, event) !== undefined;
}

export function transition(
  from: BookingState,
  event: BookingEvent,
): BookingState {
  if (event === "admin_override" && TERMINAL_SET.has(from)) {
    return "draft";
  }
  const to = lookup(from, event);
  if (!to) {
    throw preconditionFailed(`Illegal booking transition: ${from} + ${event}`);
  }
  return to;
}

export function createBookingStateMachine() {
  return {
    canTransition,
    transition,
    canTransitionInput(input: {
      from: BookingState;
      event: BookingEvent;
    }): boolean {
      return canTransition(input.from, input.event);
    },
    transitionInput(input: { from: BookingState; event: BookingEvent }): {
      from: BookingState;
      event: BookingEvent;
      to: BookingState;
    } {
      return {
        from: input.from,
        event: input.event,
        to: transition(input.from, input.event),
      };
    },
  };
}
