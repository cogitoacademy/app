import { describe, test, expect } from "bun:test";
import {
  BOOKING_STATE,
  BOOKING_STATES,
  BOOKING_EVENTS,
  TERMINAL_STATES,
} from "../../modules/booking/booking-state.types";
import {
  canTransition,
  TRANSITIONS,
} from "../../modules/booking/booking-transitions";
import type { BookingState } from "../../modules/booking/booking-state.types";

describe("Booking State Types", () => {
  test("BOOKING_STATES does not contain dead states", () => {
    expect(BOOKING_STATES).not.toContain("draft");
    expect(BOOKING_STATES).not.toContain("awaiting_marks_hold");
    expect(BOOKING_STATE.DRAFT).toBeUndefined();
    expect(BOOKING_STATE.AWAITING_MARKS_HOLD).toBeUndefined();
  });

  test("BOOKING_STATES contains all expected live states", () => {
    const expected = [
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

  test("TRANSITIONS map has no entry for dead states", () => {
    expect((TRANSITIONS as Record<string, unknown>)["draft"]).toBeUndefined();
    expect(
      (TRANSITIONS as Record<string, unknown>)["awaiting_marks_hold"],
    ).toBeUndefined();
  });

  test("canTransition returns false for dead states", () => {
    expect(
      canTransition("draft" as BookingState, "awaiting_tutor_review"),
    ).toBe(false);
    expect(
      canTransition("awaiting_marks_hold" as BookingState, "expired"),
    ).toBe(false);
  });

  test("every non-terminal state has a path to a terminal state (reachability)", () => {
    const terminalSet = new Set(TERMINAL_STATES);
    const visited = new Set<string>();
    const maxDepth = BOOKING_STATES.length;

    function canReachTerminal(state: string, depth: number): boolean {
      if (terminalSet.has(state as BookingState)) return true;
      if (depth > maxDepth) return false;
      if (visited.has(state)) return false;
      visited.add(state);
      const trans = TRANSITIONS[state as BookingState];
      if (!trans) return false;
      return trans.to.some((next) => canReachTerminal(next, depth + 1));
    }

    for (const state of BOOKING_STATES) {
      visited.clear();
      expect(canReachTerminal(state, 0)).toBe(true);
    }
  });

  test("RESCHEDULE_PROPOSED can transition to EXPIRED", () => {
    expect(canTransition("reschedule_proposed", "expired")).toBe(true);
    expect(
      canTransition("reschedule_proposed", "awaiting_reconfirmation"),
    ).toBe(true);
    expect(canTransition("reschedule_proposed", "declined")).toBe(true);
  });

  test("SCHEDULED can transition to NO_SHOW", () => {
    expect(canTransition("scheduled", "no_show")).toBe(true);
  });

  test("AWAITING_ADMIN_ROOM_APPROVAL can transition to CANCELLED", () => {
    expect(canTransition("awaiting_admin_room_approval", "cancelled")).toBe(
      true,
    );
  });
});
