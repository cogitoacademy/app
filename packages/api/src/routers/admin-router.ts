import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { count, desc, eq } from "drizzle-orm";
import { createDb } from "@cogito-app/db";
import { user } from "@cogito-app/db/schema";

import { adminProcedure } from "../index";

const db = createDb();

export const adminRouter = {
  listUsers: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }).optional(),
    )
    .handler(async ({ input }) => {
      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;

      const total = await db.select({ count: count() }).from(user);

      const users = await db
        .select()
        .from(user)
        .orderBy(desc(user.createdAt))
        .limit(limit)
        .offset(offset);

      return {
        users,
        total: total[0]?.count ?? 0,
        limit,
        offset,
      };
    }),

  setRole: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        role: z.enum(["student", "tutor", "admin"]),
      }),
    )
    .handler(async ({ input }) => {
      const target = await db.select().from(user).where(eq(user.id, input.userId)).limit(1);
      if (!target[0]) {
        throw new ORPCError("NOT_FOUND", { message: "User not found" });
      }

      const updated = await db
        .update(user)
        .set({ role: input.role })
        .where(eq(user.id, input.userId))
        .returning();

      return updated[0];
    }),
};
