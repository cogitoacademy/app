import { describe, expect, mock, test } from "bun:test";
import type { DbType } from "../../lib/db";
import { FaqLandingLimitError } from "../../modules/faq/faq.errors";
import { createFaqRepo } from "../../modules/faq/faq.repo";

function chain(result: unknown) {
  const value: Record<string, unknown> = {};
  for (const method of ["from", "where", "orderBy", "limit"]) {
    value[method] = mock(() => value);
  }
  // The mock query builder must be awaitable like Drizzle's query object.
  // eslint-disable-next-line unicorn/no-thenable
  value.then = (
    resolve: (value: unknown) => unknown,
    reject: (error: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return value;
}

function makeRepo(
  selectResults: unknown[] = [],
  returnedRows: unknown[] = [{ id: "faq-1", version: 2 }],
) {
  const queues = [...selectResults];
  const select = mock(() => chain(queues.shift() ?? []));
  const returning = mock(async () => returnedRows);
  const values = mock(() => ({ returning }));
  const where = mock(() => ({ returning }));
  const set = mock(() => ({ where }));
  const insert = mock(() => ({ values }));
  const update = mock(() => ({ set }));
  const tx = {
    execute: mock(async () => []),
    select,
    insert,
    update,
  };
  const db = {
    ...tx,
    transaction: mock(async (callback: (tx: typeof tx) => unknown) =>
      callback(tx),
    ),
  } as unknown as DbType;
  return {
    repo: createFaqRepo(db),
    db,
    tx,
    select,
    returning,
    values,
    set,
    insert,
    update,
  };
}

describe("FAQ repository", () => {
  test("lists admin/public rows and finds an entry by ID", async () => {
    const adminRows = [{ id: "faq-1" }];
    const publicRows = [{ id: "faq-1", questionEn: "Q" }];
    const findRows = [{ id: "faq-1" }];
    const results = [adminRows, publicRows, findRows, []];
    const select = mock(() => chain(results.shift()));
    const db = { select } as unknown as DbType;
    const repo = createFaqRepo(db);

    expect(await repo.listAdmin()).toEqual(adminRows);
    expect(await repo.listPublic(true)).toEqual(publicRows);
    expect(await repo.listPublic(false)).toEqual(findRows);
    expect(await repo.findById("missing")).toBeUndefined();
    expect(select).toHaveBeenCalledTimes(4);
  });

  test("creates with the next order and defaults to zero when aggregate is absent", async () => {
    const { repo, tx, select, insert, values } = makeRepo([[]]);
    const created = await repo.create({
      questionEn: "Q",
      questionId: null,
      answerEn: [{ type: "paragraph", text: "A" }],
      answerId: null,
      questionEnRich: { type: "doc", blocks: [] },
      questionIdRich: null,
      answerEnRich: { type: "doc", blocks: [] },
      answerIdRich: null,
      isActive: false,
      showOnLanding: false,
    } as never);
    expect(created).toEqual({ id: "faq-1", version: 2 });
    expect(tx.execute).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(values.mock.calls[0]?.[0]).toMatchObject({ sortOrder: 0 });
  });

  test("rejects creation when all landing slots are occupied", async () => {
    const { repo } = makeRepo([
      Array.from({ length: 6 }, (_, i) => ({ id: `faq-${i}` })),
    ]);
    await expect(
      repo.create({ isActive: true, showOnLanding: true } as never),
    ).rejects.toBeInstanceOf(FaqLandingLimitError);
  });

  test("allows create and update selection when fewer than six FAQs are selected", async () => {
    const create = makeRepo([[], [{ next: 4 }]]);
    await create.repo.create({ isActive: true, showOnLanding: true } as never);

    const update = makeRepo([[{ version: 1 }], []]);
    expect(
      await update.repo.updateIfVersion("faq-1", 1, {
        isActive: true,
        showOnLanding: true,
      }),
    ).toEqual({ id: "faq-1", version: 2 });
  });

  test("throws when insert unexpectedly returns no FAQ row", async () => {
    const { repo } = makeRepo([[]], []);
    await expect(
      repo.create({ isActive: false, showOnLanding: false } as never),
    ).rejects.toThrow("FAQ insert returned no row");
  });

  test("updates versioned rows, skips stale/missing rows, and enforces landing limit", async () => {
    const { repo, update, returning } = makeRepo([[{ version: 2 }], []]);
    expect(await repo.updateIfVersion("faq-1", 2, { isActive: false })).toEqual(
      {
        id: "faq-1",
        version: 2,
      },
    );
    expect(update).toHaveBeenCalledTimes(1);
    expect(returning).toHaveBeenCalledTimes(1);

    const missing = makeRepo([[]]);
    expect(
      await missing.repo.updateIfVersion("missing", 1, {}),
    ).toBeUndefined();

    const stale = makeRepo([[{ version: 3 }]]);
    expect(await stale.repo.updateIfVersion("faq-1", 2, {})).toBeUndefined();

    const full = makeRepo([
      [{ version: 1 }],
      Array.from({ length: 6 }, (_, i) => ({ id: `faq-${i}` })),
    ]);
    await expect(
      full.repo.updateIfVersion("faq-1", 1, {
        isActive: true,
        showOnLanding: true,
      }),
    ).rejects.toBeInstanceOf(FaqLandingLimitError);
    expect(full.select).toHaveBeenCalledTimes(2);
  });

  test("reorders each supplied ID inside a transaction", async () => {
    const { repo, update, set } = makeRepo();
    await repo.reorder(["faq-a", "faq-b"]);
    expect(update).toHaveBeenCalledTimes(2);
    expect(set).toHaveBeenCalledTimes(2);
  });
});
