import { describe, expect, test } from "bun:test";

import { getBookingLifecycleContext } from "./booking-lifecycle-actions";

const baseInput = {
  viewerRole: "student",
  currentState: "scheduled",
  bookingType: "solo",
  scheduledStartAt: "2026-09-08T10:00:00.000Z",
};

describe("getBookingLifecycleContext", () => {
  test("includes the proposed time for a pending reschedule", () => {
    const context = getBookingLifecycleContext({
      ...baseInput,
      currentState: "reschedule_proposed",
      activeProposalId: "proposal-1",
      viewerRescheduleDecision: "pending",
      proposedStartAt: "2026-09-10T10:00:00.000Z",
      proposedEndAt: "2026-09-10T11:00:00.000Z",
      timezone: "UTC",
    });

    expect(context).toContain("A new time was proposed for");
    expect(context).toContain("10:00 - 11:00");
  });

  test("explains the Marks hold for a pending group invitation", () => {
    expect(
      getBookingLifecycleContext({
        ...baseInput,
        currentState: "awaiting_participant_confirmation",
        bookingType: "group",
        participantRole: "invitee",
        participantState: "pending",
        perStudentMarks: 20,
      }),
    ).toBe(
      "You have been invited to this group session. Accepting will reserve 20 Marks.",
    );
  });

  test("only exposes lateness reporting after the grace period", () => {
    expect(
      getBookingLifecycleContext({
        ...baseInput,
        now: new Date("2026-09-08T10:14:59.000Z").getTime(),
      }),
    ).toBeNull();

    expect(
      getBookingLifecycleContext({
        ...baseInput,
        now: new Date("2026-09-08T10:15:00.000Z").getTime(),
      }),
    ).toContain("report the issue");
  });
});
