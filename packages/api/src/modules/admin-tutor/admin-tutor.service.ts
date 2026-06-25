import { eq, and, desc } from "drizzle-orm";
import { tutorInvite, tutorProfile } from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { AuditPort } from "../../shared/ports/audit.port";
import { notFound, conflict, badRequest } from "../../lib/errors";

const INVITE_EXPIRY_DAYS = 7;

export interface CreateInviteInput {
  email: string;
  displayName: string;
  internalNotes?: string;
}

export interface ListInvitesInput {
  status?: "invited" | "accepted" | "expired" | "revoked";
  limit?: number;
  offset?: number;
}

export interface ReviewTutorProfileInput {
  tutorProfileId: string;
  action:
    | "request_changes"
    | "approve_unpublished"
    | "publish"
    | "unpublish"
    | "suspend";
  adminNote?: string;
}

export interface ListTutorProfilesInput {
  status?:
    | "draft"
    | "pending_review"
    | "changes_requested"
    | "approved_unpublished"
    | "published"
    | "suspended";
  limit?: number;
  offset?: number;
}

export type AdminTutorService = ReturnType<typeof createAdminTutorService>;

export function createAdminTutorService(deps: {
  db: DbType;
  audit: AuditPort;
}) {
  const { db, audit } = deps;

  async function createInvite(adminId: string, input: CreateInviteInput) {
    const existing = await db.query.tutorInvite.findFirst({
      where: and(
        eq(tutorInvite.email, input.email),
        eq(tutorInvite.status, "invited"),
      ),
    });
    if (existing)
      throw conflict("An active invite already exists for this email");

    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);

    const [invite] = await db
      .insert(tutorInvite)
      .values({
        email: input.email,
        displayName: input.displayName,
        token,
        status: "invited",
        invitedBy: adminId,
        internalNotes: input.internalNotes,
        expiresAt,
      })
      .returning();

    await audit.record({
      db,
      actorId: adminId,
      actorType: "admin",
      action: "tutor_invite_created",
      targetId: invite!.id,
      targetType: "tutor_invite",
      details: { email: input.email, displayName: input.displayName },
    });

    return invite;
  }

  async function listInvites(input: ListInvitesInput = {}) {
    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;
    return db.query.tutorInvite.findMany({
      where: input.status ? eq(tutorInvite.status, input.status) : undefined,
      orderBy: [desc(tutorInvite.createdAt)],
      limit,
      offset,
    });
  }

  async function resendInvite(adminId: string, inviteId: string) {
    const invite = await db.query.tutorInvite.findFirst({
      where: eq(tutorInvite.id, inviteId),
    });
    if (!invite) throw notFound("Invite not found");
    if (invite.status !== "invited")
      throw badRequest("Only invited invites can be resent");

    const newToken = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);

    const [updated] = await db
      .update(tutorInvite)
      .set({ token: newToken, expiresAt })
      .where(eq(tutorInvite.id, inviteId))
      .returning();

    await audit.record({
      db,
      actorId: adminId,
      actorType: "admin",
      action: "tutor_invite_resent",
      targetId: inviteId,
      targetType: "tutor_invite",
    });

    return updated;
  }

  async function revokeInvite(adminId: string, inviteId: string) {
    const invite = await db.query.tutorInvite.findFirst({
      where: eq(tutorInvite.id, inviteId),
    });
    if (!invite) throw notFound("Invite not found");
    if (invite.status !== "invited")
      throw badRequest("Only invited invites can be revoked");

    const [updated] = await db
      .update(tutorInvite)
      .set({ status: "revoked", revokedBy: adminId, revokedAt: new Date() })
      .where(eq(tutorInvite.id, inviteId))
      .returning();

    await audit.record({
      db,
      actorId: adminId,
      actorType: "admin",
      action: "tutor_invite_revoked",
      targetId: inviteId,
      targetType: "tutor_invite",
    });

    return updated;
  }

  async function listTutorProfiles(input: ListTutorProfilesInput = {}) {
    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;
    return db.query.tutorProfile.findMany({
      where: input.status
        ? eq(tutorProfile.onboardingStatus, input.status)
        : undefined,
      orderBy: [desc(tutorProfile.createdAt)],
      limit,
      offset,
      with: { user: true },
    });
  }

  async function reviewTutorProfile(
    adminId: string,
    input: ReviewTutorProfileInput,
  ) {
    const profile = await db.query.tutorProfile.findFirst({
      where: eq(tutorProfile.id, input.tutorProfileId),
    });
    if (!profile) throw notFound("Tutor profile not found");

    const statusMap: Record<string, string> = {
      request_changes: "changes_requested",
      approve_unpublished: "approved_unpublished",
      publish: "published",
      unpublish: "approved_unpublished",
      suspend: "suspended",
    };

    const newStatus = statusMap[input.action];
    if (!newStatus) throw badRequest("Invalid action");

    const updates: Record<string, unknown> = {
      onboardingStatus: newStatus,
      adminReviewNote: input.adminNote ?? null,
    };

    if (input.action === "publish") updates.publishedAt = new Date();
    if (input.action === "unpublish" || input.action === "suspend")
      updates.publishedAt = null;

    return db.transaction(async (tx) => {
      const [row] = await tx
        .update(tutorProfile)
        .set(updates)
        .where(eq(tutorProfile.id, input.tutorProfileId))
        .returning();

      await audit.record({
        db: tx,
        actorId: adminId,
        actorType: "admin",
        action: `tutor_profile_${input.action}`,
        targetId: input.tutorProfileId,
        targetType: "tutor_profile",
        beforeState: {
          onboardingStatus: profile.onboardingStatus,
          publishedAt: profile.publishedAt,
        },
        afterState: {
          onboardingStatus: newStatus,
          publishedAt: updates.publishedAt ?? null,
        },
        details: {
          adminNote: input.adminNote,
          previousStatus: profile.onboardingStatus,
          newStatus,
        },
      });

      return row;
    });
  }

  return {
    createInvite,
    listInvites,
    resendInvite,
    revokeInvite,
    listTutorProfiles,
    reviewTutorProfile,
  };
}
