import {
  and,
  count,
  desc,
  eq,
  getTableColumns,
  inArray,
  sql,
} from "drizzle-orm";
import { achievement, user } from "@cogito-app/db/schema";
import type { DbOrTx } from "../../lib/tx";

export interface InsertAchievementParams {
  userId: string;
  eventName: string;
  category: string;
  award: string;
  level: string;
  issuer?: string;
  visibility?: boolean;
  awardingDate?: string;
  location?: string;
  description?: string;
  subjects?: string[];
  evidenceUrl?: string;
  documentationUrl?: string;
}

export interface UpdateAchievementData {
  eventName?: string;
  category?: string;
  award?: string;
  level?: string;
  issuer?: string | null;
  visibility?: boolean;
  awardingDate?: string | null;
  location?: string | null;
  description?: string | null;
  subjects?: string[] | null;
  evidenceUrl?: string | null;
  documentationUrl?: string | null;
}

export interface AdminListInput {
  status?: string;
  limit: number;
  offset: number;
}

export interface AchievementListInput {
  category?: string;
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
async function listByUserId(
  conn: DbOrTx,
  userId: string,
  input?: AchievementListInput,
) {
  const conditions = [eq(achievement.userId, userId)];
  if (input?.category) {
    conditions.push(eq(achievement.category, input.category));
  }
  if (input?.status) {
    conditions.push(
      input.status === "pending"
        ? inArray(achievement.status, ["pending", "pending_review"])
        : eq(achievement.status, input.status),
    );
  }

  const query = conn
    .select()
    .from(achievement)
    .where(and(...conditions))
    .orderBy(desc(achievement.createdAt));

  if (!input) return query;
  return query.limit(input.limit).offset(input.offset);
}

async function countByUserId(conn: DbOrTx, userId: string) {
  return conn
    .select({ status: achievement.status, count: count() })
    .from(achievement)
    .where(eq(achievement.userId, userId))
    .groupBy(achievement.status);
}

async function countAll(conn: DbOrTx) {
  return conn
    .select({ status: achievement.status, count: count() })
    .from(achievement)
    .groupBy(achievement.status);
}

/**
 * Lists approved + visible achievements for the public landing (F16), with
 * the owner's display name attached.
 */
export async function listApprovedPublic(conn: DbOrTx) {
  return conn
    .select({
      id: achievement.id,
      eventName: achievement.eventName,
      category: achievement.category,
      award: achievement.award,
      level: achievement.level,
      issuer: achievement.issuer,
      awardingDate: achievement.awardingDate,
      location: achievement.location,
      description: achievement.description,
      subjects: achievement.subjects,
      documentationUrl: achievement.documentationUrl,
      createdAt: achievement.createdAt,
      displayName: user.name,
    })
    .from(achievement)
    .innerJoin(user, eq(user.id, achievement.userId))
    .where(
      and(eq(achievement.status, "approved"), eq(achievement.visibility, true)),
    )
    .orderBy(desc(achievement.awardingDate), desc(achievement.createdAt))
    .limit(100);
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
      issuer: params.issuer ?? null,
      visibility: params.visibility ?? true,
      awardingDate: params.awardingDate ?? null,
      location: params.location ?? null,
      description: params.description ?? null,
      subjects: params.subjects ?? [],
      evidenceUrl: params.evidenceUrl ?? null,
      documentationUrl: params.documentationUrl ?? null,
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
 * Updates an achievement by id with optimistic concurrency for admin edits.
 * The service performs the status guard before calling this method because an
 * admin correction is intentionally not scoped to the achievement owner.
 */
async function updateByIdWithVersion(
  conn: DbOrTx,
  id: string,
  expectedVersion: number,
  data: UpdateAchievementData,
) {
  return conn
    .update(achievement)
    .set({ ...data, version: sql`${achievement.version} + 1` })
    .where(
      and(eq(achievement.id, id), eq(achievement.version, expectedVersion)),
    )
    .returning();
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
 * Lists achievements for admin review with pagination and optional status filter.
 *
 * @param conn - the database connection or active transaction
 * @param input - the admin list input (status, limit, offset)
 * @returns the matching achievement rows, newest first
 */
async function adminList(conn: DbOrTx, input: AdminListInput) {
  const { limit, offset, status } = input;
  return conn
    .select({
      ...getTableColumns(achievement),
      student: {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
      },
    })
    .from(achievement)
    .leftJoin(user, eq(achievement.userId, user.id))
    .where(
      status === "pending"
        ? inArray(achievement.status, ["pending", "pending_review"])
        : status
          ? eq(achievement.status, status)
          : undefined,
    )
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
  expectedStatus?: string,
  expectedVersion?: number,
) {
  const conditions = [eq(achievement.id, id)];
  if (expectedStatus !== undefined) {
    conditions.push(eq(achievement.status, expectedStatus));
  }
  if (expectedVersion !== undefined) {
    conditions.push(eq(achievement.version, expectedVersion));
  }
  const [updated] = await conn
    .update(achievement)
    .set({
      status,
      adminNote: adminNote ?? null,
      version: sql`${achievement.version} + 1`,
    })
    .where(and(...conditions))
    .returning();
  return updated;
}

export function createAchievementRepo() {
  return {
    listByUserId,
    countByUserId,
    countAll,
    listApprovedPublic,
    insert,
    findByIdForUser,
    update,
    updateWithVersion,
    updateByIdWithVersion,
    deleteWithVersion,
    adminList,
    getById,
    updateStatus,
  };
}

export type AchievementRepo = ReturnType<typeof createAchievementRepo>;
