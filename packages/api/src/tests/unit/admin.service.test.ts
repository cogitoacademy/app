import { describe, test, expect, mock } from "bun:test";
import {
  validateRoleChange,
  createAdminService,
  type TargetUser,
} from "../../modules/admin/admin.service";
import {
  UserNotFoundError,
  LastAdminError,
  WalletNotFoundError,
  InvalidLedgerFilterError,
} from "../../modules/admin/admin.errors";

function makeTarget(overrides: Partial<TargetUser> = {}): TargetUser {
  return { id: "u1", role: "student", ...overrides };
}

describe("Admin Service", () => {
  describe("validateRoleChange", () => {
    test("returns previousRole for changing student to tutor", () => {
      const result = validateRoleChange(
        makeTarget({ role: "student" }),
        "tutor",
        2,
        "u1",
      );
      expect(result.previousRole).toBe("student");
    });

    test("returns previousRole for changing tutor to student", () => {
      const result = validateRoleChange(
        makeTarget({ role: "tutor" }),
        "student",
        2,
        "u1",
      );
      expect(result.previousRole).toBe("tutor");
    });

    test("returns previousRole for changing admin to admin (no change)", () => {
      const result = validateRoleChange(
        makeTarget({ role: "admin" }),
        "admin",
        1,
        "u1",
      );
      expect(result.previousRole).toBe("admin");
    });

    test("throws UserNotFoundError for null target", () => {
      expect(() => validateRoleChange(null, "tutor", 2, "u1")).toThrow(
        UserNotFoundError,
      );
    });

    test("throws LastAdminError when demoting last admin", () => {
      expect(() =>
        validateRoleChange(makeTarget({ role: "admin" }), "student", 1, "u1"),
      ).toThrow(LastAdminError);
    });

    test("returns previousRole when demoting admin with other admins present", () => {
      const result = validateRoleChange(
        makeTarget({ role: "admin" }),
        "student",
        3,
        "u1",
      );
      expect(result.previousRole).toBe("admin");
    });
  });

  describe("getWallet", () => {
    function makeService(wallet: any) {
      return createAdminService({
        adminRepo: {} as any,
        auditPort: {} as any,
        db: {} as any,
        wallet,
      });
    }

    test("returns wallet snapshot for a user", async () => {
      const wallet = {
        getByUserId: mock(async () => ({
          id: "w1",
          totalBalance: 100,
          heldBalance: 30,
          availableBalance: 70,
        })),
        listLedger: mock(async () => ({ items: [], nextCursor: null })),
      };
      const service = makeService(wallet);
      const result = await service.getWallet({ userId: "u1" });
      expect(result).toEqual({
        id: "w1",
        totalBalance: 100,
        heldBalance: 30,
        availableBalance: 70,
      });
    });

    test("throws WalletNotFoundError when user has no wallet", async () => {
      const wallet = {
        getByUserId: mock(async () => null),
        listLedger: mock(async () => ({ items: [], nextCursor: null })),
      };
      const service = makeService(wallet);
      try {
        await service.getWallet({ userId: "missing" });
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e).toBeInstanceOf(WalletNotFoundError);
      }
    });
  });

  describe("listLedgerEntries", () => {
    function makeService(wallet: any) {
      return createAdminService({
        adminRepo: {} as any,
        auditPort: {} as any,
        db: {} as any,
        wallet,
      });
    }

    test("resolves userId to wallet and lists ledger entries", async () => {
      const wallet = {
        getByUserId: mock(async () => ({
          id: "w1",
          totalBalance: 0,
          heldBalance: 0,
          availableBalance: 0,
        })),
        listLedger: mock(async () => ({
          items: [{ id: "l1", walletId: "w1" }],
          nextCursor: null,
        })),
      };
      const service = makeService(wallet);
      const result = await service.listLedgerEntries({ userId: "u1" });
      expect(wallet.getByUserId).toHaveBeenCalledWith(expect.anything(), "u1");
      expect(wallet.listLedger).toHaveBeenCalledWith("w1", {
        limit: undefined,
        cursor: undefined,
        bookingId: undefined,
        entryType: undefined,
        dateFrom: undefined,
        dateTo: undefined,
      });
      expect(result.items).toEqual([{ id: "l1", walletId: "w1" }]);
    });

    test("throws InvalidLedgerFilterError when both walletId and userId given", async () => {
      const wallet = {
        getByUserId: mock(async () => null),
        listLedger: mock(async () => ({ items: [], nextCursor: null })),
      };
      const service = makeService(wallet);
      try {
        await service.listLedgerEntries({ walletId: "w1", userId: "u1" });
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e).toBeInstanceOf(InvalidLedgerFilterError);
      }
    });

    test("throws InvalidLedgerFilterError when neither walletId nor userId given", async () => {
      const wallet = {
        getByUserId: mock(async () => null),
        listLedger: mock(async () => ({ items: [], nextCursor: null })),
      };
      const service = makeService(wallet);
      try {
        await service.listLedgerEntries({});
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e).toBeInstanceOf(InvalidLedgerFilterError);
      }
    });

    test("throws WalletNotFoundError when userId has no wallet", async () => {
      const wallet = {
        getByUserId: mock(async () => null),
        listLedger: mock(async () => ({ items: [], nextCursor: null })),
      };
      const service = makeService(wallet);
      try {
        await service.listLedgerEntries({ userId: "missing" });
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e).toBeInstanceOf(WalletNotFoundError);
      }
    });

    test("rejects invalid date filters", async () => {
      const wallet = {
        getByUserId: mock(async () => null),
        listLedger: mock(async () => ({ items: [], nextCursor: null })),
      };
      const service = makeService(wallet);
      try {
        await service.listLedgerEntries({
          walletId: "w1",
          dateFrom: "not-a-date",
        });
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e).toBeInstanceOf(InvalidLedgerFilterError);
      }
    });

    test("rejects dateFrom after dateTo", async () => {
      const wallet = {
        getByUserId: mock(async () => null),
        listLedger: mock(async () => ({ items: [], nextCursor: null })),
      };
      const service = makeService(wallet);
      try {
        await service.listLedgerEntries({
          walletId: "w1",
          dateFrom: "2026-01-02T00:00:00.000Z",
          dateTo: "2026-01-01T00:00:00.000Z",
        });
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e).toBeInstanceOf(InvalidLedgerFilterError);
      }
    });
  });
});
