import { ORPCError } from "@orpc/server";
import { describe, test, expect } from "bun:test";
import { withDomainMap } from "../../lib/handler-utils";
import { DomainError } from "../../lib/domain-errors";
import { notFound } from "../../lib/errors";

class PaymentError extends DomainError {
  readonly domain = "payment";

  constructor(
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(code, message, details);
  }
}

describe("withDomainMap", () => {
  test("passes through successful async results", async () => {
    const result = await withDomainMap(
      () => Promise.resolve(42),
      () => notFound("unused"),
    );
    expect(result).toBe(42);
  });

  test("passes through ORPCError unchanged", async () => {
    const orpcError = new ORPCError("NOT_FOUND", {
      message: "Already an ORPCError",
    });
    const mapper = (err: DomainError) =>
      new ORPCError("BAD_REQUEST", { message: err.message });

    try {
      await withDomainMap(() => Promise.reject(orpcError), mapper);
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBe(orpcError);
    }
  });

  test("maps DomainError via mapper function", async () => {
    const domainError = new PaymentError(
      "INSUFFICIENT_FUNDS",
      "Not enough balance",
    );
    const mapped = notFound("Payment not found");

    try {
      await withDomainMap(
        () => Promise.reject(domainError),
        (err) => {
          expect(err).toBeInstanceOf(DomainError);
          expect(err.code).toBe("INSUFFICIENT_FUNDS");
          return mapped;
        },
      );
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBe(mapped);
    }
  });

  test("wraps unknown errors as internalServerError", async () => {
    const unknownError = new Error("something broke");

    try {
      await withDomainMap(
        () => Promise.reject(unknownError),
        () => notFound("unused"),
      );
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(ORPCError);
      const orpcErr = err as ORPCError<string, unknown>;
      expect(orpcErr.status).toBe(500);
      expect(orpcErr.message).toBe("Unexpected error");
    }
  });

  test("wraps non-Error throws as internalServerError", async () => {
    try {
      await withDomainMap(
        () => Promise.reject("string error"),
        () => notFound("unused"),
      );
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(ORPCError);
      const orpcErr = err as ORPCError<string, unknown>;
      expect(orpcErr.status).toBe(500);
      expect(orpcErr.message).toBe("Unexpected error");
    }
  });
});
