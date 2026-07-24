import { ORPCError } from "@orpc/server";
import { DomainError } from "../../lib/domain-errors";
import {
  notFound,
  badRequest,
  conflict,
  internalServerError,
} from "../../lib/errors";

export class InviteNotFoundError extends DomainError {
  readonly domain = "invite";
  constructor(id: string) {
    super("INVITE_NOT_FOUND", "Invite not found", { id });
  }
}

export class InviteEmailMismatchError extends DomainError {
  readonly domain = "invite";
  constructor(id: string, email: string) {
    super("INVITE_EMAIL_MISMATCH", "Email does not match the invite", {
      id,
      email,
    });
  }
}

export class ProfileAlreadyExistsError extends DomainError {
  readonly domain = "invite";
  constructor(email: string) {
    super("PROFILE_ALREADY_EXISTS", "A profile already exists for this email", {
      email,
    });
  }
}

export function mapInviteError(err: DomainError): ORPCError<string, undefined> {
  if (err instanceof InviteNotFoundError) return notFound(err.message, err);
  if (err instanceof InviteEmailMismatchError)
    return badRequest(err.message, err);
  if (err instanceof ProfileAlreadyExistsError)
    return conflict(err.message, err);
  return internalServerError(err.message, err);
}
