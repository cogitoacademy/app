import type { tutorInvite, tutorProfile } from "@cogito-app/db/schema";
import type { ORPCError } from "@orpc/server";
import type { DbType } from "../../lib/db";
import { notFound, forbidden, conflict } from "../../lib/errors";
import type { AuditPort } from "../../shared/ports/audit.port";
import { INVITE_STATUS, USER_ROLE, ACTOR_TYPE } from "../../shared/constants";
import type { InviteRepo } from "./invite.repo";

type InviteRow = typeof tutorInvite.$inferSelect;
type TutorProfileRow = typeof tutorProfile.$inferSelect;

export type ValidationResult =
  | { ok: true }
  | { ok: false; error: ORPCError<any, any> };

export function validateClaim(
  invite: InviteRow | undefined,
  userEmail: string,
  existingProfile: TutorProfileRow | undefined,
): ValidationResult {
  if (!invite) {
    return {
      ok: false,
      error: notFound("Invite not found, already accepted, or expired"),
    };
  }

  if (invite.email.toLowerCase() !== userEmail.toLowerCase()) {
    return {
      ok: false,
      error: forbidden(
        "This invite is for a different email address. Please log in with the invited email.",
      ),
    };
  }

  if (existingProfile) {
    return {
      ok: false,
      error: conflict("You already have a tutor profile"),
    };
  }

  return { ok: true };
}

export function createInviteService(deps: {
  inviteRepo: InviteRepo;
  auditPort: AuditPort;
  db: DbType;
}) {
  const { inviteRepo, auditPort, db } = deps;

  async function verify(token: string) {
    const invite = await inviteRepo.findInviteByToken(db, token);
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
    const invite = await inviteRepo.findInviteByToken(db, token);
    const existingProfile = await inviteRepo.findTutorProfileByUserId(
      db,
      userId,
    );

    const result = validateClaim(invite, userEmail, existingProfile);
    if (!result.ok) throw result.error;

    return db.transaction(async (tx) => {
      const [acceptedInvite] = await inviteRepo.updateInviteStatus(
        tx,
        invite!.id,
        {
          status: INVITE_STATUS.ACCEPTED,
          acceptedBy: userId,
          acceptedAt: new Date(),
        },
        { status: INVITE_STATUS.INVITED, expiresAt: new Date() },
      );

      if (!acceptedInvite) {
        throw notFound("Invite not found, already accepted, or expired");
      }

      const profile = await inviteRepo.insertTutorProfile(tx, {
        userId,
        inviteId: invite!.id,
        displayName: invite!.displayName,
      });

      await inviteRepo.updateUserRole(tx, userId, USER_ROLE.TUTOR);

      await auditPort.record({
        db: tx,
        actorId: userId,
        actorType: ACTOR_TYPE.TUTOR,
        action: "tutor_invite_claimed",
        targetId: invite!.id,
        targetType: "tutor_invite",
        details: { profileId: profile!.id },
      });

      return { invite: acceptedInvite, profile };
    });
  }

  return { verify, claim };
}

export type InviteService = ReturnType<typeof createInviteService>;
