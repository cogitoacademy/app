import { eq, and, gt } from "drizzle-orm";
import { tutorInvite, tutorProfile, user } from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { AuditPort } from "../../shared/ports/audit.port";
import { notFound, forbidden, conflict } from "../../lib/errors";

export type InviteService = ReturnType<typeof createInviteService>;

export function createInviteService(deps: { db: DbType; audit: AuditPort }) {
  const { db, audit } = deps;

  async function verify(token: string) {
    const invite = await db.query.tutorInvite.findFirst({
      where: and(
        eq(tutorInvite.token, token),
        eq(tutorInvite.status, "invited"),
        gt(tutorInvite.expiresAt, new Date()),
      ),
    });

    if (!invite) {
      throw notFound("Invite not found, already accepted, or expired");
    }

    return {
      email: invite.email,
      displayName: invite.displayName,
      inviteId: invite.id,
    };
  }

  async function claim(userId: string, userEmail: string, token: string) {
    const invite = await db.query.tutorInvite.findFirst({
      where: and(
        eq(tutorInvite.token, token),
        eq(tutorInvite.status, "invited"),
        gt(tutorInvite.expiresAt, new Date()),
      ),
    });

    if (!invite) {
      throw notFound("Invite not found, already accepted, or expired");
    }

    if (invite.email.toLowerCase() !== userEmail.toLowerCase()) {
      throw forbidden(
        "This invite is for a different email address. Please log in with the invited email.",
      );
    }

    const existingProfile = await db.query.tutorProfile.findFirst({
      where: eq(tutorProfile.userId, userId),
    });

    if (existingProfile) {
      throw conflict("You already have a tutor profile");
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
        throw notFound("Invite not found, already accepted, or expired");
      }

      const [profile] = await tx
        .insert(tutorProfile)
        .values({
          userId,
          inviteId: invite.id,
          displayName: invite.displayName,
          expertise: [],
          proofUrls: [],
          onboardingStatus: "draft",
        })
        .returning();

      await tx.update(user).set({ role: "tutor" }).where(eq(user.id, userId));

      await audit.record({
        db: tx,
        actorId: userId,
        actorType: "tutor",
        action: "tutor_invite_claimed",
        targetId: invite.id,
        targetType: "tutor_invite",
        details: { profileId: profile!.id },
      });

      return { updatedInvite: acceptedInvite, newProfile: profile };
    });

    return { invite: updatedInvite, profile: newProfile };
  }

  return { verify, claim };
}
