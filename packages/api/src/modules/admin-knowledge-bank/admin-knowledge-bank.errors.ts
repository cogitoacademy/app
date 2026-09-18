import { ORPCError } from "@orpc/server";

import { DomainError } from "../../lib/domain-errors";
import {
  badRequest,
  conflict,
  internalServerError,
  notFound,
} from "../../lib/errors";

export class StudentNotFoundError extends DomainError {
  readonly domain = "admin-knowledge-bank";

  constructor(email: string) {
    super("STUDENT_NOT_FOUND", "No student account was found for this email", {
      email,
    });
  }
}

export class TargetUserNotStudentError extends DomainError {
  readonly domain = "admin-knowledge-bank";

  constructor(email: string) {
    super(
      "TARGET_USER_NOT_STUDENT",
      "Knowledge Bank access can only be granted to students",
      {
        email,
      },
    );
  }
}

export class KnowledgeBankAccessGrantNotFoundError extends DomainError {
  readonly domain = "admin-knowledge-bank";

  constructor(id: string) {
    super(
      "KNOWLEDGE_BANK_ACCESS_GRANT_NOT_FOUND",
      "Knowledge Bank access grant not found",
      {
        id,
      },
    );
  }
}

export class KnowledgeBankAccessGrantAlreadyExistsError extends DomainError {
  readonly domain = "admin-knowledge-bank";

  constructor(userId: string) {
    super(
      "KNOWLEDGE_BANK_ACCESS_GRANT_ALREADY_EXISTS",
      "This student already has a Knowledge Bank access grant",
      { userId },
    );
  }
}

export class InvalidKnowledgeBankAccessExpiryError extends DomainError {
  readonly domain = "admin-knowledge-bank";

  constructor() {
    super(
      "INVALID_KNOWLEDGE_BANK_ACCESS_EXPIRY",
      "Knowledge Bank access expiry must be a future date and time",
    );
  }
}

export function mapAdminKnowledgeBankError(
  err: DomainError,
): ORPCError<string, undefined> {
  if (err instanceof StudentNotFoundError) return notFound(err.message, err);
  if (err instanceof KnowledgeBankAccessGrantNotFoundError)
    return notFound(err.message, err);
  if (err instanceof TargetUserNotStudentError)
    return badRequest(err.message, err);
  if (err instanceof InvalidKnowledgeBankAccessExpiryError)
    return badRequest(err.message, err);
  if (err instanceof KnowledgeBankAccessGrantAlreadyExistsError)
    return conflict(err.message, err);
  return internalServerError(err.message, err);
}
