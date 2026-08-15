import { z } from "zod";
import {
  InviteNotFoundError,
  TutorProfileNotFoundError,
  InvalidInviteActionError,
  DuplicateInviteError,
} from "./admin-tutor.errors";
import type { DbType } from "../../lib/db";
import { hashInviteToken } from "../../lib/tokens";
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
  TutorProfileUpdates,
} from "./admin-tutor.repo";
import {
  createInviteInput,
  listInvitesInput,
  listTutorProfilesInput,
  reviewTutorProfileInput,
  type ReviewAction,
  inspectInviteeInput,
} from "./admin-tutor.types";
import type { AdminTutorAuditPort } from "./index";
import type { EmailPort } from "../email/email.service";
import { escapeHtml } from "../../lib/sanitize";
import { log } from "../../lib/logger";

export type { ReviewAction };

export type InviteEmailDelivery = "sent" | "skipped" | "failed";
export type TutorInviteDeliveryRow = TutorInviteRow & {
  emailDelivery: InviteEmailDelivery;
};

function isUniqueViolation(err: unknown): boolean {
  if (err && typeof err === "object" && "code" in err) {
    return (err as { code: string }).code === "23505";
  }
  return false;
}

type CreateInviteInput = z.infer<typeof createInviteInput>;
type ListInvitesInput = z.infer<typeof listInvitesInput>;
type ListTutorProfilesInput = z.infer<typeof listTutorProfilesInput>;
type ReviewTutorProfileInput = z.infer<typeof reviewTutorProfileInput>;
type InspectInviteeInput = z.infer<typeof inspectInviteeInput>;
export interface TutorProfileSnapshot {
  id: string;
  onboardingStatus: string;
  publishedAt: Date | null;
  pendingProfileChanges?: Record<string, unknown> | null;
  profileEditStatus?: string;
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
  approve_edits: ONBOARDING_STATUS.PUBLISHED,
  request_edit_changes: ONBOARDING_STATUS.PUBLISHED,
};

export function validateReviewAction(
  action: ReviewAction,
  profile: TutorProfileSnapshot | null,
): { profile: TutorProfileSnapshot } {
  if (!profile) {
    throw new TutorProfileNotFoundError("");
  }
  if (!STATUS_MAP[action]) {
    throw new InvalidInviteActionError("", action);
  }
  return { profile };
}

