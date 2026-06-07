import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { eq, and, gt } from "drizzle-orm";
import { createDb } from "@cogito-app/db";
import { tutorInvite, tutorProfile, user, auditLog } from "@cogito-app/db/schema";
import { publicProcedure, protectedProcedure } from "../index";

const db = createDb();

export const inviteRouter = {
  verify: publicProcedure
    .route({
      method: "POST",
      path: "/invites/verify",
      tags: ["Invites"],
      summary: "Verify invite",
      description: "Validates a tutor invite token",
    })
    .input(z.object({ token: z.string() }))
    .handler(async ({ input }) => {
      const invite = await db.query.tutorInvite.findFirst({
        where: and(
          eq(tutorInvite.token, input.token),
          eq(tutorInvite.status, "invited"),
          gt(tutorInvite.expiresAt, new Date()),
        ),
      });

      if (!invite) {
        throw new ORPCError("NOT_FOUND", {
          message: "Invite not found, already accepted, or expired",
        });
      }

      return {
        email: invite.email,
        displayName: invite.displayName,
        inviteId: invite.id,
      };
    }),

  claim: protectedProcedure
    .route({
      method: "POST",
      path: "/invites/claim",
      tags: ["Invites"],
      summary: "Claim invite",
      description: "Claims a tutor invite and creates a tutor profile",
    })
    .input(z.object({ token: z.string() }))
    .handler(async ({ context, input }) => {
      const currentUser = context.session.user;
      const userId = currentUser.id;
      const userEmail = currentUser.email;

      const invite = await db.query.tutorInvite.findFirst({
        where: and(
          eq(tutorInvite.token, input.token),
          eq(tutorInvite.status, "invited"),
          gt(tutorInvite.expiresAt, new Date()),
        ),
      });

      if (!invite) {
        throw new ORPCError("NOT_FOUND", {
          message: "Invite not found, already accepted, or expired",
        });
      }

      if (invite.email.toLowerCase() !== userEmail.toLowerCase()) {
        throw new ORPCError("FORBIDDEN", {
          message: "This invite is for a different email address. Please log in with the invited email.",
        });
      }

      const existingProfile = await db.query.tutorProfile.findFirst({
        where: eq(tutorProfile.userId, userId),
      });

      if (existingProfile) {
        throw new ORPCError("CONFLICT", {
          message: "You already have a tutor profile",
        });
      }

      const { updatedInvite, newProfile } = await db.transaction(async (tx) => {
        const [acceptedInvite] = await tx
          .update(tutorInvite)
          .set({
            status: "accepted",
            acceptedBy: userId,
            acceptedAt: new Date(),
          })
          .where(
            and(
              eq(tutorInvite.id, invite.id),
              eq(tutorInvite.status, "invited"),
              gt(tutorInvite.expiresAt, new Date()),
            ),
          )
          .returning();

        if (!acceptedInvite) {
          throw new ORPCError("NOT_FOUND", {
            message: "Invite not found, already accepted, or expired",
          });
        }

        const [profile] = await tx
          .insert(tutorProfile)
          .values({
            id: crypto.randomUUID(),
            userId,
            inviteId: invite.id,
            displayName: invite.displayName,
            expertise: [],
            proofUrls: [],
            onboardingStatus: "draft",
          })
          .returning();

        await tx.update(user)
          .set({ role: "tutor" })
          .where(eq(user.id, userId));

        await tx.insert(auditLog).values({
          id: crypto.randomUUID(),
          actorId: userId,
          actorType: "tutor",
          action: "tutor_invite_claimed",
          targetId: invite.id,
          targetType: "tutor_invite",
          details: { profileId: profile!.id },
        });

        return { updatedInvite: acceptedInvite, newProfile: profile };
      });

      return {
        invite: updatedInvite,
        profile: newProfile,
      };
    }),
};
