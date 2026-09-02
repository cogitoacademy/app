import { USER_ROLE, ADMIN_DEFAULT_PAGE_LIMIT } from "../../shared/constants";
import type { DbType } from "../../lib/db";
import type { AdminRepo, UserRow, UserRole } from "./admin.repo";
import type { AdminAuditPort, AdminWalletPort } from "./index";
import type { BookingPayoutPort } from "../booking";
import {
  UserNotFoundError,
  LastAdminError,
  OptimisticLockError,
  WalletNotFoundError,
  InvalidLedgerFilterError,
  EconomyConfigConflictError,
  TutorPayoutNotAvailableError,
} from "./admin.errors";
import type { EconomyService } from "../economy";

export const DASHBOARD_ANALYTICS_PERIODS = ["7d", "30d", "90d"] as const;
export type DashboardAnalyticsPeriod =
  (typeof DASHBOARD_ANALYTICS_PERIODS)[number];

const DASHBOARD_PERIOD_DAYS: Record<DashboardAnalyticsPeriod, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DashboardAnalytics {
  period: DashboardAnalyticsPeriod;
  periodStart: string;
  periodEnd: string;
  summary: {
    bookings: number;
    completedBookings: number;
    resolvedBookings: number;
    completionRate: number;
    activeLearners: number;
    newStudents: number;
    newTutors: number;
    grossMarks: number;
    platformTakeMarks: number;
  };
  bookingTrend: Array<{
    date: string;
    bookings: number;
    completed: number;
    grossMarks: number;
    platformTakeMarks: number;
  }>;
  userTrend: Array<{ date: string; students: number; tutors: number }>;
  stateBreakdown: Array<{ state: string; count: number }>;
  modalityBreakdown: Array<{ modality: string; count: number }>;
  categoryBreakdown: Array<{
    category: string;
    bookings: number;
    completed: number;
  }>;
}

export interface ListUsersInput {
  limit?: number;
  offset?: number;
}

export interface ListUsersResult {
  users: UserRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface SearchUsersInput {
  query: string;
  limit?: number;
}

export interface SetRoleInput {
  userId: string;
  role: UserRole;
  expectedRole: string;
}

export interface TargetUser {
  id: string;
  role: string;
}

export function validateRoleChange(
  target: TargetUser | null,
  newRole: UserRole,
  adminCount: number,
  userId: string,
): { previousRole: string } {
  if (!target) {
    throw new UserNotFoundError(userId);
  }

  const previousRole = target.role;

  if (
    previousRole === USER_ROLE.ADMIN &&
    newRole !== USER_ROLE.ADMIN &&
    adminCount <= 1
  ) {
    throw new LastAdminError(target.id);
  }

  return { previousRole };
}

function assertValidDateFilter(value: string, field: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new InvalidLedgerFilterError(`${field} must be a valid ISO datetime`);
  }
  return parsed;
}

