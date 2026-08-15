import { describe, it, expect } from "bun:test";
import { DomainError } from "../../lib/domain-errors";
import {
  BookingNotFoundError,
  BookingNotEditableError,
  InsufficientMarksError,
  BookingConflictError,
  BookingStateTransitionError,
  BookingNotOwnedError,
  BookingAlreadyConfirmedError,
  BookingNotAwaitingConfirmationError,
  BookingNotAwaitingReconfirmationError,
  BookingCancellationDeadlinePassedError,
  BookingRoomNotAssignedError,
  BookingGroupSizeError,
  BookingSeriesSizeError,
  BookingParticipantNotFoundError,
  BookingParticipantAlreadyConfirmedError,
  BookingRescheduleNotFoundError,
  BookingRescheduleNotPendingError,
  BookingNotAwaitingReviewError,
  BookingTutorNotAssignedError,
  BookingHoldExpiredError,
  BookingDuplicateHoldError,
  BookingExpiredError,
  BookingNoShowError,
  BookingCancelledError,
  BookingSeriesNoOptOutError,
  mapBookingError,
} from "../../modules/booking/booking.errors";

class TestDomainError extends DomainError {
  readonly domain = "test";
  constructor() {
    super("TEST_ERROR", "Test error");
  }
}

describe("booking.errors", () => {
  const errorClasses = [
    {
      cls: BookingNotFoundError,
      code: "BOOKING_NOT_FOUND",
      msg: "Booking not found",
      args: ["bk_1"],
      details: { id: "bk_1" },
    },
    {
      cls: BookingNotEditableError,
      code: "BOOKING_NOT_EDITABLE",
      msg: "Booking is not editable",
      args: ["bk_1"],
      details: { id: "bk_1" },
    },
    {
      cls: InsufficientMarksError,
      code: "INSUFFICIENT_MARKS",
      msg: "Insufficient marks",
      args: [100, 50],
      details: { required: 100, available: 50 },
    },
    {
      cls: BookingConflictError,
      code: "BOOKING_CONFLICT",
      msg: "Booking time conflict",
      args: ["t1", "2025-01-01", "2025-01-02"],
      details: { tutorId: "t1", startAt: "2025-01-01", endAt: "2025-01-02" },
    },
    {
      cls: BookingStateTransitionError,
      code: "BOOKING_STATE_TRANSITION",
      msg: "Invalid state transition",
      args: ["draft", "submit", "scheduled"],
      details: { from: "draft", event: "submit", to: "scheduled" },
    },
    {
      cls: BookingNotOwnedError,
      code: "BOOKING_NOT_OWNED",
      msg: "You do not own this booking",
      args: ["bk_1", "u1"],
      details: { id: "bk_1", userId: "u1" },
    },
    {
      cls: BookingAlreadyConfirmedError,
      code: "BOOKING_ALREADY_CONFIRMED",
      msg: "Booking is already confirmed",
      args: ["bk_1"],
      details: { id: "bk_1" },
    },
    {
      cls: BookingNotAwaitingConfirmationError,
      code: "BOOKING_NOT_AWAITING_CONFIRMATION",
      msg: "Booking is not awaiting confirmation",
      args: ["bk_1", "draft"],
      details: { id: "bk_1", status: "draft" },
    },
    {
      cls: BookingNotAwaitingReconfirmationError,
      code: "BOOKING_NOT_AWAITING_RECONFIRMATION",
      msg: "Booking is not awaiting reconfirmation",
      args: ["bk_1", "draft"],
      details: { id: "bk_1", status: "draft" },
    },
    {
      cls: BookingCancellationDeadlinePassedError,
      code: "BOOKING_CANCELLATION_DEADLINE_PASSED",
      msg: "Cancellation deadline has passed",
      args: ["bk_1"],
      details: { id: "bk_1" },
    },
    {
      cls: BookingRoomNotAssignedError,
      code: "BOOKING_ROOM_NOT_ASSIGNED",
      msg: "Room not assigned",
      args: ["bk_1"],
      details: { id: "bk_1" },
    },
    {
      cls: BookingGroupSizeError,
      code: "BOOKING_GROUP_SIZE",
      msg: "Invalid group size",
      args: ["bk_1", 2, 10],
      details: { id: "bk_1", min: 2, max: 10 },
    },
    {
      cls: BookingSeriesSizeError,
      code: "BOOKING_SERIES_SIZE",
      msg: "Invalid series size",
      args: ["bk_1", 1, 20],
      details: { id: "bk_1", min: 1, max: 20 },
    },
    {
      cls: BookingParticipantNotFoundError,
      code: "BOOKING_PARTICIPANT_NOT_FOUND",
      msg: "Participant not found",
      args: ["p1"],
      details: { id: "p1" },
    },
    {
      cls: BookingParticipantAlreadyConfirmedError,
      code: "BOOKING_PARTICIPANT_ALREADY_CONFIRMED",
      msg: "Participant has already confirmed",
      args: ["p1"],
      details: { id: "p1" },
    },
    {
      cls: BookingRescheduleNotFoundError,
      code: "BOOKING_RESCHEDULE_NOT_FOUND",
      msg: "Reschedule proposal not found",
      args: ["bk_1"],
      details: { id: "bk_1" },
    },
    {
      cls: BookingRescheduleNotPendingError,
      code: "BOOKING_RESCHEDULE_NOT_PENDING",
      msg: "Reschedule proposal is not pending",
      args: ["bk_1"],
      details: { id: "bk_1" },
    },
    {
      cls: BookingNotAwaitingReviewError,
      code: "BOOKING_NOT_AWAITING_REVIEW",
      msg: "Booking is not awaiting tutor review",
      args: ["bk_1", "draft"],
      details: { id: "bk_1", status: "draft" },
    },
    {
      cls: BookingTutorNotAssignedError,
      code: "BOOKING_TUTOR_NOT_ASSIGNED",
      msg: "No tutor assigned to this booking",
      args: ["bk_1"],
      details: { id: "bk_1" },
    },
    {
      cls: BookingHoldExpiredError,
      code: "BOOKING_HOLD_EXPIRED",
      msg: "Booking hold has expired",
      args: ["bk_1"],
      details: { id: "bk_1" },
    },
    {
      cls: BookingDuplicateHoldError,
      code: "BOOKING_DUPLICATE_HOLD",
      msg: "Duplicate hold attempt",
      args: ["bk_1"],
      details: { id: "bk_1" },
    },
    {
      cls: BookingExpiredError,
      code: "BOOKING_EXPIRED",
      msg: "Booking has expired",
      args: ["bk_1"],
      details: { id: "bk_1" },
    },
    {
      cls: BookingNoShowError,
      code: "BOOKING_NO_SHOW",
      msg: "Booking marked as no-show",
      args: ["bk_1"],
      details: { id: "bk_1" },
    },
    {
      cls: BookingCancelledError,
      code: "BOOKING_CANCELLED",
      msg: "Booking has been cancelled",
      args: ["bk_1"],
      details: { id: "bk_1" },
    },
    {
      cls: BookingSeriesNoOptOutError,
      code: "BOOKING_SERIES_NO_OPT_OUT",
      msg: "Group series participants cannot withdraw from the series",
      args: ["bk_1"],
      details: { id: "bk_1" },
    },
  ] as const;

  for (const { cls, code, msg, args, details } of errorClasses) {
    describe(cls.name, () => {
      it("should be instance of DomainError", () => {
        const err = new cls(...(args as any));
        expect(err).toBeInstanceOf(DomainError);
        expect(err).toBeInstanceOf(Error);
      });
      it("should have correct properties", () => {
        const err = new cls(...(args as any));
        expect(err.code).toBe(code);
        expect(err.domain).toBe("booking");
        expect(err.message).toBe(msg);
        expect(err.details).toEqual(details);
        expect(err.name).toBe(cls.name);
      });
    });
  }

  describe("mapBookingError", () => {
    const notFoundErrors = [
      BookingNotFoundError,
      BookingRescheduleNotFoundError,
      BookingParticipantNotFoundError,
    ];
    const conflictErrors = [
      BookingConflictError,
      BookingAlreadyConfirmedError,
      BookingDuplicateHoldError,
      BookingStateTransitionError,
      BookingSeriesNoOptOutError,
    ];
    const badRequestErrors = [
      BookingNotEditableError,
      InsufficientMarksError,
      BookingNotAwaitingConfirmationError,
      BookingNotAwaitingReconfirmationError,
      BookingNotAwaitingReviewError,
      BookingCancellationDeadlinePassedError,
      BookingGroupSizeError,
      BookingSeriesSizeError,
      BookingParticipantAlreadyConfirmedError,
      BookingRescheduleNotPendingError,
      BookingRoomNotAssignedError,
      BookingHoldExpiredError,
      BookingExpiredError,
      BookingNoShowError,
      BookingCancelledError,
    ];

    for (const cls of notFoundErrors) {
      it(`should map ${cls.name} to NOT_FOUND`, () => {
        const err = Reflect.construct(cls, ["bk_1"]);
        expect(mapBookingError(err).status).toBe(404);
      });
    }

    it("should map BookingNotOwnedError to FORBIDDEN", () => {
      const err = new BookingNotOwnedError("bk_1", "u1");
      expect(mapBookingError(err).status).toBe(403);
    });

    for (const cls of conflictErrors) {
      it(`should map ${cls.name} to CONFLICT`, () => {
        const err = Reflect.construct(
          cls,
          cls === BookingConflictError
            ? ["t1", "s", "e"]
            : cls === BookingStateTransitionError
              ? ["f", "e", "t"]
              : ["bk_1"],
        );
        expect(mapBookingError(err).status).toBe(409);
      });
    }

    for (const cls of badRequestErrors) {
      it(`should map ${cls.name} to BAD_REQUEST`, () => {
        let err: any;
        if (cls === InsufficientMarksError) err = new cls(100, 50);
        else if (
          cls === BookingNotAwaitingConfirmationError ||
          cls === BookingNotAwaitingReconfirmationError ||
          cls === BookingNotAwaitingReviewError
        )
          err = new cls("bk_1", "draft");
        else if (
          cls === BookingGroupSizeError ||
          cls === BookingSeriesSizeError
        )
          err = new cls("bk_1", 1, 10);
        else err = new cls("bk_1");
        expect(mapBookingError(err).status).toBe(400);
      });
    }

    it("should map BookingTutorNotAssignedError to NOT_FOUND", () => {
      const err = new BookingTutorNotAssignedError("bk_1");
      expect(mapBookingError(err).status).toBe(404);
    });

    it("should fall back to INTERNAL_SERVER_ERROR for unknown domain error", () => {
      const result = mapBookingError(new TestDomainError());
      expect(result.status).toBe(500);
    });
  });
});
