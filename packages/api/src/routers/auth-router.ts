import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { eq } from "drizzle-orm";
import { createDb } from "@cogito-app/db";
import { studentProfile } from "@cogito-app/db/schema";

import { protectedProcedure } from "../index";

const db = createDb();

export const authRouter = {
  me: protectedProcedure
    .input(z.void())
    .handler(async ({ context }) => {
      const profile = await db.query.studentProfile.findFirst({
        where: eq(studentProfile.userId, context.session.user.id),
      });

      return {
        user: context.session.user,
        profile,
      };
    }),

  getProfile: protectedProcedure
    .input(z.void())
    .handler(async ({ context }) => {
      const profile = await db.query.studentProfile.findFirst({
        where: eq(studentProfile.userId, context.session.user.id),
      });

      if (!profile) {
        throw new ORPCError("NOT_FOUND", {
          message: "Profile not found",
        });
      }

      return profile;
    }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        phoneNumber: z.string().optional(),
        schoolName: z.string().optional(),
        gradeLevel: z.string().optional(),
        parentName: z.string().optional(),
        parentPhone: z.string().optional(),
        parentEmail: z.string().email().optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      const existing = await db.query.studentProfile.findFirst({
        where: eq(studentProfile.userId, context.session.user.id),
      });

      if (existing) {
        const updated = await db
          .update(studentProfile)
          .set(input)
          .where(eq(studentProfile.userId, context.session.user.id))
          .returning();
        return updated[0];
      }

      const created = await db
        .insert(studentProfile)
        .values({
          id: crypto.randomUUID(),
          userId: context.session.user.id,
          ...input,
        })
        .returning();
      return created[0];
    }),
};
