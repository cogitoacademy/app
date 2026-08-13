import { USER_ROLE, ADMIN_DEFAULT_PAGE_LIMIT } from "../../shared/constants";
import type { DbType } from "../../lib/db";
import type { AdminRepo, UserRow, UserRole } from "./admin.repo";
import type { AdminAuditPort, AdminWalletPort } from "./index";
import {
  UserNotFoundError,
  LastAdminError,
  OptimisticLockError,
  WalletNotFoundError,
  InvalidLedgerFilterError,
} from "./admin.errors";

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

export function createAdminService(deps: {
  adminRepo: AdminRepo;
  auditPort: AdminAuditPort;
  db: DbType;
  wallet: AdminWalletPort;
}) {
  const { adminRepo, auditPort, db, wallet } = deps;

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
    const target = await adminRepo.getById(db, input.userId);

    const needsAdminCount =
      target !== null &&
      target.role === USER_ROLE.ADMIN &&
      input.role !== USER_ROLE.ADMIN;
    const adminCount = needsAdminCount ? await adminRepo.countAdmins(db) : 0;

    const { previousRole } = validateRoleChange(
      target,
      input.role,
      adminCount,
      input.userId,
    );

    return db.transaction(async (tx) => {
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

  return { listUsers, setRole, getWallet, listLedgerEntries };
}

export type AdminService = ReturnType<typeof createAdminService>;
