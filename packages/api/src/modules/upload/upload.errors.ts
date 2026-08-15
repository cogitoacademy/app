import { ORPCError } from "@orpc/server";
import { DomainError } from "../../lib/domain-errors";
import { badRequest, internalServerError } from "../../lib/errors";

export class InvalidFilenameError extends DomainError {
  readonly domain = "upload";
  constructor(filename: string) {
    super("INVALID_FILENAME", "Invalid filename", { filename });
  }
}

export class UnsupportedContentTypeError extends DomainError {
  readonly domain = "upload";
  constructor(contentType: string) {
    super("UNSUPPORTED_CONTENT_TYPE", "Unsupported content type", {
      contentType,
    });
  }
}

export function mapUploadError(err: DomainError): ORPCError<string, undefined> {
  if (err instanceof InvalidFilenameError) {
    return badRequest(err.message, err);
  }
  if (err instanceof UnsupportedContentTypeError) {
    return badRequest(err.message, err);
  }
  return internalServerError(err.message, err);
}
