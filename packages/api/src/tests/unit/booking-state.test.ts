import { describe, test, expect } from "bun:test";
import {
  BOOKING_STATES,
  BOOKING_EVENTS,
  TERMINAL_STATES,
} from "../../modules/booking/booking-state.types";

describe("Booking State Types", () => {
  test("BOOKING_STATES contains all expected states", () => {
    const expected = [
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
    ];
    expect([...BOOKING_STATES]).toEqual(expected);
  });

  test("BOOKING_EVENTS contains all expected events", () => {
    const expected = [
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
    ];
    expect([...BOOKING_EVENTS]).toEqual(expected);
  });

  test("TERMINAL_STATES is a subset of BOOKING_STATES", () => {
    const stateSet = new Set(BOOKING_STATES);
    for (const state of TERMINAL_STATES) {
      expect(stateSet.has(state as (typeof BOOKING_STATES)[number])).toBe(true);
    }
  });

  test("TERMINAL_STATES contains expected terminal states", () => {
    expect(TERMINAL_STATES).toEqual([
      "declined",
      "cancelled",
      "late_cancelled",
      "no_show",
      "expired",
      "completed",
    ]);
  });
});
