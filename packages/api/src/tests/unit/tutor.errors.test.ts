import { describe, it, expect } from "bun:test";
import { DomainError } from "../../lib/domain-errors";
import {
  TutorProfileNotFoundError,
  TutorProfileNotEditableError,
  InvalidTutorStatusError,
  AvailabilitySlotOverlapError,
  TutorProfileIncompleteError,
  InvalidTutorPricingError,
  InvalidDateRangeError,
  mapTutorError,
} from "../../modules/tutor/tutor.errors";

class TestDomainError extends DomainError {
  readonly domain = "test";
  constructor() {
    super("TEST_ERROR", "Test error");
  }
}

describe("tutor.errors", () => {
  describe("TutorProfileNotFoundError", () => {
    it("should be instance of DomainError", () => {
      const err = new TutorProfileNotFoundError("tp_1");
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(Error);
    });
    it("should have correct properties", () => {
      const err = new TutorProfileNotFoundError("tp_1");
      expect(err.code).toBe("TUTOR_PROFILE_NOT_FOUND");
      expect(err.domain).toBe("tutor");
      expect(err.message).toBe("Tutor profile not found");
      expect(err.details).toEqual({ id: "tp_1" });
      expect(err.name).toBe("TutorProfileNotFoundError");
    });
  });
  describe("TutorProfileNotEditableError", () => {
    it("should be instance of DomainError", () => {
      const err = new TutorProfileNotEditableError("tp_1", "pending");
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(Error);
    });
    it("should have correct properties", () => {
      const err = new TutorProfileNotEditableError("tp_1", "pending");
      expect(err.code).toBe("TUTOR_PROFILE_NOT_EDITABLE");
      expect(err.domain).toBe("tutor");
      expect(err.message).toBe("Tutor profile is not editable");
      expect(err.details).toEqual({ id: "tp_1", status: "pending" });
      expect(err.name).toBe("TutorProfileNotEditableError");
    });
  });
  describe("InvalidTutorStatusError", () => {
    it("should be instance of DomainError", () => {
      const err = new InvalidTutorStatusError("tp_1", "pending");
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(Error);
    });
    it("should have correct properties", () => {
      const err = new InvalidTutorStatusError("tp_1", "pending");
      expect(err.code).toBe("INVALID_TUTOR_STATUS");
      expect(err.domain).toBe("tutor");
      expect(err.message).toBe("Invalid tutor status for this action");
      expect(err.details).toEqual({ id: "tp_1", status: "pending" });
      expect(err.name).toBe("InvalidTutorStatusError");
    });
  });
  describe("AvailabilitySlotOverlapError", () => {
    it("should be instance of DomainError", () => {
      const err = new AvailabilitySlotOverlapError("tp_1");
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(Error);
    });
    it("should have correct properties", () => {
      const err = new AvailabilitySlotOverlapError("tp_1");
      expect(err.code).toBe("AVAILABILITY_SLOT_OVERLAP");
      expect(err.domain).toBe("tutor");
      expect(err.message).toBe("Availability slot overlaps with existing slot");
      expect(err.details).toEqual({ tutorId: "tp_1" });
      expect(err.name).toBe("AvailabilitySlotOverlapError");
    });
  });
  describe("TutorProfileIncompleteError", () => {
    it("should be instance of DomainError", () => {
      const err = new TutorProfileIncompleteError("tp_1", [
        "displayName",
        "prices",
      ]);
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(Error);
    });
    it("should have correct properties", () => {
      const err = new TutorProfileIncompleteError("tp_1", [
        "displayName",
        "prices",
      ]);
      expect(err.code).toBe("TUTOR_PROFILE_INCOMPLETE");
      expect(err.domain).toBe("tutor");
      expect(err.message).toBe(
        "All required fields must be filled before submission",
      );
      expect(err.details).toEqual({
        id: "tp_1",
        missingFields: ["displayName", "prices"],
      });
      expect(err.name).toBe("TutorProfileIncompleteError");
    });
  });
  describe("InvalidTutorPricingError", () => {
    it("should be instance of DomainError", () => {
      const err = new InvalidTutorPricingError("tp_1", "Prices are invalid");
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(Error);
    });
    it("should have correct properties", () => {
      const err = new InvalidTutorPricingError("tp_1", "Prices are invalid");
      expect(err.code).toBe("INVALID_TUTOR_PRICING");
      expect(err.domain).toBe("tutor");
      expect(err.message).toBe("Tutor pricing validation failed");
      expect(err.details).toEqual({
        id: "tp_1",
        pricingError: "Prices are invalid",
      });
      expect(err.name).toBe("InvalidTutorPricingError");
    });
  });
  describe("mapTutorError", () => {
    it("should map TutorProfileNotFoundError to NOT_FOUND", () => {
      const result = mapTutorError(new TutorProfileNotFoundError("tp_1"));
      expect(result.status).toBe(404);
    });
    it("should map TutorProfileNotEditableError to BAD_REQUEST", () => {
      const result = mapTutorError(
        new TutorProfileNotEditableError("tp_1", "pending"),
      );
      expect(result.status).toBe(400);
    });
    it("should map InvalidTutorStatusError to CONFLICT", () => {
      const result = mapTutorError(
        new InvalidTutorStatusError("tp_1", "pending"),
      );
      expect(result.status).toBe(409);
    });
    it("should map AvailabilitySlotOverlapError to CONFLICT", () => {
      const result = mapTutorError(new AvailabilitySlotOverlapError("tp_1"));
      expect(result.status).toBe(409);
    });
    it("should map TutorProfileIncompleteError to BAD_REQUEST", () => {
      const result = mapTutorError(
        new TutorProfileIncompleteError("tp_1", ["displayName"]),
      );
      expect(result.status).toBe(400);
    });
    it("should map InvalidTutorPricingError to BAD_REQUEST", () => {
      const result = mapTutorError(
        new InvalidTutorPricingError("tp_1", "Prices are invalid"),
      );
      expect(result.status).toBe(400);
    });
    it("should fall back to INTERNAL_SERVER_ERROR for unknown domain error", () => {
      const result = mapTutorError(new TestDomainError());
      expect(result.status).toBe(500);
    });

    it("maps InvalidDateRangeError to BAD_REQUEST", () => {
      const err = new InvalidDateRangeError("dateFrom");
      expect(err.details).toEqual({ field: "dateFrom" });
      expect(mapTutorError(err).status).toBe(400);
    });
  });
});
