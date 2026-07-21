import type { DbType } from "../../lib/db";
import { notFound } from "../../lib/errors";
import type { AuditPort } from "../../shared/ports/audit.port";
import { INVITE_STATUS, USER_ROLE, ACTOR_TYPE } from "../../shared/constants";
import { validateClaim } from "./invite.service";
import type { InviteRepo } from "./invite.repo";

export function createInviteHandler(deps: {
  inviteService: ReturnType<typeof createInviteService>;
}) {
  const { inviteService } = deps;

  async function verify(token: string) {
    return inviteService.verify(token);
  }

  async function claim(userId: string, userEmail: string, token: string) {
    return inviteService.claim(userId, userEmail, token);
  }

  return { verify, claim };
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

export type InviteHandler = ReturnType<typeof createInviteHandler>;
