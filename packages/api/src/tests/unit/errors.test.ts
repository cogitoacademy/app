import { describe, test, expect } from "bun:test";
import {
  notFound,
  forbidden,
  unauthorized,
  conflict,
  badRequest,
  internalServerError,
  serviceUnavailable,
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
});
