import { describe, expect, test } from "bun:test";

import { DomainError } from "../../lib/domain-errors";
import {
  ContactBookingNotCompletedError,
  ContactBookingUnavailableError,
  ContactParticipantUnavailableError,
  ContactRequestAlreadyExistsError,
  ContactRequestAlreadyRespondedError,
  ContactRequestNotFoundError,
  ContactRequestNotRecipientError,
  ContactRequestsDisabledError,
  mapContactError,
} from "../../modules/contact/contact.errors";

class UnknownContactError extends DomainError {
  readonly domain = "contact";
}

describe("contact error mapping", () => {
  test.each([
    [
      "booking unavailable",
      new ContactBookingUnavailableError("booking-1"),
      "NOT_FOUND",
    ],
    [
      "booking not completed",
      new ContactBookingNotCompletedError("booking-1"),
      "BAD_REQUEST",
    ],
    [
      "participant unavailable",
      new ContactParticipantUnavailableError("booking-1"),
      "BAD_REQUEST",
    ],
    [
      "requests disabled",
      new ContactRequestsDisabledError("user-2"),
      "BAD_REQUEST",
    ],
    [
      "request already exists",
      new ContactRequestAlreadyExistsError("booking-1", "user-2"),
      "CONFLICT",
    ],
    [
      "request not found",
      new ContactRequestNotFoundError("request-1"),
      "NOT_FOUND",
    ],
    [
      "not recipient",
      new ContactRequestNotRecipientError("request-1"),
      "FORBIDDEN",
    ],
    [
      "already responded",
      new ContactRequestAlreadyRespondedError("request-1"),
      "CONFLICT",
    ],
  ] as const)("maps $0 to $2", (_label, error, code) => {
    expect(mapContactError(error).code).toBe(code);
  });

  test("maps an unknown domain error to an internal server error", () => {
    const error = new UnknownContactError("UNKNOWN_CONTACT", "Unexpected");

    expect(mapContactError(error).code).toBe("INTERNAL_SERVER_ERROR");
  });
});
