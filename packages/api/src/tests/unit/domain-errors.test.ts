import { describe, test, expect } from "bun:test";
import { DomainError } from "../../lib/domain-errors";

class BookingError extends DomainError {
  readonly domain = "booking";

  constructor(
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(code, message, details);
  }
}

describe("DomainError", () => {
  test("is instance of DomainError", () => {
    const err = new BookingError("BOOKING_NOT_FOUND", "Booking not found");
    expect(err).toBeInstanceOf(DomainError);
    expect(err).toBeInstanceOf(Error);
  });

  test("exposes code, domain, and message", () => {
    const err = new BookingError("BOOKING_CONFLICT", "Slot already taken");
    expect(err.code).toBe("BOOKING_CONFLICT");
    expect(err.domain).toBe("booking");
    expect(err.message).toBe("Slot already taken");
  });

  test("name equals constructor name", () => {
    const err = new BookingError("CODE", "msg");
    expect(err.name).toBe("BookingError");
  });

  test("details are stored when provided", () => {
    const err = new BookingError("VALIDATION_FAILED", "Invalid input", {
      field: "email",
      value: "bad",
    });
    expect(err.details).toEqual({ field: "email", value: "bad" });
  });

  test("details are undefined when not provided", () => {
    const err = new BookingError("CODE", "msg");
    expect(err.details).toBeUndefined();
  });
});
