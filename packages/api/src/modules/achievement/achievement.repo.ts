import { eq, desc, and, sql } from "drizzle-orm";
import { achievement } from "@cogito-app/db/schema";
import type { DbOrTx } from "../../lib/tx";

export interface InsertAchievementParams {
  userId: string;
  eventName: string;
  category: string;
  award: string;
  level: string;
  eventDate?: string;
  location?: string;
  description?: string;
  subjects?: string[];
  imageUrl?: string;
}

export interface UpdateAchievementData {
  eventName?: string;
  category?: string;
  award?: string;
  level?: string;
  eventDate?: string;
  location?: string;
  description?: string;
  subjects?: string[];
  imageUrl?: string;
}

export interface AdminListInput {
  status?: string;
  limit: number;
  offset: number;
}

/**
 * Lists achievements for a user, newest first.
 *
 * @param conn - the database connection or active transaction
 * @param userId - the owner of the achievements
 * @returns the user's achievement rows
 */
async function listByUserId(conn: DbOrTx, userId: string) {
  return conn
    .select()
    .from(achievement)
    .where(eq(achievement.userId, userId))
    .orderBy(desc(achievement.createdAt));
}

/**
 * Inserts a new achievement.
 *
 * @param conn - the database connection or active transaction
 * @param params - the achievement fields to insert
 * @returns the inserted achievement row
 */
async function insert(conn: DbOrTx, params: InsertAchievementParams) {
  const [result] = await conn
    .insert(achievement)
    .values({
      userId: params.userId,
      eventName: params.eventName,
      category: params.category,
      award: params.award,
      level: params.level,
      eventDate: params.eventDate ?? null,
      location: params.location ?? null,
      description: params.description ?? null,
      subjects: params.subjects ?? [],
      imageUrl: params.imageUrl ?? null,
    })
    .returning();
  return result;
}

/**
 * Finds an achievement by id, scoped to the owning user.
 *
 * @param conn - the database connection or active transaction
 * @param id - the achievement id
 * @param userId - the owning user
 * @returns the achievement row, or null when not found
 */
async function findByIdForUser(conn: DbOrTx, id: string, userId: string) {
  const [existing] = await conn
    .select()
    .from(achievement)
    .where(and(eq(achievement.id, id), eq(achievement.userId, userId)))
    .limit(1);
  return existing;
}

/**
 * Updates an achievement scoped to the owning user.
 *
 * @param conn - the database connection or active transaction
 * @param id - the achievement id
 * @param userId - the owning user
 * @param data - the fields to update
 * @returns the updated row, or undefined when the achievement was not found
 */
async function update(
  conn: DbOrTx,
  id: string,
  userId: string,
  data: UpdateAchievementData,
) {
  const [updated] = await conn
    .update(achievement)
    .set(data)
    .where(and(eq(achievement.id, id), eq(achievement.userId, userId)))
    .returning();
  return updated;
}

/**
 * Updates an achievement with optimistic concurrency via version.
 *
 * @param conn - the database connection or active transaction
 * @param id - the achievement id
 * @param userId - the owning user
 * @param expectedVersion - the version the row must currently have
 * @param data - the fields to update
 * @returns the updated rows (empty when the version did not match)
 */
async function updateWithVersion(
  conn: DbOrTx,
  id: string,
  userId: string,
  expectedVersion: number,
  data: UpdateAchievementData,
) {
  const rows = await conn
    .update(achievement)
    .set({ ...data, version: sql`${achievement.version} + 1` })
    .where(
      and(
        eq(achievement.id, id),
        eq(achievement.userId, userId),
        eq(achievement.version, expectedVersion),
      ),
    )
    .returning();
  return rows;
}

/**
 * Deletes an achievement with optimistic concurrency via version.
 *
 * @param conn - the database connection or active transaction
 * @param id - the achievement id
 * @param userId - the owning user
 * @param expectedVersion - the version the row must currently have
 * @returns the deleted rows (empty when the version did not match)
 */
async function deleteWithVersion(
  conn: DbOrTx,
  id: string,
  userId: string,
  expectedVersion: number,
) {
  return conn
    .delete(achievement)
    .where(
      and(
        eq(achievement.id, id),
        eq(achievement.userId, userId),
        eq(achievement.version, expectedVersion),
      ),
    )
    .returning();
}

/**
 * Deletes an achievement scoped to the owning user.
 *
 * @param conn - the database connection or active transaction
 * @param id - the achievement id
 * @param userId - the owning user
 */
async function deleteRow(conn: DbOrTx, id: string, userId: string) {
  return conn
    .delete(achievement)
    .where(and(eq(achievement.id, id), eq(achievement.userId, userId)));
}

/**
 * Lists achievements for admin review with pagination and optional status filter.
 *
 * @param conn - the database connection or active transaction
 * @param input - the admin list input (status, limit, offset)
 * @returns the matching achievement rows, newest first
 */
async function adminList(conn: DbOrTx, input: AdminListInput) {
  const { limit, offset, status } = input;
  return conn
    .select()
    .from(achievement)
    .where(status ? eq(achievement.status, status) : undefined)
    .orderBy(desc(achievement.createdAt))
    .limit(limit)
    .offset(offset);
}

/**
 * Finds an achievement by id.
 *
 * @param conn - the database connection or active transaction
 * @param id - the achievement id
 * @returns the achievement row, or null when not found
 */
async function getById(conn: DbOrTx, id: string) {
  const [existing] = await conn
    .select()
    .from(achievement)
    .where(eq(achievement.id, id))
    .limit(1);
  return existing;
}

/**
 * Updates an achievement's admin review status and optional admin note.
 *
 * @param conn - the database connection or active transaction
 * @param id - the achievement id
 * @param status - the new review status
 * @param adminNote - optional note from the admin reviewer
 * @returns the updated row, or undefined when the achievement was not found
 */
async function updateStatus(
  conn: DbOrTx,
  id: string,
  status: string,
  adminNote?: string | null,
) {
  const [updated] = await conn
    .update(achievement)
    .set({ status, adminNote: adminNote ?? null })
    .where(eq(achievement.id, id))
    .returning();
  return updated;
}

export function createAchievementRepo() {
  return {
    listByUserId,
    insert,
    findByIdForUser,
    update,
    updateWithVersion,
    deleteRow,
    deleteWithVersion,
    adminList,
    getById,
    updateStatus,
  };
}

export type AchievementRepo = ReturnType<typeof createAchievementRepo>;
