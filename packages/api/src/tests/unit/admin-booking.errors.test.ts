import { describe, it, expect } from "bun:test";
import { DomainError } from "../../lib/domain-errors";
import {
  BookingNotFoundError,
  TerminalStateOverrideError,
  InvalidRefundStateError,
  BookingOverrideConflictError,
  OverrideMarksParticipantsRequiredError,
  mapAdminBookingError,
} from "../../modules/admin-booking/admin-booking.errors";

class TestDomainError extends DomainError {
  readonly domain = "test";
  constructor() {
    super("TEST_ERROR", "Test error");
  }
}

describe("admin-booking.errors", () => {
  describe("BookingNotFoundError", () => {
    it("should be instance of DomainError", () => {
      const err = new BookingNotFoundError("bk_1");
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(Error);
    });
    it("should have correct properties", () => {
      const err = new BookingNotFoundError("bk_1");
      expect(err.code).toBe("ADMIN_BOOKING_NOT_FOUND");
      expect(err.domain).toBe("admin-booking");
      expect(err.message).toBe("Booking not found");
      expect(err.details).toEqual({ id: "bk_1" });
      expect(err.name).toBe("BookingNotFoundError");
    });
  });
  describe("TerminalStateOverrideError", () => {
    it("should be instance of DomainError", () => {
      const err = new TerminalStateOverrideError("bk_1", "completed");
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(Error);
    });
    it("should have correct properties", () => {
      const err = new TerminalStateOverrideError("bk_1", "completed");
      expect(err.code).toBe("TERMINAL_STATE_OVERRIDE");
      expect(err.domain).toBe("admin-booking");
      expect(err.message).toBe("Cannot override a booking in terminal state");
      expect(err.details).toEqual({ id: "bk_1", status: "completed" });
      expect(err.name).toBe("TerminalStateOverrideError");
    });
  });
  describe("InvalidRefundStateError", () => {
    it("should be instance of DomainError", () => {
      const err = new InvalidRefundStateError("bk_1", "cancelled");
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(Error);
    });
    it("should have correct properties", () => {
      const err = new InvalidRefundStateError("bk_1", "cancelled");
      expect(err.code).toBe("INVALID_REFUND_STATE");
      expect(err.domain).toBe("admin-booking");
      expect(err.message).toBe("Invalid refund state for this action");
      expect(err.details).toEqual({ id: "bk_1", status: "cancelled" });
      expect(err.name).toBe("InvalidRefundStateError");
    });
  });
  describe("OverrideMarksParticipantsRequiredError", () => {
    it("should be instance of DomainError", () => {
      const err = new OverrideMarksParticipantsRequiredError("bk_1");
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(Error);
    });
    it("should have correct properties", () => {
      const err = new OverrideMarksParticipantsRequiredError("bk_1");
      expect(err.code).toBe("OVERRIDE_MARKS_PARTICIPANTS_REQUIRED");
      expect(err.domain).toBe("admin-booking");
      expect(err.details).toEqual({ id: "bk_1" });
      expect(err.name).toBe("OverrideMarksParticipantsRequiredError");
    });
  });
  describe("BookingOverrideConflictError", () => {
    it("should expose the concurrent-update details", () => {
      const err = new BookingOverrideConflictError("bk_1");
      expect(err).toBeInstanceOf(DomainError);
      expect(err.code).toBe("BOOKING_OVERRIDE_CONFLICT");
      expect(err.domain).toBe("admin-booking");
      expect(err.message).toBe("Booking changed concurrently");
      expect(err.details).toEqual({ id: "bk_1" });
    });
  });
  describe("mapAdminBookingError", () => {
    it("should map BookingNotFoundError to NOT_FOUND", () => {
      const result = mapAdminBookingError(new BookingNotFoundError("bk_1"));
      expect(result.status).toBe(404);
    });
    it("should map TerminalStateOverrideError to CONFLICT", () => {
      const result = mapAdminBookingError(
        new TerminalStateOverrideError("bk_1", "completed"),
      );
      expect(result.status).toBe(409);
    });
    it("should map InvalidRefundStateError to BAD_REQUEST", () => {
      const result = mapAdminBookingError(
        new InvalidRefundStateError("bk_1", "cancelled"),
      );
      expect(result.status).toBe(400);
    });
    it("should map OverrideMarksParticipantsRequiredError to BAD_REQUEST", () => {
      const result = mapAdminBookingError(
        new OverrideMarksParticipantsRequiredError("bk_1"),
      );
      expect(result.status).toBe(400);
    });
    it("should fall back to INTERNAL_SERVER_ERROR for unknown domain error", () => {
      const result = mapAdminBookingError(new TestDomainError());
      expect(result.status).toBe(500);
    });
  });
});
