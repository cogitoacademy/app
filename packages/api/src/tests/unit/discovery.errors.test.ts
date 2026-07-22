import { describe, it, expect } from "bun:test";
import { DomainError } from "../../lib/domain-errors";
import {
  TutorProfileNotFoundError,
  mapDiscoveryError,
} from "../../modules/tutor-discovery/discovery.errors";

class TestDomainError extends DomainError {
  readonly domain = "test";
  constructor() {
    super("TEST_ERROR", "Test error");
  }
}

describe("discovery.errors", () => {
  describe("TutorProfileNotFoundError", () => {
    it("should be instance of DomainError", () => {
      const err = new TutorProfileNotFoundError("tp_1");
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(Error);
    });
    it("should have correct properties", () => {
      const err = new TutorProfileNotFoundError("tp_1");
      expect(err.code).toBe("DISCOVERY_TUTOR_NOT_FOUND");
      expect(err.domain).toBe("discovery");
      expect(err.message).toBe("Tutor profile not found");
      expect(err.details).toEqual({ id: "tp_1" });
      expect(err.name).toBe("TutorProfileNotFoundError");
    });
  });
  describe("mapDiscoveryError", () => {
    it("should map TutorProfileNotFoundError to NOT_FOUND", () => {
      const result = mapDiscoveryError(new TutorProfileNotFoundError("tp_1"));
      expect(result.status).toBe(404);
    });
    it("should fall back to INTERNAL_SERVER_ERROR for unknown domain error", () => {
      const result = mapDiscoveryError(new TestDomainError());
      expect(result.status).toBe(500);
    });
  });
});
