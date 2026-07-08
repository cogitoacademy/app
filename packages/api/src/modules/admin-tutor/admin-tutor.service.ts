import type { ORPCError } from "@orpc/server";
import { notFound, badRequest } from "../../lib/errors";

export type ReviewAction =
  | "request_changes"
  | "approve_unpublished"
  | "publish"
  | "unpublish"
  | "suspend";

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

type ReviewError =
  | ORPCError<"NOT_FOUND", undefined>
  | ORPCError<"BAD_REQUEST", undefined>;

export type ReviewValidationResult =
  | { ok: true; profile: TutorProfileSnapshot }
  | { ok: false; error: ReviewError };

const STATUS_MAP: Record<ReviewAction, string> = {
  request_changes: "changes_requested",
  approve_unpublished: "approved_unpublished",
  publish: "published",
  unpublish: "approved_unpublished",
  suspend: "suspended",
};

export function validateReviewAction(
  action: ReviewAction,
  profile: TutorProfileSnapshot | null,
): ReviewValidationResult {
  if (!profile) {
    return { ok: false, error: notFound("Tutor profile not found") };
  }
  if (!STATUS_MAP[action]) {
    return { ok: false, error: badRequest("Invalid action") };
  }
  return { ok: true, profile };
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
