import { describe, it, expect } from "bun:test";
import { DomainError } from "../../lib/domain-errors";
import {
  InviteNotFoundError,
  InviteEmailMismatchError,
  ProfileAlreadyExistsError,
  mapInviteError,
} from "../../modules/invite/invite.errors";

class TestDomainError extends DomainError {
  readonly domain = "test";
  constructor() {
    super("TEST_ERROR", "Test error");
  }
}

describe("invite.errors", () => {
  describe("InviteNotFoundError", () => {
    it("should be instance of DomainError", () => {
      const err = new InviteNotFoundError("inv_1");
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(Error);
    });
    it("should have correct properties", () => {
      const err = new InviteNotFoundError("inv_1");
      expect(err.code).toBe("INVITE_NOT_FOUND");
      expect(err.domain).toBe("invite");
      expect(err.message).toBe("Invite not found");
      expect(err.details).toEqual({ id: "inv_1" });
      expect(err.name).toBe("InviteNotFoundError");
    });
  });
  describe("InviteEmailMismatchError", () => {
    it("should be instance of DomainError", () => {
      const err = new InviteEmailMismatchError("inv_1", "a@b.c");
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(Error);
    });
    it("should have correct properties", () => {
      const err = new InviteEmailMismatchError("inv_1", "a@b.c");
      expect(err.code).toBe("INVITE_EMAIL_MISMATCH");
      expect(err.domain).toBe("invite");
      expect(err.message).toBe("Email does not match the invite");
      expect(err.details).toEqual({ id: "inv_1", email: "a@b.c" });
      expect(err.name).toBe("InviteEmailMismatchError");
    });
  });
  describe("ProfileAlreadyExistsError", () => {
    it("should be instance of DomainError", () => {
      const err = new ProfileAlreadyExistsError("a@b.c");
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(Error);
    });
    it("should have correct properties", () => {
      const err = new ProfileAlreadyExistsError("a@b.c");
      expect(err.code).toBe("PROFILE_ALREADY_EXISTS");
      expect(err.domain).toBe("invite");
      expect(err.message).toBe("A profile already exists for this email");
      expect(err.details).toEqual({ email: "a@b.c" });
      expect(err.name).toBe("ProfileAlreadyExistsError");
    });
  });
  describe("mapInviteError", () => {
    it("should map InviteNotFoundError to NOT_FOUND", () => {
      const result = mapInviteError(new InviteNotFoundError("inv_1"));
      expect(result.status).toBe(404);
    });
    it("should map InviteEmailMismatchError to BAD_REQUEST", () => {
      const result = mapInviteError(
        new InviteEmailMismatchError("inv_1", "a@b.c"),
      );
      expect(result.status).toBe(400);
    });
    it("should map ProfileAlreadyExistsError to CONFLICT", () => {
      const result = mapInviteError(new ProfileAlreadyExistsError("a@b.c"));
      expect(result.status).toBe(409);
    });
    it("should fall back to INTERNAL_SERVER_ERROR for unknown domain error", () => {
      const result = mapInviteError(new TestDomainError());
      expect(result.status).toBe(500);
    });
  });
});
