import type { ORPCError } from "@orpc/server";
import { notFound, conflict } from "../../lib/errors";
import { USER_ROLE, ADMIN_DEFAULT_PAGE_LIMIT } from "../../shared/constants";
import type { DbType } from "../../lib/db";
import type { AuditPort } from "../../shared/ports/audit.port";
import type { AdminRepo, UserRow, UserRole } from "./admin.repo";

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
}

export interface TargetUser {
  id: string;
  role: string;
}

type AdminError =
  | ORPCError<"NOT_FOUND", undefined>
  | ORPCError<"CONFLICT", undefined>;

export type RoleChangeResult =
  | { ok: true; previousRole: string }
  | { ok: false; error: AdminError };

export function validateRoleChange(
  target: TargetUser | null,
  newRole: UserRole,
  adminCount: number,
): RoleChangeResult {
  if (!target) {
    return { ok: false, error: notFound("User not found") };
  }

  const previousRole = target.role;

  if (
    previousRole === USER_ROLE.ADMIN &&
    newRole !== USER_ROLE.ADMIN &&
    adminCount <= 1
  ) {
    return {
      ok: false,
      error: conflict("Cannot demote the last admin user"),
    };
  }

  return { ok: true, previousRole };
}

export function createAdminService(deps: {
  adminRepo: AdminRepo;
  auditPort: AuditPort;
  db: DbType;
}) {
  const { adminRepo, auditPort, db } = deps;

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

    const result = validateRoleChange(target, input.role, adminCount);
    if (!result.ok) throw result.error;
    const previousRole = result.previousRole;

    return db.transaction(async (tx) => {
      const row = await adminRepo.updateRole(tx, input.userId, input.role);

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

  return { listUsers, setRole };
}

export type AdminService = ReturnType<typeof createAdminService>;
