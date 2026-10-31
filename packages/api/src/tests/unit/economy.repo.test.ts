import { describe, expect, mock, test } from "bun:test";
import { createEconomyRepo } from "../../modules/economy/economy.repo";
import type { DbOrTx } from "../../lib/tx";

function fixture(rows: unknown[][], inserted: unknown[] = []) {
  const writes: unknown[] = [];
  const chain = () => ({
    from: () => chain(),
    where: () => chain(),
    orderBy: () => chain(),
    limit: async () => rows.shift() ?? [],
  });
  const conn = {
    execute: mock(async () => undefined),
    select: () => chain(),
    insert: () => ({
      values: (value: unknown) => {
        writes.push(value);
        return {
          onConflictDoNothing: async () => undefined,
          onConflictDoUpdate: async () => undefined,
          returning: async () => inserted,
        };
      },
    }),
    update: () => ({
      set: (value: unknown) => {
        writes.push(value);
        return { where: () => ({ returning: async () => inserted }) };
      },
    }),
  };
  return { conn: conn as unknown as DbOrTx, writes, execute: conn.execute };
}

const repo = createEconomyRepo();
describe("economy repository concurrency", () => {
  test("reuses existing config, creates missing config, and rejects failed creation", async () => {
    const row = { id: "default", version: 1 };
    const existing = fixture([[row]]);
    expect(await repo.getOrCreate(existing.conn)).toEqual(row);
    expect(existing.writes).toHaveLength(0);
    const created = fixture([[], [row]]);
    expect(await repo.getOrCreate(created.conn)).toEqual(row);
    expect(created.writes).toHaveLength(1);
    await expect(repo.getOrCreate(fixture([[], []]).conn)).rejects.toThrow(
      "could not be created",
    );
  });
  test("updates with actor and optimistic version predicate", async () => {
    const f = fixture([], [{ version: 2 }]);
    expect(
      await repo.updateWithVersion(
        f.conn,
        1,
        "admin",
        {} as Parameters<typeof repo.updateWithVersion>[3],
      ),
    ).toEqual([{ version: 2 }]);
    expect(f.writes[0]).toMatchObject({ updatedBy: "admin" });
  });
  test("returns nullable revision lookups and follows the active pointer", async () => {
    for (const row of [undefined, { version: 2 }]) {
      expect(
        await repo.getLatestV3Revision(fixture([row ? [row] : []]).conn),
      ).toEqual(row ?? null);
      expect(
        await repo.getV3RevisionByVersion(fixture([row ? [row] : []]).conn, 2),
      ).toEqual(row ?? null);
    }
    expect(await repo.getActiveV3Revision(fixture([[]]).conn)).toBeNull();
    expect(
      await repo.getActiveV3Revision(fixture([[{ version: null }]]).conn),
    ).toBeNull();
    expect(
      await repo.getActiveV3Revision(
        fixture([[{ version: 2 }], [{ version: 2 }]]).conn,
      ),
    ).toEqual({ version: 2 });
  });
  test("serializes append, rejects stale versions, and fails an empty insert", async () => {
    const input = {
      expectedVersion: 0,
      values: { rates: [] },
      reason: "initial",
      createdBy: "admin",
    };
    const f = fixture([[]], [{ version: 1 }]);
    expect(await repo.appendV3Revision(f.conn, input)).toEqual({ version: 1 });
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.writes[0]).toMatchObject({ version: 1, createdBy: "admin" });
    const stale = fixture([[{ version: 1 }]]);
    expect(await repo.appendV3Revision(stale.conn, input)).toBeNull();
    expect(stale.writes).toHaveLength(0);
    expect(
      await repo.appendV3Revision(
        fixture([[{ version: 1 }]], [{ version: 2 }]).conn,
        { ...input, expectedVersion: 1 },
      ),
    ).toEqual({ version: 2 });
    await expect(
      repo.appendV3Revision(fixture([[]]).conn, input),
    ).rejects.toThrow("could not be saved");
  });
  test("activates only the latest revision with the expected active pointer", async () => {
    const input = {
      version: 2,
      expectedActiveRevision: null,
      updatedBy: "admin",
    };
    for (const latest of [undefined, { version: 1 }]) {
      const f = fixture([latest ? [latest] : [], []]);
      expect(await repo.activateV3Revision(f.conn, input)).toBeNull();
      expect(f.writes).toHaveLength(0);
    }
    const stale = fixture([
      [{ version: 2 }],
      [{ version: 1 }],
      [{ version: 1 }],
    ]);
    expect(await repo.activateV3Revision(stale.conn, input)).toBeNull();
    expect(stale.writes).toHaveLength(0);
    const initial = fixture([[{ version: 2 }], []]);
    expect(await repo.activateV3Revision(initial.conn, input)).toEqual({
      version: 2,
    });
    expect(initial.writes[0]).toMatchObject({
      activeRevision: 2,
      updatedBy: "admin",
    });
    const update = fixture([
      [{ version: 2 }],
      [{ version: 1 }],
      [{ version: 1 }],
    ]);
    expect(
      await repo.activateV3Revision(update.conn, {
        ...input,
        expectedActiveRevision: 1,
      }),
    ).toEqual({ version: 2 });
  });
});
