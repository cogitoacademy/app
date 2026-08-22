import { eq, and, desc, asc, inArray, isNotNull } from "drizzle-orm";
import {
  account,
  subjectCategory,
  tutorInvite,
  tutorProfile,
  tutorProfileSubject,
  user,
} from "@cogito-app/db/schema";
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
  displayName?: string | null;
  credentialsSummary?: string | null;
  expertise?: string[] | null;
  modality?: string | null;
  prices?: Record<string, number> | null;
  proofUrls?: string[] | null;
  pendingProfileChanges?: Record<string, unknown> | null;
  profileEditStatus?: string;
  profileEditAdminNote?: string | null;
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

async function findUserAccountsByEmail(conn: DbOrTx, email: string) {
  const existingUser = await conn.query.user.findFirst({
    where: eq(user.email, email),
  });
  if (!existingUser) return undefined;
  const accounts = await conn.query.account.findMany({
    where: eq(account.userId, existingUser.id),
  });
  return { ...existingUser, accounts };
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
      with: {
        subjects: { with: { subject: { with: { parent: true } } } },
      },
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
    with: {
      user: true,
      subjects: { with: { subject: { with: { parent: true } } } },
    },
  });
}

async function listActiveChildSubjects(
  conn: DbOrTx,
  subjectIds: readonly string[],
) {
  if (subjectIds.length === 0) return [];
  return conn.query.subjectCategory.findMany({
    where: and(
      inArray(subjectCategory.id, [...subjectIds]),
      eq(subjectCategory.isActive, true),
      isNotNull(subjectCategory.parentId),
    ),
    orderBy: [asc(subjectCategory.sortOrder), asc(subjectCategory.name)],
  });
}

async function replaceTutorProfileSubjects(
  conn: DbOrTx,
  tutorProfileId: string,
  subjectIds: readonly string[],
) {
  await conn
    .delete(tutorProfileSubject)
    .where(eq(tutorProfileSubject.tutorProfileId, tutorProfileId));

  if (subjectIds.length === 0) return [];
  return conn
    .insert(tutorProfileSubject)
    .values(
      subjectIds.map((subjectId) => ({
        tutorProfileId,
        subjectId,
      })),
    )
    .returning();
}

export function createAdminTutorRepo() {
  return {
    findActiveInviteByEmail,
    findUserAccountsByEmail,
    insertInvite,
    getInviteById,
    updateInvite,
    listInvites,
    getTutorProfileById,
    listActiveChildSubjects,
    replaceTutorProfileSubjects,
    updateTutorProfile,
    listTutorProfiles,
  };
}

export type AdminTutorRepo = ReturnType<typeof createAdminTutorRepo>;
