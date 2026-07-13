import { count, desc, eq } from "drizzle-orm";
import { user } from "@cogito-app/db/schema";
import type { DbOrTx } from "../../lib/tx";
import { USER_ROLE } from "../../shared/constants";

export type UserRole = "student" | "tutor" | "admin";
export type UserRow = typeof user.$inferSelect;

export function createAdminRepo() {
  async function listUsers(
    conn: DbOrTx,
    limit: number,
    offset: number,
  ): Promise<UserRow[]> {
    return conn
      .select()
      .from(user)
      .orderBy(desc(user.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async function countUsers(conn: DbOrTx): Promise<number> {
    const [row] = await conn.select({ count: count() }).from(user);
    return row?.count ?? 0;
  }

  async function getById(
    conn: DbOrTx,
    userId: string,
  ): Promise<UserRow | null> {
    const [row] = await conn
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    return row ?? null;
  }

  async function countAdmins(conn: DbOrTx): Promise<number> {
    const [row] = await conn
      .select({ count: count() })
      .from(user)
      .where(eq(user.role, USER_ROLE.ADMIN));
    return row?.count ?? 0;
  }

  async function updateRole(
    conn: DbOrTx,
    userId: string,
    role: UserRole,
  ): Promise<UserRow> {
    const [row] = await conn
      .update(user)
      .set({ role })
      .where(eq(user.id, userId))
      .returning();
    return row!;
  }

  return { listUsers, countUsers, getById, countAdmins, updateRole };
}

export type AdminRepo = ReturnType<typeof createAdminRepo>;
