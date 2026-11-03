import { describe, expect, mock, test } from "bun:test";

import { ORPCError } from "@orpc/server";

import { DomainError } from "../../lib/domain-errors";
import {
  InvalidAuditCursorError,
  InvalidAuditDateRangeError,
  mapAdminAuditError,
} from "../../modules/admin-audit/admin-audit.errors";
import { createAdminAuditHandler } from "../../modules/admin-audit/admin-audit.handler";

const context = { session: { user: { id: "admin-1" } } } as any;

class UnexpectedAdminAuditError extends DomainError {
  readonly domain = "admin-audit";

  constructor() {
    super("UNEXPECTED", "Unexpected error");
  }
}

describe("admin audit handler", () => {
  test("delegates the list input to the service", async () => {
    const list = mock(async () => ({
      items: [{ id: "audit-1" }],
      nextCursor: null,
    }));
    const handler = createAdminAuditHandler({ list } as any);
    const input = { limit: 25, action: "economy_config_updated" };

    await expect(
      handler.listAuditLogs({ context, input } as any) as any,
    ).resolves.toEqual({ items: [{ id: "audit-1" }], nextCursor: null });
    expect(list).toHaveBeenCalledWith(input);
  });

  test("maps domain failures to ORPC errors", async () => {
    const list = mock(async () => {
      throw new InvalidAuditDateRangeError();
    });
    const handler = createAdminAuditHandler({ list } as any);

    const error = (await handler
      .listAuditLogs({ context, input: { limit: 50 } } as any)
      .catch((caught: unknown) => caught)) as ORPCError<string, unknown>;

    expect(error).toBeInstanceOf(ORPCError);
    expect(error.status).toBe(400);
    expect(error.message).toBe("The start date cannot be after the end date");
  });

  test("maps unknown domain failures to internal errors", async () => {
    const list = mock(async () => {
      throw new UnexpectedAdminAuditError();
    });
    const handler = createAdminAuditHandler({ list } as any);

    const error = (await handler
      .listAuditLogs({ context, input: { limit: 50 } } as any)
      .catch((caught: unknown) => caught)) as ORPCError<string, unknown>;

    expect(error.status).toBe(500);
  });
});

describe("admin audit error mapper", () => {
  const mappings: Array<[DomainError, number]> = [
    [new InvalidAuditDateRangeError(), 400],
    [new InvalidAuditCursorError(), 400],
    [new UnexpectedAdminAuditError(), 500],
  ];

  for (const [error, status] of mappings) {
    test(`maps ${error.name} to HTTP ${status}`, () => {
      expect(mapAdminAuditError(error).status).toBe(status);
    });
  }
});
