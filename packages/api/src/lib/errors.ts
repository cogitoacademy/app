import { ORPCError } from "@orpc/server";

export function notFound(
  message: string,
  cause?: unknown,
): ORPCError<"NOT_FOUND", undefined> {
  return new ORPCError("NOT_FOUND", { message, ...(cause ? { cause } : {}) });
}

export function forbidden(
  message: string,
  cause?: unknown,
): ORPCError<"FORBIDDEN", undefined> {
  return new ORPCError("FORBIDDEN", { message, ...(cause ? { cause } : {}) });
}

export function unauthorized(
  message = "Unauthorized",
  cause?: unknown,
): ORPCError<"UNAUTHORIZED", undefined> {
  return new ORPCError("UNAUTHORIZED", {
    message,
    ...(cause ? { cause } : {}),
  });
}

export function conflict(
  message: string,
  cause?: unknown,
): ORPCError<"CONFLICT", undefined> {
  return new ORPCError("CONFLICT", { message, ...(cause ? { cause } : {}) });
}

export function preconditionFailed(
  message: string,
  cause?: unknown,
): ORPCError<"PRECONDITION_FAILED", undefined> {
  return new ORPCError("PRECONDITION_FAILED", {
    message,
    ...(cause ? { cause } : {}),
  });
}

export function unprocessableContent(
  message: string,
  fieldErrors?: Record<string, string[]>,
  cause?: unknown,
): ORPCError<
  "UNPROCESSABLE_CONTENT",
  { fieldErrors?: Record<string, string[]> }
> {
  return new ORPCError("UNPROCESSABLE_CONTENT", {
    message,
    data: { fieldErrors },
    ...(cause ? { cause } : {}),
  });
}

export function badRequest(
  message: string,
  cause?: unknown,
): ORPCError<"BAD_REQUEST", undefined> {
  return new ORPCError("BAD_REQUEST", { message, ...(cause ? { cause } : {}) });
}

export function internalServerError(
  message = "Internal server error",
  cause?: unknown,
): ORPCError<"INTERNAL_SERVER_ERROR", undefined> {
  return new ORPCError("INTERNAL_SERVER_ERROR", {
    message,
    ...(cause ? { cause } : {}),
  });
}

export function serviceUnavailable(
  message = "Service unavailable",
  cause?: unknown,
): ORPCError<"SERVICE_UNAVAILABLE", undefined> {
  return new ORPCError("SERVICE_UNAVAILABLE", {
    message,
    ...(cause ? { cause } : {}),
  });
}

export function rateLimited(
  message = "Too many requests",
  retryAfterMs?: number,
  cause?: unknown,
): ORPCError<"TOO_MANY_REQUESTS", { retryAfterMs?: number }> {
  return new ORPCError("TOO_MANY_REQUESTS", {
    message,
    data: { retryAfterMs },
    ...(cause ? { cause } : {}),
  });
}

export function timeout(
  message = "Request timed out",
  cause?: unknown,
): ORPCError<"TIMEOUT", undefined> {
  return new ORPCError("TIMEOUT", { message, ...(cause ? { cause } : {}) });
}