function toNumber(value: number | string | null | undefined): number {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function getWibDayStart(date: Date): Date {
  const wibDate = new Date(date.getTime() + WIB_OFFSET_MS);
  wibDate.setUTCHours(0, 0, 0, 0);
  return new Date(wibDate.getTime() - WIB_OFFSET_MS);
}

function getWibDateKey(date: Date): string {
  const wibDate = new Date(date.getTime() + WIB_OFFSET_MS);
  return [
    wibDate.getUTCFullYear(),
    String(wibDate.getUTCMonth() + 1).padStart(2, "0"),
    String(wibDate.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function buildPeriodDateKeys(periodStart: Date, periodEnd: Date): string[] {
  const todayStart = getWibDayStart(periodEnd).getTime();
  const keys: string[] = [];
  for (
    let cursor = periodStart.getTime();
    cursor <= todayStart;
    cursor += DAY_MS
  ) {
    keys.push(getWibDateKey(new Date(cursor)));
  }
  return keys;
}

function toAnalyticsWindow(
  period: DashboardAnalyticsPeriod,
  now = new Date(),
): { periodStart: Date; periodEnd: Date } {
  const periodEnd = new Date(now);
  const periodStart = new Date(
    getWibDayStart(periodEnd).getTime() -
      (DASHBOARD_PERIOD_DAYS[period] - 1) * DAY_MS,
  );
  return { periodStart, periodEnd };
}

export interface GetTutorPayoutsInput {
  tutorId: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface UpdateEconomySettingsInput {
  expectedVersion: number;
  onlineCogitoBaseIdr: number;
  onlineCogitoIncrementIdr: number;
  offlineCogitoBaseIdr: number;
  offlineCogitoIncrementIdr: number;
}

export function createAdminService(deps: {
  adminRepo: AdminRepo;
  auditPort: AdminAuditPort;
  db: DbType;
  wallet: AdminWalletPort;
  payout: BookingPayoutPort;
  economy?: EconomyService;
}) {
  const { adminRepo, auditPort, db, wallet, payout, economy } = deps;

  async function listUsers(
    input: ListUsersInput = {},
  ): Promise<ListUsersResult> {
    const limit = input.limit ?? ADMIN_DEFAULT_PAGE_LIMIT;
    const offset = input.offset ?? 0;

    const [users, total] = await Promise.all([
      adminRepo.listUsers(db, limit, offset),
      adminRepo.countUsers(db),
    ]);

    return { users, total, limit, offset };
  }

  async function searchUsers(input: SearchUsersInput) {
    return adminRepo.searchUsers(db, input.query.trim(), input.limit ?? 10);
  }

  async function getDashboardAnalytics(
    period: DashboardAnalyticsPeriod = "30d",
  ): Promise<DashboardAnalytics> {
    const { periodStart, periodEnd } = toAnalyticsWindow(period);
    const raw = await adminRepo.getDashboardAnalytics(db, {
      periodStart,
      periodEnd,
    });
    const bookingSummary = raw.bookingSummary;
    const userSummary = raw.userSummary;
    const bookings = toNumber(bookingSummary.bookings);
    const completedBookings = toNumber(bookingSummary.completed);
    const exceptionBookings = toNumber(bookingSummary.exceptions);
    const resolvedBookings = completedBookings + exceptionBookings;
    const dateKeys = buildPeriodDateKeys(periodStart, periodEnd);
    const bookingTrendByDate = new Map(
      raw.bookingTrend.map((row) => [row.date, row]),
    );
    const userTrendByDate = new Map(
      raw.userTrend.map((row) => [row.date, row]),
    );

    return {
      period,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      summary: {
        bookings,
        completedBookings,
        resolvedBookings,
        completionRate:
          resolvedBookings > 0
            ? Math.round((completedBookings / resolvedBookings) * 1000) / 10
            : 0,
        activeLearners: toNumber(bookingSummary.activeLearners),
        newStudents: toNumber(userSummary.newStudents),
        newTutors: toNumber(userSummary.newTutors),
        grossMarks: toNumber(bookingSummary.grossMarks),
        platformTakeMarks: toNumber(bookingSummary.platformTakeMarks),
      },
      bookingTrend: dateKeys.map((date) => {
        const row = bookingTrendByDate.get(date);
        return {
          date,
          bookings: toNumber(row?.bookings),
          completed: toNumber(row?.completed),
          grossMarks: toNumber(row?.grossMarks),
          platformTakeMarks: toNumber(row?.platformTakeMarks),
        };
      }),
      userTrend: dateKeys.map((date) => {
        const row = userTrendByDate.get(date);
        return {
          date,
          students: toNumber(row?.students),
          tutors: toNumber(row?.tutors),
        };
      }),
      stateBreakdown: raw.stateBreakdown.map((row) => ({
        state: row.state,
        count: toNumber(row.count),
      })),
      modalityBreakdown: raw.modalityBreakdown.map((row) => ({
        modality: row.modality,
        count: toNumber(row.count),
      })),
      categoryBreakdown: raw.categoryBreakdown.map((row) => ({
        category: row.category,
        bookings: toNumber(row.bookings),
        completed: toNumber(row.completed),
      })),
    };
  }

  async function setRole(
    adminId: string,
    input: SetRoleInput,
  ): Promise<UserRow> {
    return db.transaction(async (tx) => {
      const target = await adminRepo.getById(tx, input.userId);
      if (!target) throw new UserNotFoundError(input.userId);
      const previousRole = target.role;

      // The last-admin guard must be evaluated inside the transaction after
      // locking the admin rows: a stale pre-transaction count would let two
      // concurrent demotions of the last two admins both succeed (H6).
      if (previousRole === USER_ROLE.ADMIN && input.role !== USER_ROLE.ADMIN) {
        await adminRepo.lockAdminRows(tx);
        const adminCount = await adminRepo.countAdmins(tx);
        if (adminCount <= 1) throw new LastAdminError(input.userId);
      }

      const rows = await adminRepo.updateRoleWithExpected(
        tx,
        input.userId,
        input.role,
        input.expectedRole,
      );
      if (rows.length === 0)
        throw new OptimisticLockError(input.userId, input.expectedRole);
      const row = rows[0]!;

      await auditPort.record({
        db: tx,
        actorId: adminId,
        actorType: USER_ROLE.ADMIN,
        action: "user_role_changed",
        targetId: input.userId,
        targetType: "user",
        beforeState: { role: previousRole },
        afterState: { role: input.role },
      });

      return row;
    });
  }

  async function getWallet(input: { userId: string }) {
    const w = await wallet.getByUserId(db, input.userId);
    if (!w) throw new WalletNotFoundError(input.userId);
    return {
      id: w.id,
      totalBalance: w.totalBalance,
      heldBalance: w.heldBalance,
      availableBalance: w.availableBalance,
    };
  }

  async function listLedgerEntries(input: {
    walletId?: string;
    userId?: string;
    limit?: number;
    cursor?: string;
    bookingId?: string;
    entryType?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    if (input.walletId && input.userId) {
      throw new InvalidLedgerFilterError(
        "Provide either walletId or userId, not both",
      );
    }
    let walletId = input.walletId;
    if (!walletId && input.userId) {
      const w = await wallet.getByUserId(db, input.userId);
      if (!w) throw new WalletNotFoundError(input.userId);
      walletId = w.id;
    }
    if (!walletId) {
      throw new InvalidLedgerFilterError("walletId or userId is required");
    }
    const dateFrom = input.dateFrom
      ? assertValidDateFilter(input.dateFrom, "dateFrom")
      : undefined;
    const dateTo = input.dateTo
      ? assertValidDateFilter(input.dateTo, "dateTo")
      : undefined;
    if (dateFrom && dateTo && dateFrom.getTime() > dateTo.getTime()) {
      throw new InvalidLedgerFilterError("dateFrom must not be after dateTo");
    }

    return wallet.listLedger(walletId, {
      limit: input.limit,
      cursor: input.cursor,
      bookingId: input.bookingId,
      entryType: input.entryType,
      dateFrom: dateFrom?.toISOString(),
      dateTo: dateTo?.toISOString(),
    });
  }

  async function getTutorPayouts(input: GetTutorPayoutsInput) {
    if (input.dateFrom && Number.isNaN(Date.parse(input.dateFrom))) {
      throw new InvalidLedgerFilterError(
        "dateFrom must be a valid ISO datetime",
      );
    }
    if (input.dateTo && Number.isNaN(Date.parse(input.dateTo))) {
      throw new InvalidLedgerFilterError("dateTo must be a valid ISO datetime");
    }
    return payout.getTutorPayouts({
      tutorId: input.tutorId,
      dateFrom: input.dateFrom ? new Date(input.dateFrom) : undefined,
      dateTo: input.dateTo ? new Date(input.dateTo) : undefined,
    });
  }

  async function getPendingTutorPayouts(input: { tutorId: string }) {
    if (!payout.getPendingTutorPayouts) {
      throw new TutorPayoutNotAvailableError(input.tutorId);
    }
    return payout.getPendingTutorPayouts(input.tutorId);
  }

  async function markTutorPayoutPaid(
    adminId: string,
    input: { tutorId: string },
  ) {
    if (!payout.markTutorPayoutPaid) {
      throw new TutorPayoutNotAvailableError(input.tutorId);
    }
    const result = await payout.markTutorPayoutPaid(input.tutorId, adminId);
    if (!result) throw new TutorPayoutNotAvailableError(input.tutorId);
    await deps.auditPort.record({
      db,
      actorId: adminId,
      actorType: "admin",
      action: "tutor_payout_paid",
      targetId: result.id,
      targetType: "tutor_payout",
      beforeState: { tutorId: result.tutorId },
      afterState: result,
      details: { transferFeeIdr: result.transferFeeIdr },
    });
    return result;
  }

  async function getEconomySettings() {
    if (!economy) throw new Error("Economy service is not configured");
    return economy.getConfig(db);
  }

  async function updateEconomySettings(
    adminId: string,
    input: UpdateEconomySettingsInput,
  ) {
    if (!economy) throw new Error("Economy service is not configured");

    const updated = await db.transaction(async (tx) => {
      const before = await economy.getConfig(tx);
      if (before.version !== input.expectedVersion) {
        throw new EconomyConfigConflictError(input.expectedVersion);
      }

      const nextValues = {
        onlineCogitoBaseIdr: input.onlineCogitoBaseIdr,
        onlineCogitoIncrementIdr: input.onlineCogitoIncrementIdr,
        offlineCogitoBaseIdr: input.offlineCogitoBaseIdr,
        offlineCogitoIncrementIdr: input.offlineCogitoIncrementIdr,
      };

      const hasChanges = Object.entries(nextValues).some(
        ([key, value]) => value !== before[key as keyof typeof nextValues],
      );
      if (!hasChanges) return before;

      const result = await economy.updateConfig(tx, {
        expectedVersion: input.expectedVersion,
        updatedBy: adminId,
        values: nextValues,
      });
      if (!result) {
        throw new EconomyConfigConflictError(input.expectedVersion);
      }

      await auditPort.record({
        db: tx,
        actorId: adminId,
        actorType: USER_ROLE.ADMIN,
        action: "economy_config_updated",
        targetId: result.id,
        targetType: "economy_config",
        beforeState: {
          onlineCogitoBaseIdr: before.onlineCogitoBaseIdr,
          onlineCogitoIncrementIdr: before.onlineCogitoIncrementIdr,
          offlineCogitoBaseIdr: before.offlineCogitoBaseIdr,
          offlineCogitoIncrementIdr: before.offlineCogitoIncrementIdr,
          version: before.version,
        },
        afterState: {
          onlineCogitoBaseIdr: result.onlineCogitoBaseIdr,
          onlineCogitoIncrementIdr: result.onlineCogitoIncrementIdr,
          offlineCogitoBaseIdr: result.offlineCogitoBaseIdr,
          offlineCogitoIncrementIdr: result.offlineCogitoIncrementIdr,
          version: result.version,
        },
      });

      return result;
    });

    return updated;
  }

  return {
    listUsers,
    searchUsers,
    getDashboardAnalytics,
    setRole,
    getWallet,
    listLedgerEntries,
    getTutorPayouts,
    getPendingTutorPayouts,
    markTutorPayoutPaid,
    getEconomySettings,
    updateEconomySettings,
  };
}

export type AdminService = ReturnType<typeof createAdminService>;
