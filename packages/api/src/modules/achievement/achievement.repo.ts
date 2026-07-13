import { eq, desc, and } from "drizzle-orm";
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
  limit?: number;
  offset?: number;
}

async function listByUserId(conn: DbOrTx, userId: string) {
  return conn
    .select()
    .from(achievement)
    .where(eq(achievement.userId, userId))
    .orderBy(desc(achievement.createdAt));
}

async function insert(conn: DbOrTx, params: InsertAchievementParams) {
  const [result] = await conn
    .insert(achievement)
    .values({
      userId: params.userId,
      eventName: params.eventName,
      category: params.category,
      award: params.award,
      level: params.level,
      eventDate: params.eventDate || null,
      location: params.location || null,
      description: params.description || null,
      subjects: params.subjects || [],
      imageUrl: params.imageUrl || null,
    })
    .returning();
  return result;
}

async function findByIdForUser(conn: DbOrTx, id: string, userId: string) {
  const [existing] = await conn
    .select()
    .from(achievement)
    .where(and(eq(achievement.id, id), eq(achievement.userId, userId)))
    .limit(1);
  return existing;
}

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

async function deleteRow(conn: DbOrTx, id: string, userId: string) {
  return conn
    .delete(achievement)
    .where(and(eq(achievement.id, id), eq(achievement.userId, userId)));
}

async function adminList(conn: DbOrTx, input: AdminListInput = {}) {
  const limit = input.limit ?? 50;
  const offset = input.offset ?? 0;
  const conditions = input.status
    ? eq(achievement.status, input.status)
    : undefined;
  return conn
    .select()
    .from(achievement)
    .where(conditions)
    .orderBy(desc(achievement.createdAt))
    .limit(limit)
    .offset(offset);
}

async function getById(conn: DbOrTx, id: string) {
  const [existing] = await conn
    .select()
    .from(achievement)
    .where(eq(achievement.id, id))
    .limit(1);
  return existing;
}

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
    deleteRow,
    adminList,
    getById,
    updateStatus,
  };
}

export type AchievementRepo = ReturnType<typeof createAchievementRepo>;
