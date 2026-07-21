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

async function insertInvite(
  conn: DbOrTx,
  params: InsertInviteParams,
): Promise<TutorInviteRow> {
  const [row] = await conn.insert(tutorInvite).values(params).returning();
  return row!;
}

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
