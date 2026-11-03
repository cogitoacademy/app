import { describe, expect, mock, test } from "bun:test";
import { ORPCError } from "@orpc/server";

import { DomainError } from "../../lib/domain-errors";
import {
  mapAdminPaymentError,
  InvalidPaymentCursorError,
  InvalidPaymentFilterError,
} from "../../modules/admin-payment/admin-payment.errors";
import {
  countRows,
  createAdminPaymentRepo,
  listRows,
} from "../../modules/admin-payment/admin-payment.repo";

function makeListConn(result: unknown) {
  const query: any = {
    from: () => query,
    innerJoin: () => query,
    where: () => query,
    orderBy: () => query,
    limit: () => Promise.resolve(result),
  };
  const select = mock(() => query);
  return { conn: { select } as never, select };
}

function makeCountConn(result: unknown) {
  const query: any = {
    from: () => query,
    innerJoin: () => query,
    where: () => Promise.resolve(result),
  };
  const select = mock(() => query);
  return { conn: { select } as never, select };
}

describe("admin-payment repo", () => {
  test("lists rows with every filter and cursor", async () => {
    const rows = [{ id: "p1" }];
    const { conn, select } = makeListConn(rows);

    const result = await listRows(
      conn,
      {
        status: "PAID",
        userId: "u1",
        query: "ada@example.com",
        dateFrom: new Date("2026-11-01T00:00:00.000Z"),
        dateTo: new Date("2026-11-30T23:59:59.999Z"),
      },
      10,
      { createdAt: new Date("2026-11-15T00:00:00.000Z"), id: "p1" },
    );

    expect(result).toEqual(rows);
    expect(select).toHaveBeenCalledTimes(1);
  });

  test("lists rows without filters and escapes wildcard searches", async () => {
    const { conn } = makeListConn([]);

    await expect(listRows(conn, {}, 5)).resolves.toEqual([]);
    await expect(listRows(conn, { query: "100%_real" }, 5)).resolves.toEqual(
      [],
    );
    await expect(listRows(conn, { query: "   " }, 5)).resolves.toEqual([]);
  });

  test("counts rows with and without filters", async () => {
    const { conn } = makeCountConn([{ value: 7 }]);

    await expect(
      countRows(conn, { status: "REFUNDED", userId: "u1" }),
    ).resolves.toBe(7);
    await expect(countRows(conn, {})).resolves.toBe(7);
    await expect(countRows(conn, { dateFrom: new Date() })).resolves.toBe(7);
    await expect(countRows(conn, { dateTo: new Date() })).resolves.toBe(7);
  });

  test("returns zero when the count row is absent", async () => {
    const { conn } = makeCountConn([]);
    await expect(countRows(conn, {})).resolves.toBe(0);
  });

  test("exposes the repo factory", () => {
    const repo = createAdminPaymentRepo();
    expect(repo).toHaveProperty("listRows");
    expect(repo).toHaveProperty("countRows");
  });
});

describe("mapAdminPaymentError", () => {
  class OtherError extends DomainError {
    readonly domain = "other";

    constructor(message: string) {
      super("OTHER", message);
    }
  }

  test("maps filter and cursor errors to bad requests", () => {
    const filter = mapAdminPaymentError(
      new InvalidPaymentFilterError("bad range"),
    );
    expect(filter).toBeInstanceOf(ORPCError);
    expect(filter.code).toBe("BAD_REQUEST");

    const cursor = mapAdminPaymentError(new InvalidPaymentCursorError());
    expect(cursor).toBeInstanceOf(ORPCError);
    expect(cursor.code).toBe("BAD_REQUEST");
  });

  test("maps unknown domain errors to internal errors", () => {
    const mapped = mapAdminPaymentError(new OtherError("boom"));
    expect(mapped).toBeInstanceOf(ORPCError);
    expect(mapped.code).toBe("INTERNAL_SERVER_ERROR");
  });
});
