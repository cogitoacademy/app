import { eq, desc, and } from "drizzle-orm";
import { achievement } from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { AuditPort } from "../../shared/ports/audit.port";
import { notFound } from "../../lib/errors";
import { ORPCError } from "@orpc/server";

export interface AchievementInput {
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

export interface UpdateAchievementInput {
  id: string;
  data: Partial<AchievementInput>;
}

export interface AdminListInput {
  status?: string;
  limit?: number;
  offset?: number;
}

export interface AdminReviewInput {
  achievementId: string;
  status: "approved" | "rejected";
  adminNote?: string;
}

export type AchievementService = ReturnType<typeof createAchievementService>;

export function createAchievementService(deps: {
  db: DbType;
  audit: AuditPort;
}) {
  const { db, audit } = deps;

  async function list(userId: string) {
    return db
      .select()
      .from(achievement)
      .where(eq(achievement.userId, userId))
      .orderBy(desc(achievement.createdAt));
  }

  async function create(userId: string, input: AchievementInput) {
    const [result] = await db
      .insert(achievement)
      .values({
        userId,
        eventName: input.eventName,
        category: input.category,
        award: input.award,
        level: input.level,
        eventDate: input.eventDate || null,
        location: input.location || null,
        description: input.description || null,
        subjects: input.subjects || [],
        imageUrl: input.imageUrl || null,
      })
      .returning();
    return result;
  }

  async function update(userId: string, input: UpdateAchievementInput) {
    const [existing] = await db
      .select()
      .from(achievement)
      .where(and(eq(achievement.id, input.id), eq(achievement.userId, userId)))
      .limit(1);

    if (!existing || existing.status !== "pending") {
      throw new ORPCError("BAD_REQUEST", {
        message: "Can only edit pending achievements",
      });
    }

    const [updated] = await db
      .update(achievement)
      .set(input.data)
      .where(and(eq(achievement.id, input.id), eq(achievement.userId, userId)))
      .returning();

    return updated;
  }

  async function remove(userId: string, id: string) {
    const [existing] = await db
      .select()
      .from(achievement)
      .where(and(eq(achievement.id, id), eq(achievement.userId, userId)))
      .limit(1);

    if (!existing || existing.status !== "pending") {
      throw new ORPCError("BAD_REQUEST", {
        message: "Can only delete pending achievements",
      });
    }

    return db
      .delete(achievement)
      .where(and(eq(achievement.id, id), eq(achievement.userId, userId)));
  }

  async function adminList(input: AdminListInput = {}) {
    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;
    const conditions = input.status
      ? eq(achievement.status, input.status)
      : undefined;
    return db
      .select()
      .from(achievement)
      .where(conditions)
      .orderBy(desc(achievement.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async function adminReview(adminId: string, input: AdminReviewInput) {
    const [existing] = await db
      .select()
      .from(achievement)
      .where(eq(achievement.id, input.achievementId))
      .limit(1);

    if (!existing) throw notFound("Achievement not found");

    return db.transaction(async (tx) => {
      const [updated] = await tx
        .update(achievement)
        .set({ status: input.status, adminNote: input.adminNote || null })
        .where(eq(achievement.id, input.achievementId))
        .returning();

      await audit.record({
        db: tx,
        actorId: adminId,
        actorType: "admin",
        action: `achievement_${input.status}`,
        targetId: input.achievementId,
        targetType: "achievement",
        details: {
          adminNote: input.adminNote,
          previousStatus: existing.status,
        },
      });

      return updated;
    });
  }

  return { list, create, update, remove, adminList, adminReview };
}
