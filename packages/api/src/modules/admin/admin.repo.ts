import { count, desc, eq, and } from "drizzle-orm";
import { user } from "@cogito-app/db/schema";
import type { DbOrTx } from "../../lib/tx";
import { USER_ROLE } from "../../shared/constants";

export type UserRole = "student" | "tutor" | "admin";
export type UserRow = typeof user.$inferSelect;

/**
 * Lists users with pagination, newest first.
 *
 * @param conn - the database connection or active transaction
 * @param limit - the max number of rows to return
 * @param offset - the number of rows to skip
 * @returns the user rows
 */
export async function listUsers(
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

/**
 * Counts all users.
 *
 * @param conn - the database connection or active transaction
 * @returns the total user count
 */
export async function countUsers(conn: DbOrTx): Promise<number> {
  const [row] = await conn.select({ count: count() }).from(user);
  return row?.count ?? 0;
}

/**
 * Fetches a user by id.
 *
 * @param conn - the database connection or active transaction
 * @param userId - the user id
 * @returns the user row, or null
 */
export async function getById(
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

/**
 * Counts admin-role users.
 *
 * @param conn - the database connection or active transaction
 * @returns the admin user count
 */
export async function countAdmins(conn: DbOrTx): Promise<number> {
  const [row] = await conn
    .select({ count: count() })
    .from(user)
    .where(eq(user.role, USER_ROLE.ADMIN));
  return row?.count ?? 0;
}

/**
 * Updates a user's role.
 *
 * @param conn - the database connection or active transaction
 * @param userId - the user id
 * @param role - the new role
 * @returns the updated user row
 */
export async function updateRole(
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

/**
 * Updates a user's role only when the current role matches expectedRole (optimistic).
 *
 * @param conn - the database connection or active transaction
 * @param userId - the user id
 * @param role - the new role
 * @param expectedRole - the role the user must currently have
 * @returns the updated rows (empty when the expected role did not match)
 */
export async function updateRoleWithExpected(
  conn: DbOrTx,
  userId: string,
  role: UserRole,
  expectedRole: string,
): Promise<UserRow[]> {
  return conn
    .update(user)
    .set({ role })
    .where(and(eq(user.id, userId), eq(user.role, expectedRole)))
    .returning();
}

export function createAdminRepo() {
  return {
    listUsers,
    countUsers,
    getById,
    countAdmins,
    updateRole,
    updateRoleWithExpected,
  };
}

export type AdminRepo = ReturnType<typeof createAdminRepo>;
