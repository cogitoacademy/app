import { DomainError } from "../../lib/domain-errors";
import { badRequest, conflict, internalServerError } from "../../lib/errors";
export class ContentConflictError extends DomainError {
  readonly domain = "content-admin";
  constructor() {
    super(
      "CONTENT_CONFLICT",
      "This entry changed or was removed. Reload and review before saving.",
    );
  }
}
export class ContentInvalidError extends DomainError {
  readonly domain = "content-admin";
  constructor(message: string) {
    super("CONTENT_INVALID", message);
  }
}
export function mapContentAdminError(error: DomainError) {
  if (error instanceof ContentConflictError)
    return conflict(error.message, error);
  if (error instanceof ContentInvalidError)
    return badRequest(error.message, error);
  return internalServerError(error.message, error);
}
