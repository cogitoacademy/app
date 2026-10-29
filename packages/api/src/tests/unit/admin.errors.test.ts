import { describe, test, expect } from "bun:test";
import {
  UserNotFoundError,
  LastAdminError,
  OptimisticLockError,
  TutorPayoutNotAvailableError,
  WalletNotFoundError,
  EconomyCompetitionNotInCatalogError,
  mapAdminError,
} from "../../modules/admin/admin.errors";
import {
  TutorPayoutNotFoundError,
  TutorPayoutTaxProfileIncompleteError,
} from "../../modules/booking/booking.errors";
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
    test("maps economy competition catalog violations to BAD_REQUEST", () => {
      const err = new EconomyCompetitionNotInCatalogError("unlisted");
      expect(err.details).toEqual({ slug: "unlisted" });
      expect(mapAdminError(err).status).toBe(400);
    });

    test("maps unavailable tutor payouts to NOT_FOUND", () => {
      const err = new TutorPayoutNotAvailableError("t1");
      expect(err.details).toEqual({ tutorId: "t1" });
      expect(mapAdminError(err).status).toBe(400);
    });
    test("maps UserNotFoundError to NOT_FOUND", () => {
      const err = new UserNotFoundError("u1");
      const result = mapAdminError(err);
      expect(result.status).toBe(404);
    });

    test("maps missing wallets and payouts to NOT_FOUND", () => {
      expect(mapAdminError(new WalletNotFoundError("u1")).status).toBe(404);
      expect(mapAdminError(new TutorPayoutNotFoundError("p1")).status).toBe(
        404,
      );
    });

    test("maps incomplete tutor payout profiles to BAD_REQUEST", () => {
      expect(
        mapAdminError(new TutorPayoutTaxProfileIncompleteError("t1")).status,
      ).toBe(400);
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
