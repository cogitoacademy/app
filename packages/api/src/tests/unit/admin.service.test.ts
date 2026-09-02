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
  EconomyConfigConflictError,
  TutorPayoutNotAvailableError,
} from "../../modules/admin/admin.errors";

function makeTarget(overrides: Partial<TargetUser> = {}): TargetUser {
  return { id: "u1", role: "student", ...overrides };
}

describe("Admin Service", () => {
  describe("dashboard analytics", () => {
    test("normalizes aggregate rows and fills missing WIB days", async () => {
      const repo = {
        getDashboardAnalytics: mock(async () => ({
          bookingSummary: {
            bookings: "4",
            completed: "2",
            exceptions: "1",
            activeLearners: "3",
            grossMarks: "120",
            platformTakeMarks: "24",
          },
          userSummary: { newStudents: "3", newTutors: "1" },
          bookingTrend: [
            {
              date: "2026-08-31",
              bookings: "2",
              completed: "1",
              grossMarks: "60",
              platformTakeMarks: "12",
            },
          ],
          userTrend: [{ date: "2026-08-31", students: "3", tutors: "1" }],
          stateBreakdown: [{ state: "completed", count: "2" }],
          modalityBreakdown: [{ modality: "online", count: "4" }],
          categoryBreakdown: [
            { category: "Mathematics", bookings: "4", completed: "2" },
          ],
        })),
      };
      const service = createAdminService({
        adminRepo: repo as any,
        auditPort: {} as any,
        db: {} as any,
        wallet: {} as any,
        payout: {} as any,
      });

      const result = await service.getDashboardAnalytics("7d");

      expect(result.period).toBe("7d");
      expect(result.bookingTrend).toHaveLength(7);
      expect(result.bookingTrend.at(-1)).toEqual({
        date: expect.any(String),
        bookings: expect.any(Number),
        completed: expect.any(Number),
        grossMarks: expect.any(Number),
        platformTakeMarks: expect.any(Number),
      });
      expect(result.summary).toEqual({
        bookings: 4,
        completedBookings: 2,
        resolvedBookings: 3,
        completionRate: 66.7,
        activeLearners: 3,
        newStudents: 3,
        newTutors: 1,
        grossMarks: 120,
        platformTakeMarks: 24,
      });
      expect(result.bookingTrend.some((row) => row.bookings === 0)).toBe(true);
      expect(result.stateBreakdown).toEqual([{ state: "completed", count: 2 }]);
      expect(repo.getDashboardAnalytics).toHaveBeenCalledWith(
        expect.anything(),
        {
          periodStart: expect.any(Date),
          periodEnd: expect.any(Date),
        },
      );
    });

    test("uses the 30-day period by default", async () => {
      const repo = {
        getDashboardAnalytics: mock(async () => ({
          bookingSummary: {},
          userSummary: {},
          bookingTrend: [],
          userTrend: [],
          stateBreakdown: [],
          modalityBreakdown: [],
          categoryBreakdown: [],
        })),
      };
      const service = createAdminService({
        adminRepo: repo as any,
        auditPort: {} as any,
        db: {} as any,
        wallet: {} as any,
        payout: {} as any,
      });

      const result = await service.getDashboardAnalytics();

      expect(result.period).toBe("30d");
      expect(result.bookingTrend).toHaveLength(30);
      expect(result.summary.completionRate).toBe(0);
    });
  });

  describe("tutor payout settlement", () => {
    const makeService = (
      payout: any,
      auditPort = { record: mock(async () => {}) },
    ) => ({
      service: createAdminService({
        adminRepo: {} as any,
        auditPort,
        db: {} as any,
        wallet: {} as any,
        payout,
      }),
      auditPort,
    });

    test("returns pending payout data and rejects an unavailable port", async () => {
      const payout = {
        getPendingTutorPayouts: mock(async () => ({ tutorId: "t1" })),
      };
      await expect(
        makeService(payout).service.getPendingTutorPayouts({ tutorId: "t1" }),
      ).resolves.toEqual({ tutorId: "t1" });
      await expect(
        makeService({}).service.getPendingTutorPayouts({ tutorId: "t1" }),
      ).rejects.toThrow(TutorPayoutNotAvailableError);
    });

    test("marks a payout paid and audits it", async () => {
      const row = { id: "p1", tutorId: "t1", transferFeeIdr: 6500 };
      const payout = { markTutorPayoutPaid: mock(async () => row) };
      const { service, auditPort } = makeService(payout);
      await expect(
        service.markTutorPayoutPaid("admin1", { tutorId: "t1" }),
      ).resolves.toBe(row);
      expect(auditPort.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "tutor_payout_paid",
          targetId: "p1",
        }),
      );
    });

    test("rejects missing payout support and empty settlements", async () => {
      await expect(
        makeService({}).service.markTutorPayoutPaid("admin1", {
          tutorId: "t1",
        }),
      ).rejects.toThrow(TutorPayoutNotAvailableError);
      await expect(
        makeService({
          markTutorPayoutPaid: mock(async () => null),
        }).service.markTutorPayoutPaid("admin1", { tutorId: "t1" }),
      ).rejects.toThrow(TutorPayoutNotAvailableError);
    });
  });

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

  describe("searchUsers", () => {
    test("trims the query and uses the default result limit", async () => {
      const searchUsers = mock(async () => [
        {
          id: "u1",
          name: "Ada Lovelace",
          email: "ada@example.com",
          image: null,
          role: "student",
        },
      ]);
      const service = createAdminService({
        adminRepo: { searchUsers } as any,
        auditPort: { record: mock(async () => {}) } as any,
        db: {} as any,
        wallet: {} as any,
        payout: {} as any,
      });

      await expect(service.searchUsers({ query: "  ada " })).resolves.toEqual([
        expect.objectContaining({ id: "u1" }),
      ]);
      expect(searchUsers).toHaveBeenCalledWith(expect.anything(), "ada", 10);
    });

    test("passes an explicit result limit", async () => {
      const searchUsers = mock(async () => []);
      const service = createAdminService({
        adminRepo: { searchUsers } as any,
        auditPort: { record: mock(async () => {}) } as any,
        db: {} as any,
        wallet: {} as any,
        payout: {} as any,
      });

      await service.searchUsers({ query: "ada", limit: 3 });

      expect(searchUsers).toHaveBeenCalledWith(expect.anything(), "ada", 3);
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

  describe("payouts and economy settings", () => {
    test("rejects invalid tutor payout dateFrom and dateTo filters", async () => {
      const payout = { getTutorPayouts: mock(async () => []) };
      const service = createAdminService({
        adminRepo: {} as any,
        auditPort: {} as any,
        db: {} as any,
        wallet: {} as any,
        payout,
      });

      await expect(
        service.getTutorPayouts({ tutorId: "t1", dateFrom: "not-a-date" }),
      ).rejects.toThrow(InvalidLedgerFilterError);
      await expect(
        service.getTutorPayouts({ tutorId: "t1", dateTo: "not-a-date" }),
      ).rejects.toThrow(InvalidLedgerFilterError);
    });

    test("maps a failed economy update to a conflict", async () => {
      const economy = {
        getConfig: mock(async () => ({
          id: "default",
          version: 1,
          onlineCogitoBaseIdr: 50_000,
          onlineCogitoIncrementIdr: 20_000,
          offlineCogitoBaseIdr: 90_000,
          offlineCogitoIncrementIdr: 40_000,
        })),
        updateConfig: mock(async () => null),
      };
      const db = { transaction: mock(async (fn: any) => fn({})) };
      const service = createAdminService({
        adminRepo: {} as any,
        auditPort: { record: mock(async () => {}) },
        db: db as any,
        wallet: {} as any,
        payout: {} as any,
        economy: economy as any,
      });

      await expect(
        service.updateEconomySettings("admin1", {
          expectedVersion: 1,
          onlineCogitoBaseIdr: 55_000,
          onlineCogitoIncrementIdr: 20_000,
          offlineCogitoBaseIdr: 90_000,
          offlineCogitoIncrementIdr: 40_000,
        }),
      ).rejects.toThrow(EconomyConfigConflictError);
    });

    test("economy updates do not fan out tutor notifications", async () => {
      const economy = {
        getConfig: mock(async () => ({
          id: "default",
          version: 1,
          onlineCogitoBaseIdr: 50_000,
          onlineCogitoIncrementIdr: 20_000,
          offlineCogitoBaseIdr: 90_000,
          offlineCogitoIncrementIdr: 40_000,
        })),
        updateConfig: mock(async () => ({
          id: "default",
          version: 2,
          onlineCogitoBaseIdr: 55_000,
          onlineCogitoIncrementIdr: 20_000,
          offlineCogitoBaseIdr: 90_000,
          offlineCogitoIncrementIdr: 40_000,
        })),
      };
      const adminRepo = {
        listUserIdsByRole: mock(async () => ["t1", "t2"]),
      };
      const tx = { isTx: true };
      const db = { transaction: mock(async (fn: any) => fn(tx)) };
      const auditPort = { record: mock(async () => {}) };
      const notification = {
        write: mock(async () => {
          throw new Error("notification bus down");
        }),
      };
      const service = createAdminService({
        adminRepo: adminRepo as any,
        auditPort,
        db: db as any,
        wallet: {} as any,
        payout: {} as any,
        economy: economy as any,
      });

      const updated = await service.updateEconomySettings("admin1", {
        expectedVersion: 1,
        onlineCogitoBaseIdr: 55_000,
        onlineCogitoIncrementIdr: 20_000,
        offlineCogitoBaseIdr: 90_000,
        offlineCogitoIncrementIdr: 40_000,
      });
      expect(updated.version).toBe(2);
      expect(auditPort.record).toHaveBeenCalledTimes(1);
      expect(adminRepo.listUserIdsByRole).not.toHaveBeenCalled();
      expect(notification.write).not.toHaveBeenCalled();
    });
  });

  describe("setRole", () => {
    function makeSetRoleService(overrides: Record<string, unknown> = {}) {
      const tx = {} as any;
      const db = { transaction: mock(async (fn: any) => fn(tx)) };
      const adminRepo = {
        getById: mock(async () => makeTarget({ role: "admin" })),
        lockAdminRows: mock(async () => {}),
        countAdmins: mock(async () => 2),
        updateRoleWithExpected: mock(async () => [
          { id: "u1", role: "student" },
        ]),
        ...overrides,
      };
      const auditPort = { record: mock(async () => {}) };
      const service = createAdminService({
        adminRepo,
        auditPort,
        db,
        wallet: {} as any,
        payout: {} as any,
      });
      return { service, adminRepo, auditPort, tx };
    }

    test("locks admin rows and validates the count inside the transaction (H6)", async () => {
      const { service, adminRepo } = makeSetRoleService();

      await service.setRole("admin1", {
        userId: "u1",
        role: "student",
        expectedRole: "admin",
      });

      expect(adminRepo.lockAdminRows).toHaveBeenCalledTimes(1);
      expect(adminRepo.countAdmins).toHaveBeenCalledTimes(1);
      expect(adminRepo.updateRoleWithExpected).toHaveBeenCalledTimes(1);
    });

    test("throws LastAdminError when the in-transaction count is 1", async () => {
      const { service, adminRepo } = makeSetRoleService({
        countAdmins: mock(async () => 1),
      });

      await expect(
        service.setRole("admin1", {
          userId: "u1",
          role: "student",
          expectedRole: "admin",
        }),
      ).rejects.toThrow(LastAdminError);
      expect(adminRepo.updateRoleWithExpected).not.toHaveBeenCalled();
    });

    test("skips the admin lock for non-admin targets", async () => {
      const { service, adminRepo } = makeSetRoleService({
        getById: mock(async () => makeTarget({ role: "tutor" })),
      });

      await service.setRole("admin1", {
        userId: "u1",
        role: "student",
        expectedRole: "tutor",
      });

      expect(adminRepo.lockAdminRows).not.toHaveBeenCalled();
      expect(adminRepo.countAdmins).not.toHaveBeenCalled();
    });
  });
});
