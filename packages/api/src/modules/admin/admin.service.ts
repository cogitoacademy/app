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
} from "./admin.errors";
import type { EconomyService } from "../economy";

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

  async function getEconomySettings() {
    if (!economy) throw new Error("Economy service is not configured");
    return economy.getConfig(db);
  }

  async function updateEconomySettings(
    adminId: string,
    input: UpdateEconomySettingsInput,
  ) {
    if (!economy) throw new Error("Economy service is not configured");

    return db.transaction(async (tx) => {
      const before = await economy.getConfig(tx);
      if (before.version !== input.expectedVersion) {
        throw new EconomyConfigConflictError(input.expectedVersion);
      }

      const updated = await economy.updateConfig(tx, {
        expectedVersion: input.expectedVersion,
        updatedBy: adminId,
        values: {
          onlineCogitoBaseIdr: input.onlineCogitoBaseIdr,
          onlineCogitoIncrementIdr: input.onlineCogitoIncrementIdr,
          offlineCogitoBaseIdr: input.offlineCogitoBaseIdr,
          offlineCogitoIncrementIdr: input.offlineCogitoIncrementIdr,
        },
      });
      if (!updated) {
        throw new EconomyConfigConflictError(input.expectedVersion);
      }

      await auditPort.record({
        db: tx,
        actorId: adminId,
        actorType: USER_ROLE.ADMIN,
        action: "economy_config_updated",
        targetId: updated.id,
        targetType: "economy_config",
        beforeState: {
          onlineCogitoBaseIdr: before.onlineCogitoBaseIdr,
          onlineCogitoIncrementIdr: before.onlineCogitoIncrementIdr,
          offlineCogitoBaseIdr: before.offlineCogitoBaseIdr,
          offlineCogitoIncrementIdr: before.offlineCogitoIncrementIdr,
          version: before.version,
        },
        afterState: {
          onlineCogitoBaseIdr: updated.onlineCogitoBaseIdr,
          onlineCogitoIncrementIdr: updated.onlineCogitoIncrementIdr,
          offlineCogitoBaseIdr: updated.offlineCogitoBaseIdr,
          offlineCogitoIncrementIdr: updated.offlineCogitoIncrementIdr,
          version: updated.version,
        },
      });

      return updated;
    });
  }

  return {
    listUsers,
    setRole,
    getWallet,
    listLedgerEntries,
    getTutorPayouts,
    getEconomySettings,
    updateEconomySettings,
  };
}

export type AdminService = ReturnType<typeof createAdminService>;
