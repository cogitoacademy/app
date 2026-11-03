import { describe, expect, mock, test } from "bun:test";

import {
  InvalidAuditCursorError,
  InvalidAuditDateRangeError,
} from "../../modules/admin-audit/admin-audit.errors";
import { createAdminAuditService } from "../../modules/admin-audit/admin-audit.service";

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "audit-1",
    actorId: "admin-1",
    actorName: "Ada Admin",
    actorEmail: "ada@example.test",
    actorType: "admin",
    action: "economy_config_updated",
    targetType: "economy_config",
    targetId: "config-1",
    beforeState: { version: 1 },
    afterState: { version: 2 },
    details: { reason: "rate change" },
    createdAt: new Date("2026-11-01T00:00:00.000Z"),
    ...overrides,
  };
}

function makeService(rows: unknown[] = [makeRow()]) {
  const listPage = mock(async () => rows);
  const repo = { listPage } as any;
  const service = createAdminAuditService({ db: {} as any, repo });
  return { service, listPage };
}

const DEFAULT_INPUT = { limit: 50 };

describe("admin audit service", () => {
  test("maps rows to serializable views and omits the cursor on the last page", async () => {
    const { service } = makeService([makeRow()]);

    await expect(service.list(DEFAULT_INPUT)).resolves.toEqual({
      items: [
        {
          id: "audit-1",
          actorId: "admin-1",
          actorName: "Ada Admin",
          actorEmail: "ada@example.test",
          actorType: "admin",
          action: "economy_config_updated",
          targetType: "economy_config",
          targetId: "config-1",
          beforeState: { version: 1 },
          afterState: { version: 2 },
          details: { reason: "rate change" },
          createdAt: "2026-11-01T00:00:00.000Z",
        },
      ],
      nextCursor: null,
    });
  });

  test("keeps nullable actor identity for deleted users", async () => {
    const { service } = makeService([
      makeRow({
        actorId: null,
        actorName: null,
        actorEmail: null,
        actorType: "system",
        details: null,
      }),
    ]);

    const page = await service.list(DEFAULT_INPUT);

    expect(page.items[0]).toMatchObject({
      actorId: null,
      actorName: null,
      actorEmail: null,
      actorType: "system",
      details: null,
    });
  });

  test("returns a composite cursor only when another page exists", async () => {
    const rows = [
      makeRow({
        id: "audit-2",
        createdAt: new Date("2026-11-02T00:00:00.000Z"),
      }),
      makeRow({
        id: "audit-1",
        createdAt: new Date("2026-11-01T00:00:00.000Z"),
      }),
      makeRow({
        id: "audit-0",
        createdAt: new Date("2026-10-31T00:00:00.000Z"),
      }),
    ];
    const { service } = makeService(rows);

    const page = await service.list({ limit: 2 });

    expect(page.items.map((item) => item.id)).toEqual(["audit-2", "audit-1"]);
    expect(page.nextCursor).toBe("2026-11-01T00:00:00.000Z~audit-1");
  });

  test("decodes the cursor and forwards trimmed filters", async () => {
    const { service, listPage } = makeService([]);

    await service.list({
      limit: 10,
      cursor: "2026-11-01T00:00:00.000Z~audit-1",
      action: "  economy_config_updated ",
      targetType: " economy_config ",
      targetId: "   ",
      actorId: " admin-1 ",
      dateFrom: "2026-11-01T00:00:00.000Z",
      dateTo: "2026-11-02T00:00:00.000Z",
    });

    const [connection, query] = listPage.mock.calls[0]!;
    expect(connection).toEqual({});
    expect(query).toMatchObject({
      limit: 10,
      action: "economy_config_updated",
      targetType: "economy_config",
      targetId: null,
      actorId: "admin-1",
      dateFrom: new Date("2026-11-01T00:00:00.000Z"),
      dateTo: new Date("2026-11-02T00:00:00.000Z"),
    });
    expect(query.cursor).toEqual({
      createdAt: new Date("2026-11-01T00:00:00.000Z"),
      id: "audit-1",
    });
  });

  test("rejects a start date after the end date", async () => {
    const { service, listPage } = makeService([]);

    await expect(
      service.list({
        limit: 50,
        dateFrom: "2026-11-02T00:00:00.000Z",
        dateTo: "2026-11-01T00:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(InvalidAuditDateRangeError);
    expect(listPage).not.toHaveBeenCalled();
  });

  test("accepts equal start and end dates", async () => {
    const { service } = makeService([]);

    await expect(
      service.list({
        limit: 50,
        dateFrom: "2026-11-01T00:00:00.000Z",
        dateTo: "2026-11-01T00:00:00.000Z",
      }),
    ).resolves.toEqual({ items: [], nextCursor: null });
  });

  test("rejects a malformed cursor before querying", async () => {
    const { service, listPage } = makeService([]);

    for (const cursor of ["missing-separator", "~audit-1", "not-a-date~id"]) {
      await expect(service.list({ limit: 50, cursor })).rejects.toBeInstanceOf(
        InvalidAuditCursorError,
      );
    }
    expect(listPage).not.toHaveBeenCalled();
  });
});
