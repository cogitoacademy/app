import { db } from "../../lib/db";
import type { AuditPort } from "../../shared/ports/audit.port";
import type { AdminRepo, UserRow, UserRole } from "./admin.repo";
import { validateRoleChange } from "./admin.service";

export interface ListUsersInput {
  limit?: number;
  offset?: number;
}

export interface SetRoleInput {
  userId: string;
  role: UserRole;
}

export interface ListUsersResult {
  users: UserRow[];
  total: number;
  limit: number;
  offset: number;
}

export type AdminHandler = ReturnType<typeof createAdminHandler>;

export function createAdminHandler(deps: {
  adminRepo: AdminRepo;
  auditPort: AuditPort;
}) {
  const { adminRepo, auditPort } = deps;

  async function listUsers(
    input: ListUsersInput = {},
  ): Promise<ListUsersResult> {
    const limit = input.limit ?? 50;
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
      target !== null && target.role === "admin" && input.role !== "admin";
    const adminCount = needsAdminCount ? await adminRepo.countAdmins(db) : 0;

    const result = validateRoleChange(target, input.role, adminCount);
    if (!result.ok) throw result.error;
    const previousRole = result.previousRole;

    return db.transaction(async (tx) => {
      const row = await adminRepo.updateRole(tx, input.userId, input.role);

      await auditPort.record({
        db: tx,
        actorId: adminId,
        actorType: "admin",
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
