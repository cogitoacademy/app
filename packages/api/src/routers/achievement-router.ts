import { db } from "@cogito-app/db";
import { achievement } from "@cogito-app/db/schema/achievement";
import { eq, desc, and } from "drizzle-orm";
import z from "zod";

import { protectedProcedure, adminProcedure } from "../index";

const achievementSchema = z.object({
  eventName: z.string().min(1, "Event name is required"),
  category: z.string().min(1, "Category is required"),
  award: z.string().min(1, "Award is required"),
  level: z.string().min(1, "Level is required"),
  eventDate: z.string().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  subjects: z.array(z.string()).optional(),
  imageUrl: z.string().optional(),
});

export const achievementRouter = {
  list: protectedProcedure.handler(async ({ context }) => {
    const userId = context.session.user.id;
    return await db
      .select()
      .from(achievement)
      .where(eq(achievement.userId, userId))
      .orderBy(desc(achievement.createdAt));
  }),

  create: protectedProcedure
    .input(achievementSchema)
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      return await db
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
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        data: achievementSchema.partial(),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const existing = await db
        .select()
        .from(achievement)
        .where(
          and(eq(achievement.id, input.id), eq(achievement.userId, userId)),
        )
        .limit(1);
      if (!existing[0] || existing[0].status !== "pending") {
        throw new Error("Can only edit pending achievements");
      }
      return await db
        .update(achievement)
        .set(input.data)
        .where(
          and(eq(achievement.id, input.id), eq(achievement.userId, userId)),
        )
        .returning();
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const existing = await db
        .select()
        .from(achievement)
        .where(
          and(eq(achievement.id, input.id), eq(achievement.userId, userId)),
        )
        .limit(1);
      if (!existing[0] || existing[0].status !== "pending") {
        throw new Error("Can only delete pending achievements");
      }
      return await db
        .delete(achievement)
        .where(
          and(eq(achievement.id, input.id), eq(achievement.userId, userId)),
        );
    }),

  adminList: adminProcedure
    .input(z.object({ status: z.string().optional() }).optional())
    .handler(async ({ input }) => {
      const conditions = input?.status
        ? eq(achievement.status, input.status)
        : undefined;
      return await db
        .select()
        .from(achievement)
        .where(conditions)
        .orderBy(desc(achievement.createdAt));
    }),

  adminReview: adminProcedure
    .input(
      z.object({
        achievementId: z.string(),
        status: z.enum(["approved", "rejected"]),
        adminNote: z.string().optional(),
      }),
    )
    .handler(async ({ input }) => {
      return await db
        .update(achievement)
        .set({
          status: input.status,
          adminNote: input.adminNote || null,
        })
        .where(eq(achievement.id, input.achievementId))
        .returning();
    }),
};