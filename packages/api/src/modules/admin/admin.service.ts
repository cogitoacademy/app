import { count, desc, eq } from "drizzle-orm";
import { user } from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { AuditPort } from "../../shared/ports/audit.port";
import { notFound, conflict } from "../../lib/errors";

export interface ListUsersInput {
  limit?: number;
  offset?: number;
}

export interface SetRoleInput {
  userId: string;
  role: "student" | "tutor" | "admin";
}

export type AdminService = ReturnType<typeof createAdminService>;

export function createAdminService(deps: { db: DbType; audit: AuditPort }) {
  const { db, audit } = deps;

  async function listUsers(input: ListUsersInput = {}) {
    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;

    const [totalResult] = await db.select({ count: count() }).from(user);
    const users = await db
      .select()
      .from(user)
      .orderBy(desc(user.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      users,
      total: totalResult?.count ?? 0,
      limit,
      offset,
    };
  }

  async function setRole(adminId: string, input: SetRoleInput) {
    const [target] = await db
      .select()
      .from(user)
      .where(eq(user.id, input.userId))
      .limit(1);
    if (!target) throw notFound("User not found");

    const previousRole = target.role;

    if (previousRole === "admin" && input.role !== "admin") {
      const [adminCount] = await db
        .select({ count: count() })
        .from(user)
        .where(eq(user.role, "admin"));
      if ((adminCount?.count ?? 0) <= 1) {
        throw conflict("Cannot demote the last admin user");
      }
    }

    return db.transaction(async (tx) => {
      const [row] = await tx
        .update(user)
        .set({ role: input.role })
        .where(eq(user.id, input.userId))
        .returning();

      await audit.record({
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
