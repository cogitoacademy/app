import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";

import type { DbOrTx } from "../../lib/tx";
import {
  createAdminAuditRepo,
  type AuditLogListQuery,
} from "../../modules/admin-audit/admin-audit.repo";

function fixture(rows: unknown[]) {
  const predicates: unknown[] = [];
  const ordering: unknown[] = [];
  const limits: unknown[] = [];
  const chain = {
    from: () => chain,
    leftJoin: () => chain,
    where: (value: unknown) => {
      predicates.push(value);
      return chain;
    },
    orderBy: (...values: unknown[]) => {
      ordering.push(...values);
      return chain;
    },
    limit: async (value: unknown) => {
      limits.push(value);
      return rows;
    },
  };
  return {
    conn: { select: () => chain } as unknown as DbOrTx,
    predicates,
    ordering,
    limits,
  };
}

function emptyQuery(
  overrides: Partial<AuditLogListQuery> = {},
): AuditLogListQuery {
  return {
    limit: 50,
    cursor: null,
    action: null,
    targetType: null,
    targetId: null,
    actorId: null,
    dateFrom: null,
    dateTo: null,
    ...overrides,
  };
}

describe("admin audit repository", () => {
  test("fetches one extra row and orders newest first", async () => {
    const repo = createAdminAuditRepo();
    const f = fixture([{ id: "audit-1" }]);

    await expect(repo.listPage(f.conn, emptyQuery())).resolves.toEqual([
      { id: "audit-1" },
    ]);
    expect(f.predicates[0]).toBeUndefined();
    expect(f.limits).toEqual([51]);
    expect(f.ordering).toHaveLength(2);
  });

  test("applies action, target, actor and date filters", async () => {
    const repo = createAdminAuditRepo();
    const f = fixture([]);
    const dateFrom = new Date("2026-11-01T00:00:00.000Z");
    const dateTo = new Date("2026-11-02T00:00:00.000Z");

    await repo.listPage(
      f.conn,
      emptyQuery({
        limit: 10,
        action: "economy_config_updated",
        targetType: "economy_config",
        targetId: "config-1",
        actorId: "admin-1",
        dateFrom,
        dateTo,
      }),
    );

    const sql = new PgDialect().sqlToQuery(
      f.predicates[0] as Parameters<PgDialect["sqlToQuery"]>[0],
    );
    expect(sql.params).toEqual(
      expect.arrayContaining([
        "%economy\\_config\\_updated%",
        "%economy\\_config%",
        "config-1",
        "admin-1",
        dateFrom.toISOString(),
        dateTo.toISOString(),
      ]),
    );
    expect(f.limits).toEqual([11]);
  });

  test("paginates with the composite cursor", async () => {
    const repo = createAdminAuditRepo();
    const f = fixture([]);
    const createdAt = new Date("2026-11-01T00:00:00.000Z");

    await repo.listPage(
      f.conn,
      emptyQuery({
        limit: 5,
        cursor: { createdAt, id: "audit-1" },
      }),
    );

    const sql = new PgDialect().sqlToQuery(
      f.predicates[0] as Parameters<PgDialect["sqlToQuery"]>[0],
    );
    expect(sql.params).toEqual(
      expect.arrayContaining([createdAt.toISOString(), "audit-1"]),
    );
    expect(f.limits).toEqual([6]);
  });
});
