import { z } from "zod";

import type { InviteStatus, OnboardingStatus } from "./admin-tutor.repo";

export type ReviewAction =
  | "request_changes"
  | "approve_unpublished"
  | "publish"
  | "unpublish"
  | "suspend";

export interface CreateInviteInput {
  email: string;
  displayName: string;
  internalNotes?: string;
}

export interface ListInvitesInput {
  status?: InviteStatus;
  limit?: number;
  offset?: number;
}

export interface ListTutorProfilesInput {
  status?: OnboardingStatus;
  limit?: number;
  offset?: number;
}

export interface ReviewTutorProfileInput {
  tutorProfileId: string;
  action: ReviewAction;
  adminNote?: string;
}

export const createInviteInput = z.object({
  email: z.string().email(),
  displayName: z.string().min(1),
  internalNotes: z.string().optional(),
});

export const listInvitesInput = z
  .object({
    status: z.enum(["invited", "accepted", "expired", "revoked"]).optional(),
    limit: z.number().min(1).max(100).default(50),
    offset: z.number().min(0).default(0),
  })
  .optional();

export const resendInviteInput = z.object({ inviteId: z.string() });

export const revokeInviteInput = z.object({ inviteId: z.string() });

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

export const reviewTutorProfileInput = z.object({
  tutorProfileId: z.string(),
  action: z.enum([
    "request_changes",
    "approve_unpublished",
    "publish",
    "unpublish",
    "suspend",
  ]),
  adminNote: z.string().optional(),
});
