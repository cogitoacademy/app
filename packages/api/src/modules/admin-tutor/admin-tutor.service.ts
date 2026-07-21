import { notFound, badRequest, conflict } from "../../lib/errors";
import type { DbType } from "../../lib/db";
import {
  INVITE_EXPIRY_DAYS,
  INVITE_STATUS,
  ONBOARDING_STATUS,
  USER_ROLE,
  ADMIN_DEFAULT_PAGE_LIMIT,
} from "../../shared/constants";
import type {
  AdminTutorRepo,
  TutorInviteRow,
  TutorProfileRow,
} from "./admin-tutor.repo";
import type {
  CreateInviteInput,
  ListInvitesInput,
  ListTutorProfilesInput,
  ReviewTutorProfileInput,
  ReviewAction,
} from "./admin-tutor.types";
import type { AdminTutorAuditPort } from "./index";

export type { ReviewAction };

export interface TutorProfileSnapshot {
  id: string;
  onboardingStatus: string;
  publishedAt: Date | null;
}

export interface ReviewUpdates {
  onboardingStatus: string;
  adminReviewNote: string | null;
  publishedAt?: Date | null;
}

const STATUS_MAP: Record<ReviewAction, string> = {
  request_changes: ONBOARDING_STATUS.CHANGES_REQUESTED,
  approve_unpublished: ONBOARDING_STATUS.APPROVED_UNPUBLISHED,
  publish: ONBOARDING_STATUS.PUBLISHED,
  unpublish: ONBOARDING_STATUS.APPROVED_UNPUBLISHED,
  suspend: ONBOARDING_STATUS.SUSPENDED,
};

export function validateReviewAction(
  action: ReviewAction,
  profile: TutorProfileSnapshot | null,
): { profile: TutorProfileSnapshot } {
  if (!profile) {
    throw notFound("Tutor profile not found");
  }
  if (!STATUS_MAP[action]) {
    throw badRequest("Invalid action");
  }
  return { profile };
}

export function buildReviewUpdates(
  action: ReviewAction,
  adminNote?: string,
): { updates: ReviewUpdates; newStatus: string } {
  const newStatus = STATUS_MAP[action];
  if (!newStatus) throw badRequest("Invalid action");

  const updates: ReviewUpdates = {
    onboardingStatus: newStatus,
    adminReviewNote: adminNote ?? null,
  };

  if (action === "publish") updates.publishedAt = new Date();
  if (action === "unpublish" || action === "suspend")
    updates.publishedAt = null;

  return { updates, newStatus };
}

export type AdminTutorService = ReturnType<typeof createAdminTutorService>;

export function createAdminTutorService(deps: {
  adminTutorRepo: AdminTutorRepo;
  auditPort: AdminTutorAuditPort;
  db: DbType;
}) {
  const { adminTutorRepo, auditPort, db } = deps;

  async function createInvite(
    adminId: string,
    input: CreateInviteInput,
  ): Promise<TutorInviteRow> {
    return db.transaction(async (tx) => {
      const existing = await adminTutorRepo.findActiveInviteByEmail(
        tx,
        input.email,
      );
      if (existing) {
        throw conflict("An active invite already exists for this email");
      }

      const token = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);

      const invite = await adminTutorRepo.insertInvite(tx, {
        email: input.email,
        displayName: input.displayName,
        token,
        status: INVITE_STATUS.INVITED,
        invitedBy: adminId,
        internalNotes: input.internalNotes ?? null,
        expiresAt,
      });

      await auditPort.record({
        db: tx,
        actorId: adminId,
        actorType: "admin",
        action: "tutor_invite_created",
        targetId: invite.id,
        targetType: "tutor_invite",
        details: { email: input.email, displayName: input.displayName },
      });

      return invite;
    });
  }

  async function listInvites(
    input: ListInvitesInput = {},
  ): Promise<TutorInviteRow[]> {
    const limit = input.limit ?? ADMIN_DEFAULT_PAGE_LIMIT;
    const offset = input.offset ?? 0;
    return adminTutorRepo.listInvites(db, {
      status: input.status,
      limit,
      offset,
    });
  }

  async function resendInvite(
    adminId: string,
    inviteId: string,
  ): Promise<TutorInviteRow> {
    return db.transaction(async (tx) => {
      const invite = await adminTutorRepo.getInviteById(tx, inviteId);
      if (!invite) throw notFound("Invite not found");
      if (invite.status !== INVITE_STATUS.INVITED) {
        throw badRequest("Only invited invites can be resent");
      }

      const newToken = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);

      const updated = await adminTutorRepo.updateInvite(tx, inviteId, {
        token: newToken,
        expiresAt,
      });

      await auditPort.record({
        db: tx,
        actorId: adminId,
        actorType: USER_ROLE.ADMIN,
        action: "tutor_invite_resent",
        targetId: inviteId,
        targetType: "tutor_invite",
      });

      return updated;
    });
  }

  async function revokeInvite(
    adminId: string,
    inviteId: string,
  ): Promise<TutorInviteRow> {
    return db.transaction(async (tx) => {
      const invite = await adminTutorRepo.getInviteById(tx, inviteId);
      if (!invite) throw notFound("Invite not found");
      if (invite.status !== INVITE_STATUS.INVITED) {
        throw badRequest("Only invited invites can be revoked");
      }

      const updated = await adminTutorRepo.updateInvite(tx, inviteId, {
        status: INVITE_STATUS.REVOKED,
        revokedBy: adminId,
        revokedAt: new Date(),
      });

      await auditPort.record({
        db: tx,
        actorId: adminId,
        actorType: USER_ROLE.ADMIN,
        action: "tutor_invite_revoked",
        targetId: inviteId,
        targetType: "tutor_invite",
      });

      return updated;
    });
  }

  async function listTutorProfiles(input: ListTutorProfilesInput = {}) {
    const limit = input.limit ?? ADMIN_DEFAULT_PAGE_LIMIT;
    const offset = input.offset ?? 0;
    return adminTutorRepo.listTutorProfiles(db, {
      status: input.status,
      limit,
      offset,
    });
  }

  async function reviewTutorProfile(
    adminId: string,
    input: ReviewTutorProfileInput,
  ): Promise<TutorProfileRow> {
    return db.transaction(async (tx) => {
      const profile = await adminTutorRepo.getTutorProfileById(
        tx,
        input.tutorProfileId,
      );

      const { profile: existing } = validateReviewAction(input.action, profile);

      const { updates, newStatus } = buildReviewUpdates(
        input.action,
        input.adminNote,
      );

      const row = await adminTutorRepo.updateTutorProfile(
        tx,
        input.tutorProfileId,
        updates,
      );

      await auditPort.record({
        db: tx,
        actorId: adminId,
        actorType: USER_ROLE.ADMIN,
        action: `tutor_profile_${input.action}`,
        targetId: input.tutorProfileId,
        targetType: "tutor_profile",
        beforeState: {
          onboardingStatus: existing.onboardingStatus,
          publishedAt: existing.publishedAt,
        },
        afterState: {
          onboardingStatus: newStatus,
          publishedAt: updates.publishedAt ?? null,
        },
        details: {
          adminNote: input.adminNote,
          previousStatus: existing.onboardingStatus,
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
