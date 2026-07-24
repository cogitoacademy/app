import { describe, it, expect } from "bun:test";
import { DomainError } from "../../lib/domain-errors";
import {
  UserNotFoundError,
  LastAdminError,
  mapAdminError,
} from "../../modules/admin/admin.errors";

class TestDomainError extends DomainError {
  readonly domain = "test";
  constructor() {
    super("TEST_ERROR", "Test error");
  }
}

describe("admin.errors", () => {
  describe("UserNotFoundError", () => {
    it("should be instance of DomainError", () => {
      const err = new UserNotFoundError("usr_1");
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(Error);
    });
    it("should have correct properties", () => {
      const err = new UserNotFoundError("usr_1");
      expect(err.code).toBe("USER_NOT_FOUND");
      expect(err.domain).toBe("admin");
      expect(err.message).toBe("User not found");
      expect(err.details).toEqual({ id: "usr_1" });
      expect(err.name).toBe("UserNotFoundError");
    });
  });
  describe("LastAdminError", () => {
    it("should be instance of DomainError", () => {
      const err = new LastAdminError("usr_1");
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(Error);
    });
    it("should have correct properties", () => {
      const err = new LastAdminError("usr_1");
      expect(err.code).toBe("LAST_ADMIN");
      expect(err.domain).toBe("admin");
      expect(err.message).toBe("Cannot remove the last admin");
      expect(err.details).toEqual({ id: "usr_1" });
      expect(err.name).toBe("LastAdminError");
    });
  });
  describe("mapAdminError", () => {
    it("should map UserNotFoundError to NOT_FOUND", () => {
      const err = new UserNotFoundError("usr_1");
      const result = mapAdminError(err);
      expect(result.status).toBe(404);
    });
    it("should map LastAdminError to CONFLICT", () => {
      const err = new LastAdminError("usr_1");
      const result = mapAdminError(err);
      expect(result.status).toBe(409);
    });
    it("should fall back to INTERNAL_SERVER_ERROR for unknown domain error", () => {
      const err = new TestDomainError();
      const result = mapAdminError(err);
      expect(result.status).toBe(500);
    });
  });
});
