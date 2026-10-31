import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { DbOrTx } from "../../lib/tx";
import { createAdminKnowledgeBankRepo } from "../../modules/admin-knowledge-bank/admin-knowledge-bank.repo";

import {
  getById,
  getListItemById,
  remove,
  updateDetails,
} from "../../modules/admin-knowledge-bank/admin-knowledge-bank.repo";

describe("admin knowledge-bank repository", () => {
  function fixture(rows: unknown[]) {
    const predicates: unknown[] = [];
    const writes: unknown[] = [];
    const chain = {
      from: () => chain,
      innerJoin: () => chain,
      where: (value: unknown) => {
        predicates.push(value);
        return chain;
      },
      orderBy: async () => rows,
      limit: async () => rows,
      returning: async () => rows,
      set: (value: unknown) => {
        writes.push(value);
        return chain;
      },
      values: (value: unknown) => {
        writes.push(value);
        return chain;
      },
    };
    return {
      conn: {
        select: () => chain,
        insert: () => chain,
        update: () => chain,
        delete: () => chain,
      } as unknown as DbOrTx,
      predicates,
      writes,
    };
  }

  test("filters active and expired grants and escapes literal search wildcards", async () => {
    const repo = createAdminKnowledgeBankRepo();
    const now = new Date();
    for (const status of ["active", "expired", "all"] as const) {
      const f = fixture([{ id: "grant" }]);
      expect(
        await repo.listAll(f.conn, { status, search: "  a%b_c\\d  " }, now),
      ).toEqual([{ id: "grant" }]);
      const sql = new PgDialect().sqlToQuery(
        f.predicates[0] as Parameters<PgDialect["sqlToQuery"]>[0],
      );
      expect(sql.params).toContain("%a\\%b\\_c\\\\d%");
      if (status !== "all") expect(sql.params).toContain(now.toISOString());
    }
    for (const search of [undefined, "   "]) {
      const f = fixture([]);
      expect(
        await repo.listAll(f.conn, { status: "all", search }, now),
      ).toEqual([]);
      expect(f.predicates[0]).toBeUndefined();
    }
  });

  test("resolves grants and student identities with explicit null for missing rows", async () => {
    const repo = createAdminKnowledgeBankRepo();
    const now = new Date();
    for (const rows of [[], [{ id: "found" }]]) {
      const f = fixture(rows);
      const expected = rows[0] ?? null;
      expect(await repo.getById(f.conn, "id")).toEqual(expected);
      expect(await repo.getListItemById(f.conn, "id")).toEqual(expected);
      expect(await repo.getByUserId(f.conn, "user")).toEqual(expected);
      expect(await repo.getActiveByUserId(f.conn, "user", now)).toEqual(
        expected,
      );
      expect(await repo.findUserByEmail(f.conn, "Student@Example.com")).toEqual(
        expected,
      );
    }
  });

  test("persists grant details and returns changed or removed rows", async () => {
    const repo = createAdminKnowledgeBankRepo();
    const f = fixture([{ id: "grant" }]);
    const values = {
      userId: "student",
      grantedByUserId: "admin",
      expiresAt: new Date(),
      note: "Approved",
    };
    expect(await repo.insert(f.conn, values)).toEqual({ id: "grant" });
    expect(await repo.updateDetails(f.conn, "grant", values)).toEqual({
      id: "grant",
    });
    expect(await repo.remove(f.conn, "grant")).toEqual({ id: "grant" });
    expect(f.writes).toEqual([values, values]);
  });
  test("returns null when a grant lookup finds no row", async () => {
    const conn = {
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => [] }),
        }),
      }),
    };

    await expect(getById(conn as any, "missing-grant")).resolves.toBeNull();
  });

  test("returns null when the joined grant lookup finds no row", async () => {
    const conn = {
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: () => ({ limit: async () => [] }),
          }),
        }),
      }),
    };

    await expect(
      getListItemById(conn as any, "missing-grant"),
    ).resolves.toBeNull();
  });

  test("returns null when an update finds no grant", async () => {
    const conn = {
      update: () => ({
        set: () => ({
          where: () => ({ returning: async () => [] }),
        }),
      }),
    };

    await expect(
      updateDetails(conn as any, "missing-grant", {
        expiresAt: new Date("2030-01-01T00:00:00.000Z"),
        note: null,
      }),
    ).resolves.toBeNull();
  });

  test("returns null when a delete finds no grant", async () => {
    const conn = {
      delete: () => ({
        where: () => ({ returning: async () => [] }),
      }),
    };

    await expect(remove(conn as any, "missing-grant")).resolves.toBeNull();
  });
});
