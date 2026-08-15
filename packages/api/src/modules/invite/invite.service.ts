import type { tutorInvite, tutorProfile } from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import { hashInviteToken } from "../../lib/tokens";
import { INVITE_STATUS, USER_ROLE, ACTOR_TYPE } from "../../shared/constants";
import type { InviteRepo } from "./invite.repo";
import type { InviteAuditPort } from "./index";
import {
  InviteNotFoundError,
  InviteEmailMismatchError,
  ProfileAlreadyExistsError,
} from "./invite.errors";

type InviteRow = typeof tutorInvite.$inferSelect;
type TutorProfileRow = typeof tutorProfile.$inferSelect;

function validateClaim(
  invite: InviteRow | undefined,
  userEmail: string,
  existingProfile: TutorProfileRow | undefined,
  token: string,
): void {
  if (!invite) {
    throw new InviteNotFoundError(token);
  }

  if (invite.email.toLowerCase() !== userEmail.toLowerCase()) {
    throw new InviteEmailMismatchError(invite.id, userEmail);
  }

  if (existingProfile) {
    throw new ProfileAlreadyExistsError(userEmail);
  }
}

export function createInviteService(deps: {
  inviteRepo: InviteRepo;
  auditPort: InviteAuditPort;
  db: DbType;
}) {
  const { inviteRepo, auditPort, db } = deps;

  async function verify(token: string) {
    const invite = await inviteRepo.findInviteByToken(
      db,
      hashInviteToken(token),
    );
    if (!invite) {
      throw new InviteNotFoundError(token);
    }
    return {
      email: invite.email,
      displayName: invite.displayName,
      inviteId: invite.id,
    };
  }

  async function claim(userId: string, userEmail: string, token: string) {
    const invite = await inviteRepo.findInviteByToken(
      db,
      hashInviteToken(token),
    );
    const existingProfile = await inviteRepo.findTutorProfileByUserId(
      db,
      userId,
    );

    validateClaim(invite, userEmail, existingProfile, token);

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
        throw new InviteNotFoundError(invite!.id);
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
