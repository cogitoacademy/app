import { eq, and, gt } from "drizzle-orm";
import { tutorInvite, tutorProfile, user } from "@cogito-app/db/schema";
import type { DbOrTx } from "../../lib/tx";
import { INVITE_STATUS, ONBOARDING_STATUS } from "../../shared/constants";

export interface InsertTutorProfileParams {
  userId: string;
  inviteId: string;
  displayName: string;
}

/**
 * Finds a valid (unexpired, invited) invite by token.
 *
 * @param conn - the database connection or active transaction
 * @param token - the invite token
 * @returns the invite, or null
 */
export async function findInviteByToken(conn: DbOrTx, token: string) {
  return conn.query.tutorInvite.findFirst({
    where: and(
      eq(tutorInvite.token, token),
      eq(tutorInvite.status, INVITE_STATUS.INVITED),
      gt(tutorInvite.expiresAt, new Date()),
    ),
  });
}

/**
 * Updates an invite's status when it matches the given conditions (status and unexpired).
 *
 * @param conn - the database connection or active transaction
 * @param inviteId - the invite id
 * @param updates - the fields to update (status, acceptance)
 * @param conditions - the required current state (status, expiresAt)
 * @returns the updated rows (empty when conditions did not match)
 */
export async function updateInviteStatus(
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

/**
 * Finds a tutor profile by user id.
 *
 * @param conn - the database connection or active transaction
 * @param userId - the user id
 * @returns the tutor profile, or null
 */
export async function findTutorProfileByUserId(conn: DbOrTx, userId: string) {
  return conn.query.tutorProfile.findFirst({
    where: eq(tutorProfile.userId, userId),
  });
}

/**
 * Returns a user's role.
 *
 * @param conn - the database connection or active transaction
 * @param userId - the user id
 * @returns the role string, or null when the user does not exist
 */
export async function getUserRoleById(conn: DbOrTx, userId: string) {
  const [row] = await conn
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row?.role ?? null;
}

/**
 * Creates a draft tutor profile for an accepted invitee.
 *
 * @param conn - the database connection or active transaction
 * @param params - the initial profile fields (userId, inviteId, displayName)
 * @returns the created tutor profile
 */
export async function insertTutorProfile(
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

/**
 * Updates a user's role (used when an invite is accepted).
 *
 * @param conn - the database connection or active transaction
 * @param userId - the user id
 * @param role - the new role
 */
export async function updateUserRole(
  conn: DbOrTx,
  userId: string,
  role: string,
) {
  await conn.update(user).set({ role }).where(eq(user.id, userId));
}

export function createInviteRepo() {
  return {
    findInviteByToken,
    updateInviteStatus,
    findTutorProfileByUserId,
    getUserRoleById,
    insertTutorProfile,
    updateUserRole,
  };
}

export type InviteRepo = ReturnType<typeof createInviteRepo>;
