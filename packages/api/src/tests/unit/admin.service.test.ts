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
  TutorPayoutNotAvailableError,
} from "../../modules/admin/admin.errors";
import { DEFAULT_V3_ECONOMY_CONFIG } from "../../modules/pricing/v3-economy.config";

const emptyOperations = {
  privateMarks: 0,
  privateSessions: 0,
  academyMarks: 0,
  academySeatSessions: 0,
  privateFundedMarks: 0,
  privateUnfundedMarks: 0,
  privateSeatSessions: 0,
  academyFundedMarks: 0,
  academyUnfundedMarks: 0,
  academyUpcomingSeatSessions: 0,
  earnedIdr: 0,
  paidIdr: 0,
  unpaidIdr: 0,
  unavailablePrivateRates: 0,
  unavailablePaymentDates: 0,
};

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
          },
          userSummary: { newStudents: "3", newTutors: "1" },
          bookingTrend: [
            {
              date: "2026-08-31",
              bookings: "2",
              completed: "1",
            },
          ],
          userTrend: [{ date: "2026-08-31", students: "3", tutors: "1" }],
          stateBreakdown: [{ state: "completed", count: "2" }],
          modalityBreakdown: [{ modality: "online", count: "4" }],
          categoryBreakdown: [
            { category: "Mathematics", bookings: "4", completed: "2" },
          ],
          accountSummary: {
            totalAccounts: "20",
            totalStudents: "16",
            totalTutors: "3",
            signups: "4",
            monthlyActiveUsers: "8",
            inactiveUsers: "5",
            previousActiveUsers: "10",
            churnedUsers: "2",
          },
          marksSummary: {
            studentsWithMarks: "9",
            studentsWithoutMarks: "7",
          },
          paymentSummary: {
            payingStudents: "6",
            grossReceiptsIdr: "1250000",
          },
          refundSummary: { refundedIdr: "100000" },
          operationsSummary: {
            privateMarks: "84",
            privateSessions: "2",
            academyMarks: "20",
            academySeatSessions: "1",
            privateFundedMarks: "100",
            privateUnfundedMarks: "20",
            privateSeatSessions: "3",
            academyFundedMarks: "40",
            academyUnfundedMarks: "22",
            academyUpcomingSeatSessions: "3",
            earnedIdr: "600000",
            paidIdr: "400000",
            unpaidIdr: "200000",
            unavailablePrivateRates: "1",
            unavailablePaymentDates: "2",
          },
        })),
      };
      const service = createAdminService({
        adminRepo: repo as any,
        auditPort: {} as any,
        db: {} as any,
        wallet: {} as any,
        payout: {} as any,
      });

      const result = await service.getDashboardAnalytics({ period: "7d" });

      expect(result.operationsSummary).toEqual({
        delivered: {
          privateMarks: 84,
          privateSessions: 2,
          academyMarks: 20,
          academySeatSessions: 1,
        },
        upcoming: {
          privateFundedMarks: 100,
          privateUnfundedMarks: 20,
          privateSeatSessions: 3,
          academyFundedMarks: 40,
          academyUnfundedMarks: 22,
          academySeatSessions: 3,
        },
        tutorFees: { earnedIdr: 600000, paidIdr: 400000, unpaidIdr: 200000 },
        unavailablePrivateRates: 1,
        unavailablePaymentDates: 2,
        asOf: expect.any(String),
      });
      expect(result.period).toBe("7d");
      expect(result.bookingTrend).toHaveLength(7);
      expect(result.bookingTrend.at(-1)).toEqual({
        date: expect.any(String),
        bookings: expect.any(Number),
        completed: expect.any(Number),
      });
      expect(result.summary).toEqual({
        bookings: 4,
        completedBookings: 2,
        resolvedBookings: 3,
        completionRate: 66.7,
        activeLearners: 3,
        newStudents: 3,
        newTutors: 1,
      });
      expect(result.bookingTrend.some((row) => row.bookings === 0)).toBe(true);
      expect(result.stateBreakdown).toEqual([{ state: "completed", count: 2 }]);
      expect(result.businessSummary).toEqual({
        totalAccounts: 20,
        totalStudents: 16,
        totalTutors: 3,
        signups: 4,
        monthlyActiveUsers: 8,
        inactiveUsers: 5,
        churnedUsers: 2,
        churnRate: 20,
        studentsWithMarks: 9,
        studentsWithoutMarks: 7,
        studentsWithMarksRate: 56.3,
        payingStudents: 6,
        paidConversionRate: 37.5,
        grossReceiptsIdr: 1_250_000,
        refundedIdr: 100_000,
        netReceiptsIdr: 1_150_000,
      });
      expect(repo.getDashboardAnalytics).toHaveBeenCalledWith(
        expect.anything(),
        {
          periodStart: expect.any(Date),
          periodEnd: expect.any(Date),
          activeSince: expect.any(Date),
          previousActiveSince: expect.any(Date),
          now: expect.any(Date),
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
          accountSummary: {},
          marksSummary: {},
          paymentSummary: {},
          refundSummary: {},
          operationsSummary: emptyOperations,
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

    test("uses an inclusive custom WIB date range", async () => {
      const repo = {
        getDashboardAnalytics: mock(async () => ({
          bookingSummary: {},
          userSummary: {},
          bookingTrend: [],
          userTrend: [],
          stateBreakdown: [],
          modalityBreakdown: [],
          categoryBreakdown: [],
          accountSummary: {},
          marksSummary: {},
          paymentSummary: {},
          refundSummary: {},
          operationsSummary: emptyOperations,
        })),
      };
      const service = createAdminService({
        adminRepo: repo as any,
        auditPort: {} as any,
        db: {} as any,
        wallet: {} as any,
        payout: {} as any,
      });

      const result = await service.getDashboardAnalytics({
        dateFrom: "2026-08-01",
        dateTo: "2026-08-03",
      });

      expect(result.period).toBe("custom");
      expect(result.periodStart).toBe("2026-07-31T17:00:00.000Z");
      expect(result.periodEnd).toBe("2026-08-03T16:59:59.999Z");
      expect(result.bookingTrend).toHaveLength(3);
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

    test("rejects tax and settlement operations when their payout port is unavailable", async () => {
      const { service } = makeService({});
      const reason = { payoutId: "payout-1", reason: "Correct settlement" };
      await Promise.all(
        [
          service.getTutorTaxConfig(),
          service.updateTutorTaxConfig("admin1", {
            expectedVersion: 0,
            nikNpwpRateBps: 100,
            nikOnlyRateBps: 200,
            missingRateBps: 300,
            reason: "Update policy",
          }),
          service.setTutorTaxRateOverride("admin1", {
            tutorId: "t1",
            rateBps: null,
            reason: "Clear override",
          }),
          service.voidTutorPayout("admin1", reason),
          service.resolveTutorPayoutReconciliation("admin1", reason),
          service.previewTutorPayout({ tutorId: "t1", sourceKeys: [] }),
          service.recordTutorPayoutTransfer("admin1", {
            payoutId: "payout-1",
            previewVersion: "v1",
            actualAmountIdr: 1000,
            paidAt: "2026-10-28T00:00:00Z",
          }),
        ].map((pending) =>
          expect(pending).rejects.toBeInstanceOf(TutorPayoutNotAvailableError),
        ),
      );
    });

    test("forwards admin identity and tax policy inputs to the payout service", async () => {
      const config = {
        version: 1,
        nikNpwpRateBps: 100,
        nikOnlyRateBps: 200,
        missingRateBps: 300,
      };
      const payout = {
        getTutorTaxConfig: mock(async () => config),
        updateTutorTaxConfig: mock(async () => config),
        setTutorTaxRateOverride: mock(async () => ({
          tutorId: "t1",
          taxRateOverrideBps: null,
        })),
      };
      const { service } = makeService(payout);
      const update = { expectedVersion: 0, ...config, reason: "Update policy" };
      const override = {
        tutorId: "t1",
        rateBps: null,
        reason: "Clear override",
      };
      expect(await service.getTutorTaxConfig()).toBe(config);
      expect(await service.updateTutorTaxConfig("admin1", update)).toBe(config);
      expect(payout.updateTutorTaxConfig).toHaveBeenCalledWith(
        "admin1",
        update,
      );
      expect(await service.setTutorTaxRateOverride("admin1", override)).toEqual(
        { tutorId: "t1", taxRateOverrideBps: null },
      );
      expect(payout.setTutorTaxRateOverride).toHaveBeenCalledWith(
        "admin1",
        override,
      );
    });

    test("economy previews validate their input and require configured services", async () => {
      const previewV3Config = mock(() => ({ exactCostIdr: 100000 }));
      const base = {
        adminRepo: {} as any,
        auditPort: {} as any,
        db: {} as any,
        wallet: {} as any,
        payout: {} as any,
      };
      const missing = createAdminService(base);
      const save = {
        expectedVersion: 0,
        values: DEFAULT_V3_ECONOMY_CONFIG,
        reason: "Update policy",
      };
      await expect(
        missing.saveV3EconomySettings("admin1", save),
      ).rejects.toThrow("Economy service is not configured");
      await expect(missing.getV3EconomySettings()).rejects.toThrow(
        "Economy service is not configured",
      );
      expect(() =>
        missing.previewV3EconomySettings({ values: DEFAULT_V3_ECONOMY_CONFIG }),
      ).toThrow("Economy service is not configured");
      const service = createAdminService({
        ...base,
        economy: { previewV3Config } as any,
      });
      await expect(service.getV3EconomySettings()).rejects.toThrow(
        "Competition catalog service is not configured",
      );
      await expect(
        service.saveV3EconomySettings("admin1", save),
      ).rejects.toThrow("Competition catalog service is not configured");
      expect(() =>
        service.previewV3EconomySettings({
          values: DEFAULT_V3_ECONOMY_CONFIG,
          exactMarks: 0,
        }),
      ).toThrow();
      expect(
        service.previewV3EconomySettings({
          values: DEFAULT_V3_ECONOMY_CONFIG,
          exactMarks: 42,
        }),
      ).toEqual({ exactCostIdr: 100000 });
      expect(previewV3Config).toHaveBeenCalledWith(
        DEFAULT_V3_ECONOMY_CONFIG,
        42,
      );
    });

    test("returns pending payout data and rejects an unavailable port", async () => {
      const payout = {
        getPendingTutorPayouts: mock(async () => ({
          tutorId: "t1",
          items: [],
        })),
      };
      await expect(
        makeService(payout).service.getPendingTutorPayouts({ tutorId: "t1" }),
      ).resolves.toEqual({ tutorId: "t1", items: [] });
      await expect(
        makeService({}).service.getPendingTutorPayouts({ tutorId: "t1" }),
      ).rejects.toThrow(TutorPayoutNotAvailableError);
    });

    test("returns paid session allocations and rejects an unavailable port", async () => {
      const details = { detailsAvailable: true, items: [] };
      const getTutorPayoutAllocations = mock(async () => details);
      await expect(
        makeService({
          getTutorPayoutAllocations,
        }).service.getTutorPayoutAllocations({
          payoutId: "payout-1",
        }),
      ).resolves.toBe(details);
      expect(getTutorPayoutAllocations).toHaveBeenCalledWith("payout-1");
      await expect(
        makeService({}).service.getTutorPayoutAllocations({
          payoutId: "payout-1",
        }),
      ).rejects.toThrow(TutorPayoutNotAvailableError);
    });

    test("returns the tutor payout report and validates its date window", async () => {
      const payout = {
        getTutorPayoutReport: mock(async (input: unknown) => ({ input })),
      };
      const { service } = makeService(payout);
      const dateFrom = "2026-08-01T00:00:00.000Z";
      const dateTo = "2026-08-31T23:59:59.999Z";

      await expect(
        service.getTutorPayoutReport({ dateFrom, dateTo }),
      ).resolves.toEqual({
        input: {
          dateFrom: new Date(dateFrom),
          dateTo: new Date(dateTo),
        },
      });
      expect(payout.getTutorPayoutReport).toHaveBeenCalledWith({
        dateFrom: new Date(dateFrom),
        dateTo: new Date(dateTo),
      });
      await expect(
        service.getTutorPayoutReport({
          dateFrom: dateTo,
          dateTo: dateFrom,
        }),
      ).rejects.toThrow(InvalidLedgerFilterError);
      await expect(
        makeService({}).service.getTutorPayoutReport({}),
      ).rejects.toThrow(TutorPayoutNotAvailableError);
    });

    test("prepares a versioned batch and records only the exact external transfer", async () => {
      const prepared = { id: "p1", status: "prepared" };
      const paid = { id: "p1", status: "paid" };
      const prepareTutorPayout = mock(async () => prepared);
      const recordTutorPayoutTransfer = mock(async () => paid);
      const { service } = makeService({
        prepareTutorPayout,
        recordTutorPayoutTransfer,
      });
      const prepareInput = {
        tutorId: "t1",
        sourceKeys: ["fee:event-1"],
        previewVersion: "a".repeat(64),
        operationId: "4b30c664-94c6-4dca-9b91-08a7c0876ef1",
      };
      const transferInput = {
        payoutId: "4b30c664-94c6-4dca-9b91-08a7c0876ef1",
        previewVersion: "a".repeat(64),
        actualAmountIdr: 9750,
        paidAt: "2026-08-10T03:00:00.000Z",
      };

      await expect(
        service.prepareTutorPayout("admin1", prepareInput),
      ).resolves.toBe(prepared);
      expect(prepareTutorPayout).toHaveBeenCalledWith("admin1", prepareInput);
      await expect(
        service.recordTutorPayoutTransfer("admin1", transferInput),
      ).resolves.toBe(paid);
      expect(recordTutorPayoutTransfer).toHaveBeenCalledWith("admin1", {
        ...transferInput,
        paidAt: new Date(transferInput.paidAt),
      });
    });

    test("rejects unsupported payout writes", async () => {
      await expect(
        makeService({}).service.prepareTutorPayout("admin1", {
          tutorId: "t1",
          sourceKeys: ["fee:event-1"],
          previewVersion: "a".repeat(64),
          operationId: "4b30c664-94c6-4dca-9b91-08a7c0876ef1",
        }),
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
      expect(searchUsers).toHaveBeenCalledWith(
        expect.anything(),
        "ada",
        10,
        undefined,
      );
    });

    test("passes an explicit result limit and role filter", async () => {
      const searchUsers = mock(async () => []);
      const service = createAdminService({
        adminRepo: { searchUsers } as any,
        auditPort: { record: mock(async () => {}) } as any,
        db: {} as any,
        wallet: {} as any,
        payout: {} as any,
      });

      await service.searchUsers({ query: "ada", limit: 3, role: "student" });

      expect(searchUsers).toHaveBeenCalledWith(
        expect.anything(),
        "ada",
        3,
        "student",
      );
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

  describe("payout filters and economy API", () => {
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

    test("exposes V3 settings without obsolete take-schedule methods", () => {
      const service = createAdminService({
        adminRepo: {} as any,
        auditPort: {} as any,
        db: {} as any,
        wallet: {} as any,
        payout: {} as any,
      });
      expect(service).not.toHaveProperty("getEconomySettings");
      expect(service).not.toHaveProperty("updateEconomySettings");
      expect(service.getV3EconomySettings).toBeFunction();
      expect(service.saveV3EconomySettings).toBeFunction();
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

    test("a concurrent role change fails before recording an audit event", async () => {
      const { service, auditPort } = makeSetRoleService({
        updateRoleWithExpected: mock(async () => []),
      });
      await expect(
        service.setRole("admin1", {
          userId: "u1",
          role: "student",
          expectedRole: "admin",
        }),
      ).rejects.toMatchObject({ code: "OPTIMISTIC_LOCK" });
      expect(auditPort.record).not.toHaveBeenCalled();
    });

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

function makeAdminBoundaryService(extra: Record<string, unknown> = {}) {
  return createAdminService({
    db: {
      transaction: mock(async (fn: any) =>
        fn({ execute: mock(async () => undefined) }),
      ),
    },
    adminRepo: {},
    wallet: {},
    payout: {},
    auditPort: { record: mock(async () => undefined) },
    ...extra,
  } as any);
}

describe("Admin service adapter boundaries", () => {
  test("search trims query and defaults its limit", async () => {
    const adminRepo = { searchUsers: mock(async () => [{ id: "u1" }]) };
    const service = makeAdminBoundaryService({ adminRepo });
    await expect(
      service.searchUsers({ query: "  student  " }),
    ).resolves.toEqual([{ id: "u1" }]);
    expect(adminRepo.searchUsers).toHaveBeenCalledWith(
      expect.anything(),
      "student",
      10,
      undefined,
    );
    await service.searchUsers({ query: " tutor ", limit: 4, role: "tutor" });
    expect(adminRepo.searchUsers).toHaveBeenLastCalledWith(
      expect.anything(),
      "tutor",
      4,
      "tutor",
    );
  });

  test("missing target fails role update before a write", async () => {
    const adminRepo = {
      getById: mock(async () => null),
      updateRoleWithExpected: mock(async () => []),
    };
    await expect(
      makeAdminBoundaryService({ adminRepo }).setRole("admin1", {
        userId: "gone",
        role: "student",
        expectedRole: "tutor",
      }),
    ).rejects.toBeInstanceOf(UserNotFoundError);
    expect(adminRepo.updateRoleWithExpected).not.toHaveBeenCalled();
  });

  test("payout date filters are optional and preserve valid boundaries", async () => {
    const payout = {
      getTutorPayouts: mock(async () => []),
      getTutorPayoutReport: mock(async () => ({ items: [] })),
    };
    const service = makeAdminBoundaryService({ payout });
    await service.getTutorPayouts({ tutorId: "t1" });
    expect(payout.getTutorPayouts).toHaveBeenLastCalledWith({
      tutorId: "t1",
      dateFrom: undefined,
      dateTo: undefined,
    });
    await service.getTutorPayouts({
      tutorId: "t1",
      dateFrom: "2026-01-01T00:00:00Z",
      dateTo: "2026-01-02T00:00:00Z",
    });
    expect(payout.getTutorPayouts).toHaveBeenLastCalledWith({
      tutorId: "t1",
      dateFrom: new Date("2026-01-01"),
      dateTo: new Date("2026-01-02"),
    });
    await service.getTutorPayoutReport();
    expect(payout.getTutorPayoutReport).toHaveBeenCalledWith({
      dateFrom: undefined,
      dateTo: undefined,
    });
    await expect(
      service.getTutorPayoutReport({ dateFrom: "invalid" }),
    ).rejects.toBeInstanceOf(InvalidLedgerFilterError);
  });

  test("available payout adapters forward void, reconciliation and preview arguments", async () => {
    const payout = {
      voidTutorPayout: mock(async () => ({ status: "voided" })),
      resolveTutorPayoutReconciliation: mock(async () => ({ resolved: true })),
      previewTutorPayout: mock(async () => ({ amountIdr: 100 })),
    };
    const service = makeAdminBoundaryService({ payout });
    const reason = { payoutId: "p1", reason: "Reviewed" };
    await expect(service.voidTutorPayout("admin1", reason)).resolves.toEqual({
      status: "voided",
    });
    await expect(
      service.resolveTutorPayoutReconciliation("admin1", reason),
    ).resolves.toEqual({ resolved: true });
    await expect(
      service.previewTutorPayout({ tutorId: "t1", sourceKeys: ["session:s1"] }),
    ).resolves.toEqual({ amountIdr: 100 });
    expect(payout.voidTutorPayout).toHaveBeenCalledWith("admin1", reason);
    expect(payout.resolveTutorPayoutReconciliation).toHaveBeenCalledWith(
      "admin1",
      reason,
    );
    expect(payout.previewTutorPayout).toHaveBeenCalledWith("t1", [
      "session:s1",
    ]);
  });

  test.each([
    "missing-services",
    "missing-revision",
    "unknown-competition",
  ] as const)(
    "activation rejects %s without auditing success",
    async (scenario) => {
      const auditPort = { record: mock(async () => undefined) };
      const economy = {
        getV3ConfigByVersion: mock(async () =>
          scenario === "missing-revision"
            ? null
            : {
                values: {
                  ...DEFAULT_V3_ECONOMY_CONFIG,
                  competitionRates: {
                    unknown: { soloMarks: 40, soloFeeIdr: 150000 },
                  },
                },
              },
        ),
        activateV3Config: mock(async () => ({})),
      };
      const competitionCatalog = { listParents: mock(async () => []) };
      const service = makeAdminBoundaryService({
        auditPort,
        ...(scenario === "missing-services"
          ? {}
          : { economy, competitionCatalog }),
      });
      await expect(
        service.activateV3EconomySettings("admin1", {
          version: 1,
          expectedActiveRevision: null,
          reason: "Approved",
        }),
      ).rejects.toThrow();
      expect(auditPort.record).not.toHaveBeenCalled();
      expect(economy.activateV3Config).not.toHaveBeenCalled();
    },
  );
});

test("admin listUsers preserves default and explicit pagination", async () => {
  const adminRepo = {
    listUsers: mock(async () => [{ id: "u1" }]),
    countUsers: mock(async () => 3),
  };
  const service = makeAdminBoundaryService({ adminRepo });
  const defaults = await service.listUsers();
  expect(defaults).toMatchObject({
    users: [{ id: "u1" }],
    total: 3,
    offset: 0,
  });
  expect(defaults.limit).toBeGreaterThan(0);
  await expect(
    service.listUsers({ limit: 5, offset: 2 }),
  ).resolves.toMatchObject({ limit: 5, offset: 2 });
  expect(adminRepo.listUsers).toHaveBeenLastCalledWith(expect.anything(), 5, 2);
});

test("admin analytics sanitizes a non-finite aggregate rather than exposing it", async () => {
  const adminRepo = {
    getDashboardAnalytics: mock(async () => ({
      bookingSummary: { bookings: "NaN" },
      userSummary: {},
      bookingTrend: [],
      userTrend: [],
      stateBreakdown: [],
      modalityBreakdown: [],
      categoryBreakdown: [],
      accountSummary: {},
      marksSummary: {},
      paymentSummary: {},
      refundSummary: {},
      operationsSummary: emptyOperations,
    })),
  };
  const result = await makeAdminBoundaryService({
    adminRepo,
  }).getDashboardAnalytics();
  expect(result.summary.bookings).toBe(0);
});
