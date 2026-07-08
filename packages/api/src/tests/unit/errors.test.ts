import { describe, test, expect } from "bun:test";
import {
  notFound,
  forbidden,
  unauthorized,
  conflict,
  preconditionFailed,
  unprocessableContent,
  badRequest,
} from "../../lib/errors";
import { ORPCError } from "@orpc/server";

describe("Error helpers", () => {
  test("notFound creates NOT_FOUND error", () => {
    const err = notFound("Item not found");
    expect(err).toBeInstanceOf(ORPCError);
    expect(err.code).toBe("NOT_FOUND");
    expect(err.message).toBe("Item not found");
  });

  test("forbidden creates FORBIDDEN error", () => {
    const err = forbidden("Access denied");
    expect(err.code).toBe("FORBIDDEN");
    expect(err.message).toBe("Access denied");
  });

  test("unauthorized creates UNAUTHORIZED error with default message", () => {
    const err = unauthorized();
    expect(err.code).toBe("UNAUTHORIZED");
    expect(err.message).toBe("Unauthorized");
  });

  test("unauthorized creates UNAUTHORIZED error with custom message", () => {
    const err = unauthorized("Custom");
    expect(err.message).toBe("Custom");
  });

  test("conflict creates CONFLICT error", () => {
    const err = conflict("Already exists");
    expect(err.code).toBe("CONFLICT");
    expect(err.message).toBe("Already exists");
  });

  test("preconditionFailed creates PRECONDITION_FAILED error", () => {
    const err = preconditionFailed("Precondition failed");
    expect(err.code).toBe("PRECONDITION_FAILED");
    expect(err.message).toBe("Precondition failed");
  });

  test("unprocessableContent creates UNPROCESSABLE_CONTENT error", () => {
    const err = unprocessableContent("Validation failed", {
      email: ["Invalid email"],
    });
    expect(err.code).toBe("UNPROCESSABLE_CONTENT");
    expect(err.message).toBe("Validation failed");
  });

  test("badRequest creates BAD_REQUEST error", () => {
    const err = badRequest("Invalid input");
    expect(err.code).toBe("BAD_REQUEST");
    expect(err.message).toBe("Invalid input");
  });
});
