import type { achievement } from "@cogito-app/db/schema";
import type { ORPCError } from "@orpc/server";
import { badRequest } from "../../lib/errors";
import { ACHIEVEMENT_STATUS } from "../../shared/constants";

type AchievementRow = typeof achievement.$inferSelect;

export type ValidationResult =
  | { ok: true }
  | { ok: false; error: ORPCError<any, any> };

export function validateUpdate(
  existing: AchievementRow | undefined,
): ValidationResult {
  if (!existing || existing.status !== ACHIEVEMENT_STATUS.PENDING) {
    return {
      ok: false,
      error: badRequest("Can only edit pending achievements"),
    };
  }
  return { ok: true };
}

export function validateDelete(
  existing: AchievementRow | undefined,
): ValidationResult {
  if (!existing || existing.status !== ACHIEVEMENT_STATUS.PENDING) {
    return {
      ok: false,
      error: badRequest("Can only delete pending achievements"),
    };
  }
  return { ok: true };
}
