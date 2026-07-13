import { describe, test, expect } from "bun:test";
import {
  canTransition,
  TRANSITIONS,
} from "../../modules/booking/booking-transitions";
import type { BookingState } from "../../modules/booking/booking-state.types";

describe("Booking State Transitions", () => {
  test("canTransition returns true for null from state", () => {
    expect(canTransition(null, "draft")).toBe(true);
    expect(canTransition(null, "confirmed")).toBe(true);
    expect(canTransition(null, "expired")).toBe(true);
  });

  test("canTransition returns true for valid transitions from draft", () => {
    expect(canTransition("draft", "awaiting_marks_hold")).toBe(true);
  });

  test("canTransition returns false for invalid transitions from draft", () => {
    expect(canTransition("draft", "confirmed")).toBe(false);
    expect(canTransition("draft", "completed")).toBe(false);
    expect(canTransition("draft", "cancelled")).toBe(false);
  });

  test("canTransition returns true for valid transitions from awaiting_marks_hold", () => {
    expect(canTransition("awaiting_marks_hold", "awaiting_tutor_review")).toBe(
      true,
    );
    expect(canTransition("awaiting_marks_hold", "expired")).toBe(true);
  });

  test("canTransition returns false for invalid transitions from awaiting_marks_hold", () => {
    expect(canTransition("awaiting_marks_hold", "confirmed")).toBe(false);
    expect(canTransition("awaiting_marks_hold", "draft")).toBe(false);
  });

  test("canTransition returns true for valid transitions from awaiting_tutor_review", () => {
    expect(canTransition("awaiting_tutor_review", "declined")).toBe(true);
    expect(canTransition("awaiting_tutor_review", "confirmed")).toBe(true);
    expect(canTransition("awaiting_tutor_review", "reschedule_proposed")).toBe(
      true,
    );
    expect(canTransition("awaiting_tutor_review", "expired")).toBe(true);
    expect(canTransition("awaiting_tutor_review", "cancelled")).toBe(true);
    expect(canTransition("awaiting_tutor_review", "late_cancelled")).toBe(true);
  });

  test("canTransition returns false for invalid transitions from awaiting_tutor_review", () => {
    expect(canTransition("awaiting_tutor_review", "draft")).toBe(false);
    expect(canTransition("awaiting_tutor_review", "awaiting_marks_hold")).toBe(
      false,
    );
  });

  test("canTransition returns true for valid transitions from confirmed", () => {
    expect(canTransition("confirmed", "awaiting_admin_room_approval")).toBe(
      true,
    );
    expect(canTransition("confirmed", "scheduled")).toBe(true);
    expect(canTransition("confirmed", "cancelled")).toBe(true);
    expect(canTransition("confirmed", "late_cancelled")).toBe(true);
  });

  test("canTransition returns true for valid transitions from scheduled", () => {
    expect(canTransition("scheduled", "completed")).toBe(true);
    expect(canTransition("scheduled", "cancelled")).toBe(true);
    expect(canTransition("scheduled", "late_cancelled")).toBe(true);
    expect(canTransition("scheduled", "no_show")).toBe(true);
  });

  test("terminal states have no outgoing transitions", () => {
    const terminalStates: BookingState[] = [
      "completed",
      "declined",
      "cancelled",
      "late_cancelled",
      "no_show",
      "expired",
    ];
    for (const state of terminalStates) {
      expect(TRANSITIONS[state].to).toHaveLength(0);
      expect(canTransition(state, "draft" as BookingState)).toBe(false);
      expect(canTransition(state, "confirmed" as BookingState)).toBe(false);
    }
  });

  test("reschedule_proposed can transition to awaiting_reconfirmation or declined", () => {
    expect(
      canTransition("reschedule_proposed", "awaiting_reconfirmation"),
    ).toBe(true);
    expect(canTransition("reschedule_proposed", "declined")).toBe(true);
    expect(canTransition("reschedule_proposed", "confirmed")).toBe(false);
  });

  test("awaiting_participant_confirmation transitions", () => {
    expect(
      canTransition(
        "awaiting_participant_confirmation",
        "awaiting_reconfirmation",
      ),
    ).toBe(true);
    expect(
      canTransition(
        "awaiting_participant_confirmation",
        "awaiting_tutor_review",
      ),
    ).toBe(true);
    expect(canTransition("awaiting_participant_confirmation", "expired")).toBe(
      true,
    );
    expect(
      canTransition("awaiting_participant_confirmation", "confirmed"),
    ).toBe(false);
  });

  test("awaiting_reconfirmation transitions", () => {
    expect(canTransition("awaiting_reconfirmation", "confirmed")).toBe(true);
    expect(canTransition("awaiting_reconfirmation", "expired")).toBe(true);
    expect(canTransition("awaiting_reconfirmation", "cancelled")).toBe(false);
  });

  test("awaiting_admin_room_approval transitions", () => {
    expect(canTransition("awaiting_admin_room_approval", "scheduled")).toBe(
      true,
    );
    expect(
      canTransition("awaiting_admin_room_approval", "reschedule_proposed"),
    ).toBe(true);
    expect(canTransition("awaiting_admin_room_approval", "cancelled")).toBe(
      true,
    );
    expect(canTransition("awaiting_admin_room_approval", "confirmed")).toBe(
      false,
    );
  });
});
