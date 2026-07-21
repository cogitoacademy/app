import type { DbType } from "../../lib/db";
import type { AuditPort } from "../../shared/ports/audit.port";
import { USER_ROLE, ADMIN_DEFAULT_PAGE_LIMIT } from "../../shared/constants";
import type { AdminRepo, UserRow } from "./admin.repo";
import { validateRoleChange, type SetRoleInput } from "./admin.service";

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

export type AdminHandler = ReturnType<typeof createAdminHandler>;

export function createAdminHandler(deps: {
  adminService: ReturnType<typeof createAdminService>;
}) {
  const { adminService } = deps;

  async function listUsers(
    input: ListUsersInput = {},
  ): Promise<ListUsersResult> {
    return adminService.listUsers(input);
  }

  async function setRole(
    adminId: string,
    input: SetRoleInput,
  ): Promise<UserRow> {
    return adminService.setRole(adminId, input);
  }

  return { listUsers, setRole };
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