export function buildReviewUpdates(
  action: ReviewAction,
  adminNote?: string,
): { updates: ReviewUpdates; newStatus: string } {
  const newStatus = STATUS_MAP[action];
  if (!newStatus) throw new InvalidInviteActionError("", action);

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
  emailPort: EmailPort;
  appBaseUrl: string;
  db: DbType;
}) {
  const { adminTutorRepo, auditPort, emailPort, appBaseUrl, db } = deps;

  async function inspectInvitee(input: InspectInviteeInput) {
    const existing = await adminTutorRepo.findUserAccountsByEmail(
      db,
      input.email,
    );
    if (!existing) {
      return {
        exists: false as const,
        email: input.email,
        name: null,
        role: null,
        providers: [] as string[],
        hasGoogle: false,
        hasPassword: false,
      };
    }
    const providers = [
      ...new Set(existing.accounts.map((item) => item.providerId)),
    ];
    return {
      exists: true as const,
      email: existing.email,
      name: existing.name,
      role: existing.role,
      providers,
      hasGoogle: providers.includes("google"),
      hasPassword: providers.includes("credential"),
    };
  }

  async function deliverInviteEmail(
    invite: TutorInviteRow,
  ): Promise<InviteEmailDelivery> {
    const inviteUrl = `${appBaseUrl.replace(/\/$/, "")}/invite?token=${encodeURIComponent(invite.token)}`;
    try {
      const result = await emailPort.send({
        to: invite.email,
        subject: "Your Cogito tutor invitation",
        category: "invite",
        idempotencyKey: `tutor-invite-${invite.id}-${hashInviteToken(invite.token)}`,
        html: `<p>Hello ${escapeHtml(invite.displayName)},</p><p>You have been invited to join Cogito as a tutor.</p><p><a href="${escapeHtml(inviteUrl)}">Accept tutor invitation</a></p><p>This link expires on ${escapeHtml(invite.expiresAt.toISOString())}. Sign in or create an account using <strong>${escapeHtml(invite.email)}</strong>.</p>`,
      });
      return "skipped" in result ? "skipped" : "sent";
    } catch (error) {
      log({
        level: "error",
        action: "tutor_invite_email_failed",
        inviteId: invite.id,
        error: { message: String(error) },
      });
      return "failed";
    }
  }

  async function createInvite(
    adminId: string,
    input: CreateInviteInput,
  ): Promise<TutorInviteDeliveryRow> {
    const result = await db.transaction(async (tx) => {
      const existing = await adminTutorRepo.findActiveInviteByEmail(
        tx,
        input.email,
      );
      if (existing) {
        throw new DuplicateInviteError(input.email);
      }

      const token = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);

      let invite: TutorInviteRow;
      try {
        invite = await adminTutorRepo.insertInvite(tx, {
          email: input.email,
          displayName: input.displayName,
          // Only the digest is stored at rest (M10); the plaintext is returned
          // once in the response so the admin can share the invite link.
          token: hashInviteToken(token),
          status: INVITE_STATUS.INVITED,
          invitedBy: adminId,
          internalNotes: input.internalNotes ?? null,
          expiresAt,
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new DuplicateInviteError(input.email);
        }
        throw err;
      }

      await auditPort.record({
        db: tx,
        actorId: adminId,
        actorType: "admin",
        action: "tutor_invite_created",
        targetId: invite.id,
        targetType: "tutor_invite",
        details: { email: input.email, displayName: input.displayName },
      });

      return { ...invite, token };
    });
    const emailDelivery = await deliverInviteEmail(result);
    return { ...result, emailDelivery };
  }

  async function listInvites(
    input?: ListInvitesInput,
  ): Promise<Array<Omit<TutorInviteRow, "token">>> {
    const {
      status,
      limit = ADMIN_DEFAULT_PAGE_LIMIT,
      offset = 0,
    } = input ?? {};
    const rows = await adminTutorRepo.listInvites(db, {
      status,
      limit,
      offset,
    });
    // Stored tokens are digests, not shareable links — never surface them in
    // list responses (M10); plaintext is returned once at create/resend.
    return rows.map((row) => ({
      ...row,
      token: undefined,
    }));
  }

  async function resendInvite(
    adminId: string,
    inviteId: string,
  ): Promise<TutorInviteRow> {
    const result = await db.transaction(async (tx) => {
      const invite = await adminTutorRepo.getInviteById(tx, inviteId);
      if (!invite) throw new InviteNotFoundError(inviteId);
      if (invite.status !== INVITE_STATUS.INVITED) {
        throw new InvalidInviteActionError(inviteId, "resend_non_invited");
      }

      const newToken = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);

      const updated = await adminTutorRepo.updateInvite(tx, inviteId, {
        token: hashInviteToken(newToken),
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

      return { ...updated, token: newToken };
    });
    return result;
  }

  async function sendInviteAgain(
    adminId: string,
    inviteId: string,
  ): Promise<TutorInviteDeliveryRow> {
    const result = await resendInvite(adminId, inviteId);
    const emailDelivery = await deliverInviteEmail(result);
    return { ...result, emailDelivery };
  }

  async function revokeInvite(
    adminId: string,
    inviteId: string,
  ): Promise<TutorInviteRow> {
    return db.transaction(async (tx) => {
      const invite = await adminTutorRepo.getInviteById(tx, inviteId);
      if (!invite) throw new InviteNotFoundError(inviteId);
      if (invite.status !== INVITE_STATUS.INVITED) {
        throw new InvalidInviteActionError(inviteId, "revoke_non_invited");
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

  async function listTutorProfiles(input?: ListTutorProfilesInput) {
    const {
      status,
      limit = ADMIN_DEFAULT_PAGE_LIMIT,
      offset = 0,
    } = input ?? {};
    return adminTutorRepo.listTutorProfiles(db, {
      status,
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

      let updates: TutorProfileUpdates;
      let newStatus: string;
      if (input.action === "approve_edits") {
        if (!existing.pendingProfileChanges) {
          throw new InvalidInviteActionError(
            input.tutorProfileId,
            input.action,
          );
        }
        updates = {
          ...existing.pendingProfileChanges,
          onboardingStatus: ONBOARDING_STATUS.PUBLISHED,
          pendingProfileChanges: null,
          profileEditStatus: "none",
          profileEditAdminNote: null,
        };
        newStatus = ONBOARDING_STATUS.PUBLISHED;
      } else if (input.action === "request_edit_changes") {
        if (!existing.pendingProfileChanges) {
          throw new InvalidInviteActionError(
            input.tutorProfileId,
            input.action,
          );
        }
        updates = {
          onboardingStatus: ONBOARDING_STATUS.PUBLISHED,
          profileEditStatus: "changes_requested",
          profileEditAdminNote: input.adminNote ?? null,
        };
        newStatus = ONBOARDING_STATUS.PUBLISHED;
      } else {
        ({ updates, newStatus } = buildReviewUpdates(
          input.action,
          input.adminNote,
        ));
      }

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
          publishedAt:
            updates.publishedAt === undefined
              ? existing.publishedAt
              : updates.publishedAt,
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
    inspectInvitee,
    createInvite,
    listInvites,
    resendInvite,
    sendInviteAgain,
    revokeInvite,
    listTutorProfiles,
    reviewTutorProfile,
  };
}
