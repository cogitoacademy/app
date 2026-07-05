import { describe, test, expect } from "bun:test";
import {
  canTransition,
  transition,
} from "../../modules/booking/booking-state";
import type {
  BookingState,
  BookingEvent,
} from "../../modules/booking/booking-state.types";

function t(from: BookingState, event: BookingEvent, to: BookingState) {
  test(`${from} → ${to} (${event})`, () => {
    expect(canTransition(from, event)).toBe(true);
    expect(transition(from, event)).toBe(to);
  });
}

describe("Booking state machine", () => {
  describe("legal transitions", () => {
    t("draft", "submit", "awaiting_marks_hold");
    t("awaiting_marks_hold", "hold_ok", "awaiting_tutor_review");
    t("awaiting_marks_hold", "deadline_missed", "expired");
    t("awaiting_tutor_review", "tutor_decline", "declined");
    t("awaiting_tutor_review", "tutor_accept", "confirmed");
    t("awaiting_tutor_review", "propose_reschedule", "reschedule_proposed");
    t("awaiting_tutor_review", "deadline_missed", "expired");
    t(
      "reschedule_proposed",
      "student_accept_reschedule",
      "awaiting_reconfirmation",
    );
    t("reschedule_proposed", "student_reject_reschedule", "declined");
    t("confirmed", "admin_assign_room", "awaiting_admin_room_approval");
    t("confirmed", "session_start", "scheduled");
    t("confirmed", "cancel_pre_h2", "cancelled");
    t("confirmed", "cancel_post_h2", "late_cancelled");
    t("awaiting_admin_room_approval", "admin_assign_room", "scheduled");
    t(
      "awaiting_admin_room_approval",
      "admin_propose_reschedule",
      "reschedule_proposed",
    );
    t("awaiting_admin_room_approval", "no_room", "cancelled");
    t(
      "awaiting_participant_confirmation",
      "headcount_below_min",
      "awaiting_reconfirmation",
    );
    t(
      "awaiting_participant_confirmation",
      "headcount_full",
      "awaiting_tutor_review",
    );
    t("awaiting_reconfirmation", "all_reconfirmed", "confirmed");
    t("awaiting_reconfirmation", "deadline_missed", "expired");
    t("scheduled", "cancel_pre_h2", "cancelled");
    t("scheduled", "cancel_post_h2", "late_cancelled");
    t("scheduled", "session_start", "no_show");
    t("scheduled", "tutor_complete", "completed");
  });

  describe("terminal states reject non-override events", () => {
    const terminalStates: BookingState[] = [
      "declined",
      "cancelled",
      "late_cancelled",
      "no_show",
      "expired",
      "completed",
    ];
    const nonOverrideEvents: BookingEvent[] = [
      "submit",
      "hold_ok",
      "tutor_accept",
      "tutor_decline",
      "session_start",
      "cancel_pre_h2",
      "cancel_post_h2",
    ];

    for (const state of terminalStates) {
      for (const event of nonOverrideEvents) {
        test(`${state} rejects ${event}`, () => {
          expect(canTransition(state, event)).toBe(false);
          expect(() => transition(state, event)).toThrow();
        });
      }
    }
  });

  describe("admin_override from terminal states", () => {
    const terminalStates: BookingState[] = [
      "declined",
      "cancelled",
      "late_cancelled",
      "no_show",
      "expired",
      "completed",
    ];

    for (const state of terminalStates) {
      test(`admin_override from ${state} → draft`, () => {
        expect(canTransition(state, "admin_override")).toBe(true);
        expect(transition(state, "admin_override")).toBe("draft");
      });
    }
  });

  describe("illegal transitions return false and throw", () => {
    const illegalCases: Array<{ from: BookingState; event: BookingEvent }> = [
      { from: "draft", event: "tutor_complete" },
      { from: "draft", event: "tutor_accept" },
      { from: "scheduled", event: "hold_ok" },
      { from: "scheduled", event: "admin_assign_room" },
      { from: "declined", event: "tutor_accept" },
      { from: "cancelled", event: "session_start" },
      { from: "completed", event: "tutor_complete" },
      { from: "expired", event: "session_start" },
      { from: "confirmed", event: "tutor_decline" },
      { from: "awaiting_marks_hold", event: "cancel_pre_h2" },
    ];

    for (const { from, event } of illegalCases) {
      test(`${from} cannot handle ${event}`, () => {
        expect(canTransition(from, event)).toBe(false);
        expect(() => transition(from, event)).toThrow();
      });
    }
  });

  describe("transition throws ORPCError with PRECONDITION_FAILED", () => {
    test("on illegal transition", () => {
      try {
        transition("draft", "tutor_complete");
        expect(true).toBe(false);
      } catch (err: any) {
        expect(err.code).toBe("PRECONDITION_FAILED");
        expect(err.message).toContain("draft");
        expect(err.message).toContain("tutor_complete");
      }
    });
  });
});