import { eq, and, desc } from "drizzle-orm";
import { tutorInvite, tutorProfile } from "@cogito-app/db/schema";
import type { DbOrTx } from "../../lib/tx";
import { INVITE_STATUS } from "../../shared/constants";

export type TutorInviteRow = typeof tutorInvite.$inferSelect;
export type TutorProfileRow = typeof tutorProfile.$inferSelect;

export type InviteStatus = "invited" | "accepted" | "expired" | "revoked";
export type OnboardingStatus =
  | "draft"
  | "pending_review"
  | "changes_requested"
  | "approved_unpublished"
  | "published"
  | "suspended";

export interface InsertInviteParams {
  email: string;
  displayName: string;
  token: string;
  status: InviteStatus;
  invitedBy: string;
  internalNotes?: string | null;
  expiresAt: Date;
}

export interface InviteUpdates {
  token?: string;
  expiresAt?: Date;
  status?: InviteStatus;
  revokedBy?: string;
  revokedAt?: Date;
}

export interface ListInvitesRepoInput {
  status?: InviteStatus;
  limit: number;
  offset: number;
}

export interface ListTutorProfilesRepoInput {
  status?: OnboardingStatus;
  limit: number;
  offset: number;
}

export interface TutorProfileUpdates {
  onboardingStatus?: string;
  adminReviewNote?: string | null;
  publishedAt?: Date | null;
}

/**
 * Finds an active (unexpired, invited) tutor invite by email.
 *
 * @param conn - the database connection or active transaction
 * @param email - the invitee's email
 * @returns the matching invite, or null
 */
async function findActiveInviteByEmail(
  conn: DbOrTx,
  email: string,
): Promise<TutorInviteRow | null> {
  return (
    (await conn.query.tutorInvite.findFirst({
      where: and(
        eq(tutorInvite.email, email),
        eq(tutorInvite.status, INVITE_STATUS.INVITED),
      ),
    })) ?? null
  );
}

/**
 * Inserts a new tutor invite.
 *
 * @param conn - the database connection or active transaction
 * @param params - the invite details
 * @returns the inserted invite row
 */
async function insertInvite(
  conn: DbOrTx,
  params: InsertInviteParams,
): Promise<TutorInviteRow> {
  const [row] = await conn.insert(tutorInvite).values(params).returning();
  return row!;
}

/**
 * Fetches an invite by id.
 *
 * @param conn - the database connection or active transaction
 * @param id - the invite id
 * @returns the invite row, or null
 */
async function getInviteById(
  conn: DbOrTx,
  id: string,
): Promise<TutorInviteRow | null> {
  return (
    (await conn.query.tutorInvite.findFirst({
      where: eq(tutorInvite.id, id),
    })) ?? null
  );
}

/**
 * Updates an invite (e.g. status, revocation).
 *
 * @param conn - the database connection or active transaction
 * @param id - the invite id
 * @param updates - the fields to update
 * @returns the updated invite row
 */
async function updateInvite(
  conn: DbOrTx,
  id: string,
  updates: InviteUpdates,
): Promise<TutorInviteRow> {
  const [row] = await conn
    .update(tutorInvite)
    .set(updates)
    .where(eq(tutorInvite.id, id))
    .returning();
  return row!;
}

/**
 * Lists tutor invites with pagination and optional status filter.
 *
 * @param conn - the database connection or active transaction
 * @param input - list options (status, limit, offset)
 * @returns the matching invite rows, newest first
 */
async function listInvites(
  conn: DbOrTx,
  input: ListInvitesRepoInput,
): Promise<TutorInviteRow[]> {
  return conn.query.tutorInvite.findMany({
    where: input.status ? eq(tutorInvite.status, input.status) : undefined,
    orderBy: [desc(tutorInvite.createdAt)],
    limit: input.limit,
    offset: input.offset,
  });
}

/**
 * Fetches a tutor profile by id.
 *
 * @param conn - the database connection or active transaction
 * @param id - the profile id
 * @returns the profile row, or null
 */
async function getTutorProfileById(
  conn: DbOrTx,
  id: string,
): Promise<TutorProfileRow | null> {
  return (
    (await conn.query.tutorProfile.findFirst({
      where: eq(tutorProfile.id, id),
    })) ?? null
  );
}

/**
 * Updates a tutor profile's admin-controlled fields.
 *
 * @param conn - the database connection or active transaction
 * @param id - the profile id
 * @param updates - the fields to update
 * @returns the updated profile row
 */
async function updateTutorProfile(
  conn: DbOrTx,
  id: string,
  updates: TutorProfileUpdates,
): Promise<TutorProfileRow> {
  const [row] = await conn
    .update(tutorProfile)
    .set(updates)
    .where(eq(tutorProfile.id, id))
    .returning();
  return row!;
}

/**
 * Lists tutor profiles with pagination and optional onboarding status filter, including the user.
 *
 * @param conn - the database connection or active transaction
 * @param input - list options (status, limit, offset)
 * @returns the matching profile rows with their user, newest first
 */
async function listTutorProfiles(
  conn: DbOrTx,
  input: ListTutorProfilesRepoInput,
) {
  return conn.query.tutorProfile.findMany({
    where: input.status
      ? eq(tutorProfile.onboardingStatus, input.status)
      : undefined,
    orderBy: [desc(tutorProfile.createdAt)],
    limit: input.limit,
    offset: input.offset,
    with: { user: true },
  });
}

export function createAdminTutorRepo() {
  return {
    findActiveInviteByEmail,
    insertInvite,
    getInviteById,
    updateInvite,
    listInvites,
    getTutorProfileById,
    updateTutorProfile,
    listTutorProfiles,
  };
}

export type AdminTutorRepo = ReturnType<typeof createAdminTutorRepo>;
