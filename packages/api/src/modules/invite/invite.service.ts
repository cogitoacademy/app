import type { tutorInvite, tutorProfile } from "@cogito-app/db/schema";
import type { ORPCError } from "@orpc/server";
import { notFound, forbidden, conflict } from "../../lib/errors";

type InviteRow = typeof tutorInvite.$inferSelect;
type TutorProfileRow = typeof tutorProfile.$inferSelect;

export type ValidationResult =
  | { ok: true }
  | { ok: false; error: ORPCError<any, any> };

export function validateClaim(
  invite: InviteRow | undefined,
  userEmail: string,
  existingProfile: TutorProfileRow | undefined,
): ValidationResult {
  if (!invite) {
    return {
      ok: false,
      error: notFound("Invite not found, already accepted, or expired"),
    };
  }

  if (invite.email.toLowerCase() !== userEmail.toLowerCase()) {
    return {
      ok: false,
      error: forbidden(
        "This invite is for a different email address. Please log in with the invited email.",
      ),
    };
  }

  if (existingProfile) {
    return {
      ok: false,
      error: conflict("You already have a tutor profile"),
    };
  }

  return { ok: true };
}
