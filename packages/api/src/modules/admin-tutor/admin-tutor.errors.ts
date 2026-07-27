import { ORPCError } from "@orpc/server";
import { DomainError } from "../../lib/domain-errors";
import { notFound, conflict, internalServerError } from "../../lib/errors";

export class InviteNotFoundError extends DomainError {
  readonly domain = "admin-tutor";
  constructor(id: string) {
    super("INVITE_NOT_FOUND", "Invite not found", { id });
  }
}

export class TutorProfileNotFoundError extends DomainError {
  readonly domain = "admin-tutor";
  constructor(id: string) {
    super("TUTOR_PROFILE_NOT_FOUND", "Tutor profile not found", { id });
  }
}

export class InvalidInviteActionError extends DomainError {
  readonly domain = "admin-tutor";
  constructor(id: string, action: string) {
    super("INVALID_INVITE_ACTION", "Invalid action for this invite", {
      id,
      action,
    });
  }
}

export class DuplicateInviteError extends DomainError {
  readonly domain = "admin-tutor";
  constructor(email: string) {
    super(
      "DUPLICATE_INVITE",
      "An active invite already exists for this email",
      {
        email,
      },
    );
  }
}

export function mapAdminTutorError(
  err: DomainError,
): ORPCError<string, undefined> {
  if (err instanceof InviteNotFoundError) return notFound(err.message, err);
  if (err instanceof TutorProfileNotFoundError)
    return notFound(err.message, err);
  if (err instanceof InvalidInviteActionError)
    return conflict(err.message, err);
  if (err instanceof DuplicateInviteError) return conflict(err.message, err);
  return internalServerError(err.message, err);
}
