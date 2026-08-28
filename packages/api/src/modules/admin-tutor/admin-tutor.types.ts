import { z } from "zod";

export const createInviteInput = z.object({
  email: z.string().email().max(320),
  displayName: z.string().min(1).max(255),
  internalNotes: z.string().max(2000).optional(),
});

export const inspectInviteeInput = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
});

export const listInvitesInput = z
  .object({
    status: z.enum(["invited", "accepted", "expired", "revoked"]).optional(),
    limit: z.number().min(1).max(100).default(50),
    offset: z.number().min(0).default(0),
  })
  .optional();

export const resendInviteInput = z.object({ inviteId: z.string().max(100) });

export const revokeInviteInput = z.object({ inviteId: z.string().max(100) });

export const listTutorProfilesInput = z
  .object({
    status: z
      .enum([
        "draft",
        "pending_review",
        "changes_requested",
        "approved_unpublished",
        "published",
        "suspended",
      ])
      .optional(),
    limit: z.number().min(1).max(100).default(50),
    offset: z.number().min(0).default(0),
  })
  .optional();

export type ReviewAction =
  | "request_changes"
  | "approve_unpublished"
  | "publish"
  | "unpublish"
  | "suspend"
  | "approve_edits"
  | "request_edit_changes";

export const reviewTutorProfileInput = z.object({
  tutorProfileId: z.string().max(100),
  action: z.enum([
    "request_changes",
    "approve_unpublished",
    "publish",
    "unpublish",
    "suspend",
    "approve_edits",
    "request_edit_changes",
  ]),
  adminNote: z.string().max(2000).optional(),
  publicPhotoUrl: z.string().url().max(2048).optional(),
});
