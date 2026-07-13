import { eq, and, gt } from "drizzle-orm";
import { tutorInvite, tutorProfile, user } from "@cogito-app/db/schema";
import type { DbOrTx } from "../../lib/tx";
import { INVITE_STATUS, ONBOARDING_STATUS } from "../../shared/constants";

export interface InsertTutorProfileParams {
  userId: string;
  inviteId: string;
  displayName: string;
}

export function createInviteRepo() {
  async function findInviteByToken(conn: DbOrTx, token: string) {
    return conn.query.tutorInvite.findFirst({
      where: and(
        eq(tutorInvite.token, token),
        eq(tutorInvite.status, INVITE_STATUS.INVITED),
        gt(tutorInvite.expiresAt, new Date()),
      ),
    });
  }

  async function updateInviteStatus(
    conn: DbOrTx,
    inviteId: string,
    updates: {
      status: string;
      acceptedBy?: string | null;
      acceptedAt?: Date | null;
    },
    conditions: { status: string; expiresAt: Date },
  ) {
    return conn
      .update(tutorInvite)
      .set(updates)
      .where(
        and(
          eq(tutorInvite.id, inviteId),
          eq(tutorInvite.status, conditions.status),
          gt(tutorInvite.expiresAt, conditions.expiresAt),
        ),
      )
      .returning();
  }

  async function findTutorProfileByUserId(conn: DbOrTx, userId: string) {
    return conn.query.tutorProfile.findFirst({
      where: eq(tutorProfile.userId, userId),
    });
  }

  async function insertTutorProfile(
    conn: DbOrTx,
    params: InsertTutorProfileParams,
  ) {
    const [profile] = await conn
      .insert(tutorProfile)
      .values({
        userId: params.userId,
        inviteId: params.inviteId,
        displayName: params.displayName,
        expertise: [],
        proofUrls: [],
        onboardingStatus: ONBOARDING_STATUS.DRAFT,
      })
      .returning();
    return profile;
  }

  async function updateUserRole(conn: DbOrTx, userId: string, role: string) {
    await conn.update(user).set({ role }).where(eq(user.id, userId));
  }

  return {
    findInviteByToken,
    updateInviteStatus,
    findTutorProfileByUserId,
    insertTutorProfile,
    updateUserRole,
  };
}

export type InviteRepo = ReturnType<typeof createInviteRepo>;
