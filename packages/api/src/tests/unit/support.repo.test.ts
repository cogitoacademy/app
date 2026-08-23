import { describe, expect, mock, test } from "bun:test";
import { createSupportRepo } from "../../modules/support/support.repo";

function makeSelectDb(rows: unknown[] = []) {
  const limit = mock(async () => rows);
  const offset = mock(() => ({ limit }));
  const orderBy = mock(() => ({ offset, limit }));
  const where = mock(() => ({ orderBy, offset, limit }));
  const from = mock(() => ({ where }));
  const select = mock(() => ({ from }));
  return { select, from, where, orderBy, offset, limit };
}

describe("SupportRepo", () => {
  test("filters reporter tickets by status", async () => {
    const db = makeSelectDb([{ id: "t1" }]);
    const repo = createSupportRepo();

    await expect(
      repo.listByReporter(db as any, "u1", { status: "open", limit: 10 }),
    ).resolves.toEqual([{ id: "t1" }]);
  });

  test("filters admin tickets by status", async () => {
    const rows = [{ id: "t1" }];
    const offset = mock(async () => rows);
    const limit = mock(() => ({ offset }));
    const orderBy = mock(() => ({ limit }));
    const where = mock(() => ({ orderBy }));
    const from = mock(() => ({ where }));
    const select = mock(() => ({ from }));
    const db = { select };
    const repo = createSupportRepo();

    await expect(
      repo.adminList(db as any, { status: "open", limit: 10, offset: 0 }),
    ).resolves.toEqual([{ id: "t1" }]);
  });
});
