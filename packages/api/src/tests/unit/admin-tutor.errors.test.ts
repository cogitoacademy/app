import { describe, it, expect } from "bun:test";
import { DomainError } from "../../lib/domain-errors";
import {
  InviteNotFoundError,
  TutorProfileNotFoundError,
  InvalidInviteActionError,
  mapAdminTutorError,
} from "../../modules/admin-tutor/admin-tutor.errors";

class TestDomainError extends DomainError {
  readonly domain = "test";
  constructor() {
    super("TEST_ERROR", "Test error");
  }
}

describe("admin-tutor.errors", () => {
  describe("InviteNotFoundError", () => {
    it("should be instance of DomainError", () => {
      const err = new InviteNotFoundError("inv_1");
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(Error);
    });
    it("should have correct properties", () => {
      const err = new InviteNotFoundError("inv_1");
      expect(err.code).toBe("INVITE_NOT_FOUND");
      expect(err.domain).toBe("admin-tutor");
      expect(err.message).toBe("Invite not found");
      expect(err.details).toEqual({ id: "inv_1" });
      expect(err.name).toBe("InviteNotFoundError");
    });
  });
  describe("TutorProfileNotFoundError", () => {
    it("should be instance of DomainError", () => {
      const err = new TutorProfileNotFoundError("tp_1");
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(Error);
    });
    it("should have correct properties", () => {
      const err = new TutorProfileNotFoundError("tp_1");
      expect(err.code).toBe("TUTOR_PROFILE_NOT_FOUND");
      expect(err.domain).toBe("admin-tutor");
      expect(err.message).toBe("Tutor profile not found");
      expect(err.details).toEqual({ id: "tp_1" });
      expect(err.name).toBe("TutorProfileNotFoundError");
    });
  });
  describe("InvalidInviteActionError", () => {
    it("should be instance of DomainError", () => {
      const err = new InvalidInviteActionError("inv_1", "resend");
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(Error);
    });
    it("should have correct properties", () => {
      const err = new InvalidInviteActionError("inv_1", "resend");
      expect(err.code).toBe("INVALID_INVITE_ACTION");
      expect(err.domain).toBe("admin-tutor");
      expect(err.message).toBe("Invalid action for this invite");
      expect(err.details).toEqual({ id: "inv_1", action: "resend" });
      expect(err.name).toBe("InvalidInviteActionError");
    });
  });
  describe("mapAdminTutorError", () => {
    it("should map InviteNotFoundError to NOT_FOUND", () => {
      const result = mapAdminTutorError(new InviteNotFoundError("inv_1"));
      expect(result.status).toBe(404);
    });
    it("should map TutorProfileNotFoundError to NOT_FOUND", () => {
      const result = mapAdminTutorError(new TutorProfileNotFoundError("tp_1"));
      expect(result.status).toBe(404);
    });
    it("should map InvalidInviteActionError to CONFLICT", () => {
      const result = mapAdminTutorError(
        new InvalidInviteActionError("inv_1", "resend"),
      );
      expect(result.status).toBe(409);
    });
    it("should fall back to INTERNAL_SERVER_ERROR for unknown domain error", () => {
      const result = mapAdminTutorError(new TestDomainError());
      expect(result.status).toBe(500);
    });
  });
});
