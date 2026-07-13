import { describe, test, expect } from "bun:test";
import {
  notFound,
  forbidden,
  unauthorized,
  conflict,
  preconditionFailed,
  unprocessableContent,
  badRequest,
  internalServerError,
  serviceUnavailable,
  rateLimited,
  timeout,
} from "../../lib/errors";

describe("Error helpers", () => {
  test("notFound creates NOT_FOUND error", () => {
    const err = notFound("User not found");
    expect(err.status).toBe(404);
    expect(err.message).toBe("User not found");
  });

  test("forbidden creates FORBIDDEN error", () => {
    const err = forbidden("Access denied");
    expect(err.status).toBe(403);
    expect(err.message).toBe("Access denied");
  });

  test("unauthorized creates UNAUTHORIZED error with default message", () => {
    const err = unauthorized();
    expect(err.status).toBe(401);
    expect(err.message).toBe("Unauthorized");
  });

  test("unauthorized creates UNAUTHORIZED error with custom message", () => {
    const err = unauthorized("Token expired");
    expect(err.status).toBe(401);
    expect(err.message).toBe("Token expired");
  });

  test("conflict creates CONFLICT error", () => {
    const err = conflict("Already exists");
    expect(err.status).toBe(409);
    expect(err.message).toBe("Already exists");
  });

  test("preconditionFailed creates PRECONDITION_FAILED error", () => {
    const err = preconditionFailed("Version mismatch");
    expect(err.status).toBe(412);
    expect(err.message).toBe("Version mismatch");
  });

  test("unprocessableContent creates UNPROCESSABLE_CONTENT error without field errors", () => {
    const err = unprocessableContent("Invalid data");
    expect(err.status).toBe(422);
    expect(err.message).toBe("Invalid data");
  });

  test("unprocessableContent creates UNPROCESSABLE_CONTENT error with field errors", () => {
    const fieldErrors = { email: ["Invalid email"], name: ["Required"] };
    const err = unprocessableContent("Validation failed", fieldErrors);
    expect(err.status).toBe(422);
    expect(err.message).toBe("Validation failed");
  });

  test("badRequest creates BAD_REQUEST error", () => {
    const err = badRequest("Missing parameter");
    expect(err.status).toBe(400);
    expect(err.message).toBe("Missing parameter");
  });

  test("internalServerError creates INTERNAL_SERVER_ERROR with default message", () => {
    const err = internalServerError();
    expect(err.status).toBe(500);
    expect(err.message).toBe("Internal server error");
  });

  test("internalServerError creates INTERNAL_SERVER_ERROR with custom message", () => {
    const err = internalServerError("Database connection failed");
    expect(err.status).toBe(500);
    expect(err.message).toBe("Database connection failed");
  });

  test("serviceUnavailable creates SERVICE_UNAVAILABLE with default message", () => {
    const err = serviceUnavailable();
    expect(err.status).toBe(503);
    expect(err.message).toBe("Service unavailable");
  });

  test("serviceUnavailable creates SERVICE_UNAVAILABLE with custom message", () => {
    const err = serviceUnavailable("Payment provider down");
    expect(err.status).toBe(503);
    expect(err.message).toBe("Payment provider down");
  });

  test("rateLimited creates TOO_MANY_REQUESTS with default message", () => {
    const err = rateLimited();
    expect(err.status).toBe(429);
    expect(err.message).toBe("Too many requests");
  });

  test("rateLimited creates TOO_MANY_REQUESTS with retryAfterMs", () => {
    const err = rateLimited("Slow down", 5000);
    expect(err.status).toBe(429);
    expect(err.message).toBe("Slow down");
  });

  test("timeout creates TIMEOUT with default message", () => {
    const err = timeout();
    expect(err.status).toBe(408);
    expect(err.message).toBe("Request timed out");
  });

  test("timeout creates TIMEOUT with custom message", () => {
    const err = timeout("Payment took too long");
    expect(err.status).toBe(408);
    expect(err.message).toBe("Payment took too long");
  });
});
