import { describe, expect, test } from "bun:test";
import { DomainError } from "../../lib/domain-errors";
import {
  LatenessReportTooEarlyError,
  SupportBookingAccessError,
  SupportTicketAlreadyResolvedError,
  SupportTicketNotFoundError,
  mapSupportError,
} from "../../modules/support/support.errors";

describe("support error mapping", () => {
  test.each([
    [new SupportTicketNotFoundError("ticket-1"), 404],
    [new SupportBookingAccessError("booking-1"), 400],
    [new LatenessReportTooEarlyError("booking-2"), 400],
    [new SupportTicketAlreadyResolvedError("ticket-2"), 409],
    [new DomainError("UNKNOWN", "unexpected support failure", {}), 500],
  ] as const)("maps %s to HTTP %d", (error, status) => {
    expect(mapSupportError(error).status).toBe(status);
  });
});
