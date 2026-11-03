import { describe, expect, test } from "bun:test";

import { listAuditLogsInput } from "../../modules/admin-audit/admin-audit.types";

describe("admin audit list input", () => {
  test("defaults the page size to 50", () => {
    expect(listAuditLogsInput.parse({})).toEqual({ limit: 50 });
  });

  test("accepts the limit bounds", () => {
    expect(listAuditLogsInput.parse({ limit: 1 }).limit).toBe(1);
    expect(listAuditLogsInput.parse({ limit: 100 }).limit).toBe(100);
    expect(listAuditLogsInput.safeParse({ limit: 0 }).success).toBe(false);
    expect(listAuditLogsInput.safeParse({ limit: 101 }).success).toBe(false);
    expect(listAuditLogsInput.safeParse({ limit: 10.5 }).success).toBe(false);
  });

  test("trims filters and keeps empty optional filters out", () => {
    const parsed = listAuditLogsInput.parse({
      action: "  economy_config_updated  ",
      targetType: " economy_config ",
      targetId: " target-1 ",
      actorId: " actor-1 ",
    });

    expect(parsed).toMatchObject({
      action: "economy_config_updated",
      targetType: "economy_config",
      targetId: "target-1",
      actorId: "actor-1",
    });
    expect(listAuditLogsInput.safeParse({ action: "   " }).success).toBe(false);
  });

  test("bounds the text filters", () => {
    expect(
      listAuditLogsInput.safeParse({ action: "a".repeat(100) }).success,
    ).toBe(true);
    expect(
      listAuditLogsInput.safeParse({ action: "a".repeat(101) }).success,
    ).toBe(false);
    expect(
      listAuditLogsInput.safeParse({ targetType: "a".repeat(101) }).success,
    ).toBe(false);
    expect(
      listAuditLogsInput.safeParse({ targetId: "a".repeat(101) }).success,
    ).toBe(false);
    expect(
      listAuditLogsInput.safeParse({ actorId: "a".repeat(101) }).success,
    ).toBe(false);
    expect(
      listAuditLogsInput.safeParse({ cursor: "a".repeat(121) }).success,
    ).toBe(false);
  });

  test("requires ISO datetimes with an offset", () => {
    expect(
      listAuditLogsInput.parse({
        dateFrom: "2026-11-01T00:00:00.000Z",
        dateTo: "2026-11-02T23:59:59.999Z",
      }),
    ).toMatchObject({
      dateFrom: "2026-11-01T00:00:00.000Z",
      dateTo: "2026-11-02T23:59:59.999Z",
    });

    for (const value of ["2026-11-01", "2026-11-01T00:00:00", "not a date"]) {
      expect(listAuditLogsInput.safeParse({ dateFrom: value }).success).toBe(
        false,
      );
    }
  });
});
