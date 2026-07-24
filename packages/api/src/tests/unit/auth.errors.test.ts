import { describe, it, expect } from "bun:test";
import { DomainError } from "../../lib/domain-errors";
import {
  ProfileNotFoundError,
  ValidationRequiredError,
  mapAuthError,
} from "../../modules/auth/auth.errors";

class TestDomainError extends DomainError {
  readonly domain = "test";
  constructor() {
    super("TEST_ERROR", "Test error");
  }
}

describe("auth.errors", () => {
  describe("ProfileNotFoundError", () => {
    it("should be instance of DomainError", () => {
      const err = new ProfileNotFoundError("usr_1");
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(Error);
    });
    it("should have correct properties", () => {
      const err = new ProfileNotFoundError("usr_1");
      expect(err.code).toBe("PROFILE_NOT_FOUND");
      expect(err.domain).toBe("auth");
      expect(err.message).toBe("Profile not found");
      expect(err.details).toEqual({ userId: "usr_1" });
      expect(err.name).toBe("ProfileNotFoundError");
    });
  });
  describe("ValidationRequiredError", () => {
    it("should be instance of DomainError", () => {
      const err = new ValidationRequiredError("usr_1");
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(Error);
    });
    it("should have correct properties", () => {
      const err = new ValidationRequiredError("usr_1");
      expect(err.code).toBe("VALIDATION_REQUIRED");
      expect(err.domain).toBe("auth");
      expect(err.message).toBe("Account validation required");
      expect(err.details).toEqual({ userId: "usr_1" });
      expect(err.name).toBe("ValidationRequiredError");
    });
  });
  describe("mapAuthError", () => {
    it("should map ProfileNotFoundError to NOT_FOUND", () => {
      const result = mapAuthError(new ProfileNotFoundError("usr_1"));
      expect(result.status).toBe(404);
    });
    it("should map ValidationRequiredError to BAD_REQUEST", () => {
      const result = mapAuthError(new ValidationRequiredError("usr_1"));
      expect(result.status).toBe(400);
    });
    it("should fall back to INTERNAL_SERVER_ERROR for unknown domain error", () => {
      const result = mapAuthError(new TestDomainError());
      expect(result.status).toBe(500);
    });
  });
});
