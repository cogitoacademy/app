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
import { validateTutorSubjectIds } from "../tutor-subjects/subject-selection";

export type { ReviewAction };

export type InviteEmailDelivery = "sent" | "skipped" | "failed";
export type TutorInviteDeliveryRow = TutorInviteRow & {
  emailDelivery: InviteEmailDelivery;
};

export function buildTutorInviteEmail(
  invite: Pick<TutorInviteRow, "displayName" | "email" | "token" | "expiresAt">,
  appBaseUrl: string,
) {
  const inviteUrl = `${appBaseUrl.replace(/\/$/, "")}/invite?token=${encodeURIComponent(invite.token)}`;
  const name = escapeHtml(invite.displayName);
  const email = escapeHtml(invite.email);
  const safeInviteUrl = escapeHtml(inviteUrl);
  const expiry = escapeHtml(
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(invite.expiresAt),
  );

  return {
    subject: "You’re invited to teach with Cogito",
    html: `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f2f2f3;color:#161718;font-family:Inter,Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Accept your invitation and set up your Cogito tutor profile.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2f2f3;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e2e3e4;border-radius:12px;overflow:hidden;box-shadow:0 5px 10px rgba(0,0,0,0.03);">
            <tr>
              <td style="padding:18px 28px;border-bottom:1px solid #e2e3e4;">
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    <td width="36" height="36" align="center" valign="middle" style="width:36px;height:36px;border-radius:9px;background:#161718;color:#ffffff;font-size:18px;font-weight:700;">C</td>
                    <td style="padding-left:10px;color:#161718;font-size:18px;font-weight:700;letter-spacing:-0.2px;">Cogito</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 28px;">
                <p style="margin:0 0 16px;font-size:16px;line-height:24px;">Hi ${name},</p>
                <div style="display:inline-block;margin:0 0 16px;padding:6px 10px;border-radius:999px;background:#fff5dc;color:#8a5a00;font-size:12px;font-weight:700;">Tutor invitation</div>
                <h1 style="margin:0 0 14px;color:#161718;font-size:28px;line-height:35px;font-weight:700;letter-spacing:-0.5px;">You’re invited to tutor with Cogito.</h1>
                <p style="margin:0 0 24px;color:#61666b;font-size:16px;line-height:25px;">Join Cogito’s focused learning workspace and help ambitious students move toward their academic goals. Start by accepting your invitation and setting up your tutor profile.</p>
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 28px;">
                  <tr>
                    <td style="border-radius:9px;background:#e09e06;border:1px solid #b37e05;">
                      <a href="${safeInviteUrl}" style="display:inline-block;padding:14px 22px;color:#161718;font-size:15px;font-weight:700;text-decoration:none;">Accept invitation &amp; set up profile</a>
                    </td>
                  </tr>
                </table>
                <div style="margin:0 0 24px;padding:18px;background:#f2f2f3;border:1px solid #e2e3e4;border-radius:10px;">
                  <p style="margin:0 0 8px;color:#161718;font-size:14px;font-weight:700;">Use the invited email</p>
                  <p style="margin:0;color:#61666b;font-size:14px;line-height:22px;">Sign in or create your account with <strong style="color:#161718;">${email}</strong>. It must match this invitation before you can continue.</p>
                </div>
                <p style="margin:0 0 8px;color:#61666b;font-size:13px;line-height:20px;">This invitation expires on <strong style="color:#161718;">${expiry} UTC</strong>.</p>
                <p style="margin:0;color:#777c81;font-size:12px;line-height:19px;word-break:break-all;">Button not working? Copy and paste this link into your browser:<br><a href="${safeInviteUrl}" style="color:#8a5a00;">${safeInviteUrl}</a></p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px;border-top:1px solid #e2e3e4;background:#fafafa;color:#777c81;font-size:12px;line-height:19px;">If you weren’t expecting this invitation, you can safely ignore this email.</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  };
}

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
    const message = buildTutorInviteEmail(invite, appBaseUrl);
    try {
      const result = await emailPort.send({
        to: invite.email,
        subject: message.subject,
        category: "invite",
        idempotencyKey: `tutor-invite-${invite.id}-${hashInviteToken(invite.token)}`,
        html: message.html,
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
      let pendingSubjectIds: string[] | undefined;
      if (input.action === "approve_edits") {
        if (!existing.pendingProfileChanges) {
          throw new InvalidInviteActionError(
            input.tutorProfileId,
            input.action,
          );
        }
        const pendingProfileChanges = {
          ...existing.pendingProfileChanges,
        };
        const rawSubjectIds = pendingProfileChanges.subjectIds;
        if (rawSubjectIds !== undefined) {
          if (
            !Array.isArray(rawSubjectIds) ||
            !rawSubjectIds.every((subjectId) => typeof subjectId === "string")
          ) {
            throw new InvalidInviteActionError(
              input.tutorProfileId,
              "approve_edits_invalid_subjects",
            );
          }
          pendingSubjectIds = [...rawSubjectIds];
          const activeChildSubjects =
            await adminTutorRepo.listActiveChildSubjects(
              tx,
              pendingSubjectIds,
            );
          validateTutorSubjectIds(pendingSubjectIds, activeChildSubjects);
          delete pendingProfileChanges.subjectIds;
        }
        updates = {
          ...pendingProfileChanges,
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

      if (pendingSubjectIds !== undefined) {
        await adminTutorRepo.replaceTutorProfileSubjects(
          tx,
          input.tutorProfileId,
          pendingSubjectIds,
        );
      }

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
