import { ORPCError } from "@orpc/server";

export function notFound(message: string): ORPCError<"NOT_FOUND", undefined> {
  return new ORPCError("NOT_FOUND", { message });
}

export function forbidden(message: string): ORPCError<"FORBIDDEN", undefined> {
  return new ORPCError("FORBIDDEN", { message });
}

export function unauthorized(
  message = "Unauthorized",
): ORPCError<"UNAUTHORIZED", undefined> {
  return new ORPCError("UNAUTHORIZED", { message });
}

export function conflict(message: string): ORPCError<"CONFLICT", undefined> {
  return new ORPCError("CONFLICT", { message });
}

export function preconditionFailed(
  message: string,
): ORPCError<"PRECONDITION_FAILED", undefined> {
  return new ORPCError("PRECONDITION_FAILED", { message });
}

export function unprocessableContent(
  message: string,
  fieldErrors?: Record<string, string[]>,
): ORPCError<
  "UNPROCESSABLE_CONTENT",
  { fieldErrors?: Record<string, string[]> }
> {
  return new ORPCError("UNPROCESSABLE_CONTENT", {
    message,
    data: { fieldErrors },
  });
}

export function badRequest(
  message: string,
): ORPCError<"BAD_REQUEST", undefined> {
  return new ORPCError("BAD_REQUEST", { message });
}

export function internalServerError(
  message = "Internal server error",
): ORPCError<"INTERNAL_SERVER_ERROR", undefined> {
  return new ORPCError("INTERNAL_SERVER_ERROR", { message });
}

export function serviceUnavailable(
  message = "Service unavailable",
): ORPCError<"SERVICE_UNAVAILABLE", undefined> {
  return new ORPCError("SERVICE_UNAVAILABLE", { message });
}

export function rateLimited(
  message = "Too many requests",
  retryAfterMs?: number,
): ORPCError<"TOO_MANY_REQUESTS", { retryAfterMs?: number }> {
  return new ORPCError("TOO_MANY_REQUESTS", {
    message,
    data: { retryAfterMs },
  });
}

export function timeout(
  message = "Request timed out",
): ORPCError<"TIMEOUT", undefined> {
  return new ORPCError("TIMEOUT", { message });
}
