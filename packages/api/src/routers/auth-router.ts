import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { eq } from "drizzle-orm";
import { createDb } from "@cogito-app/db";
import { studentProfile, tutorProfile } from "@cogito-app/db/schema";

import { protectedProcedure } from "../index";

const db = createDb();

export const authRouter = {
  me: protectedProcedure
    .route({
      method: "POST",
      path: "/auth/me",
      tags: ["Auth"],
      summary: "Get current user",
      description: "Returns the authenticated user with student and tutor profile data",
    })
    .input(z.void())
    .handler(async ({ context }) => {
      const userId = context.session.user.id;

      const [profile, tutor] = await Promise.all([
        db.query.studentProfile.findFirst({
          where: eq(studentProfile.userId, userId),
        }),
        db.query.tutorProfile.findFirst({
          where: eq(tutorProfile.userId, userId),
        }),
      ]);

      return {
        user: context.session.user,
        profile,
        tutorProfile: tutor ?? null,
      };
    }),

  getProfile: protectedProcedure
    .route({
      method: "POST",
      path: "/auth/profile/get",
      tags: ["Auth"],
      summary: "Get student profile",
      description: "Returns the authenticated user's student profile",
    })
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
    .route({
      method: "POST",
      path: "/auth/profile/update",
      tags: ["Auth"],
      summary: "Update student profile",
      description: "Creates or updates the authenticated user's student profile",
    })
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
