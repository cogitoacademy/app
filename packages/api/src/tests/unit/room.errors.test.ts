import { describe, it, expect } from "bun:test";
import { DomainError } from "../../lib/domain-errors";
import {
  RoomNotFoundError,
  RoomBookingConflictError,
  RoomBookingStateError,
  mapRoomError,
} from "../../modules/room/room.errors";

class TestDomainError extends DomainError {
  readonly domain = "test";
  constructor() {
    super("TEST_ERROR", "Test error");
  }
}

describe("room.errors", () => {
  describe("RoomNotFoundError", () => {
    it("should be instance of DomainError", () => {
      const err = new RoomNotFoundError("rm_1");
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(Error);
    });
    it("should have correct properties", () => {
      const err = new RoomNotFoundError("rm_1");
      expect(err.code).toBe("ROOM_NOT_FOUND");
      expect(err.domain).toBe("room");
      expect(err.message).toBe("Room not found");
      expect(err.details).toEqual({ id: "rm_1" });
      expect(err.name).toBe("RoomNotFoundError");
    });
  });
  describe("RoomBookingConflictError", () => {
    it("should be instance of DomainError", () => {
      const err = new RoomBookingConflictError(
        "rm_1",
        "2025-01-01",
        "2025-01-02",
      );
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(Error);
    });
    it("should have correct properties", () => {
      const err = new RoomBookingConflictError(
        "rm_1",
        "2025-01-01",
        "2025-01-02",
      );
      expect(err.code).toBe("ROOM_BOOKING_CONFLICT");
      expect(err.domain).toBe("room");
      expect(err.message).toBe("Room is already booked for this time slot");
      expect(err.details).toEqual({
        roomId: "rm_1",
        startAt: "2025-01-01",
        endAt: "2025-01-02",
      });
      expect(err.name).toBe("RoomBookingConflictError");
    });
  });
  describe("RoomBookingStateError", () => {
    it("should be instance of DomainError", () => {
      const err = new RoomBookingStateError("b_1", "confirmed");
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(Error);
    });
    it("should have correct properties", () => {
      const err = new RoomBookingStateError("b_1", "confirmed");
      expect(err.code).toBe("ROOM_BOOKING_STATE");
      expect(err.domain).toBe("room");
      expect(err.message).toBe(
        "Room assignment requires the booking to be awaiting admin room approval",
      );
      expect(err.details).toEqual({
        bookingId: "b_1",
        currentState: "confirmed",
      });
      expect(err.name).toBe("RoomBookingStateError");
    });
  });
  describe("mapRoomError", () => {
    it("should map RoomNotFoundError to NOT_FOUND", () => {
      const result = mapRoomError(new RoomNotFoundError("rm_1"));
      expect(result.status).toBe(404);
    });
    it("should map RoomBookingConflictError to CONFLICT", () => {
      const result = mapRoomError(
        new RoomBookingConflictError("rm_1", "2025-01-01", "2025-01-02"),
      );
      expect(result.status).toBe(409);
    });
    it("should map RoomBookingStateError to CONFLICT", () => {
      const result = mapRoomError(
        new RoomBookingStateError("b_1", "confirmed"),
      );
      expect(result.status).toBe(409);
    });
    it("should fall back to INTERNAL_SERVER_ERROR for unknown domain error", () => {
      const result = mapRoomError(new TestDomainError());
      expect(result.status).toBe(500);
    });
  });
});
