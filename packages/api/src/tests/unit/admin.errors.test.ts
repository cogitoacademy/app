import { describe, test, expect } from "bun:test";
import {
  UserNotFoundError,
  LastAdminError,
  OptimisticLockError,
  mapAdminError,
} from "../../modules/admin/admin.errors";
import { DomainError } from "../../lib/domain-errors";

describe("admin.errors", () => {
  describe("UserNotFoundError", () => {
    test("is instance of DomainError", () => {
      const err = new UserNotFoundError("u1");
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(UserNotFoundError);
      expect(err.domain).toBe("admin");
      expect(err.code).toBe("USER_NOT_FOUND");
      expect(err.message).toBe("User not found");
      expect(err.details).toEqual({ id: "u1" });
    });
  });

  describe("LastAdminError", () => {
    test("is instance of DomainError", () => {
      const err = new LastAdminError("u1");
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(LastAdminError);
      expect(err.domain).toBe("admin");
      expect(err.code).toBe("LAST_ADMIN");
      expect(err.message).toBe("Cannot remove the last admin");
      expect(err.details).toEqual({ id: "u1" });
    });
  });

  describe("OptimisticLockError", () => {
    test("is instance of DomainError", () => {
      const err = new OptimisticLockError("u1", "admin");
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(OptimisticLockError);
      expect(err.domain).toBe("admin");
      expect(err.code).toBe("OPTIMISTIC_LOCK");
      expect(err.message).toBe("Resource was modified by another transaction");
      expect(err.details).toEqual({ id: "u1", expectedRole: "admin" });
    });
  });

  describe("mapAdminError", () => {
    test("maps UserNotFoundError to NOT_FOUND", () => {
      const err = new UserNotFoundError("u1");
      const result = mapAdminError(err);
      expect(result.status).toBe(404);
    });

    test("maps LastAdminError to CONFLICT", () => {
      const err = new LastAdminError("u1");
      const result = mapAdminError(err);
      expect(result.status).toBe(409);
    });

    test("maps OptimisticLockError to CONFLICT", () => {
      const err = new OptimisticLockError("u1", "admin");
      const result = mapAdminError(err);
      expect(result.status).toBe(409);
    });

    test("maps unknown DomainError to INTERNAL_SERVER_ERROR", () => {
      const err = new DomainError("UNKNOWN", "unknown error", {});
      const result = mapAdminError(err);
      expect(result.status).toBe(500);
    });
  });
});
