import { describe, expect, mock, test } from "bun:test";
import {
  createAdminMarkPackageRepo,
  getById,
  insert,
  listAll,
  setActive,
  updateDetails,
} from "../../modules/admin-mark-package/admin-mark-package.repo";

function makeQueryChain(resolvedValue: unknown) {
  const chain: Record<string, ReturnType<typeof mock>> = {};
  const promise = Promise.resolve(resolvedValue) as Promise<unknown> &
    Record<string, ReturnType<typeof mock>>;

  for (const method of ["from", "where", "limit", "orderBy"]) {
    chain[method] = mock(() => promise);
    promise[method] = chain[method];
  }

  return { chain, promise };
}

describe("admin mark package repo", () => {
  test("lists all packages ordered by marks and code", async () => {
    const rows = [{ id: "p1", code: "starter" }];
    const { chain, promise } = makeQueryChain(rows);
    const select = mock(() => promise);

    await expect(listAll({ select } as any) as any).resolves.toEqual(rows);
    expect(chain.orderBy).toHaveBeenCalledTimes(1);
    expect((chain.orderBy as any).mock.calls[0]).toHaveLength(2);
  });

  test("gets a package by id and returns null when absent", async () => {
    const row = { id: "p1", code: "starter" };
    const found = makeQueryChain([row]);
    const missing = makeQueryChain([]);

    await expect(
      getById({ select: mock(() => found.promise) } as any, "p1"),
    ).resolves.toEqual(row as any);
    await expect(
      getById({ select: mock(() => missing.promise) } as any, "missing"),
    ).resolves.toBeNull();
    expect(found.chain.limit).toHaveBeenCalledWith(1);
  });

  test("inserts a package and returns the inserted row", async () => {
    const row = { id: "p1", code: "starter" };
    const returning = mock(async () => [row]);
    const values = mock(() => ({ returning }));
    const insertQuery = mock(() => ({ values }));

    await expect(
      insert({ insert: insertQuery } as any, {
        code: "starter",
        name: "Starter",
        marks: 50,
        priceIdr: 312_500,
        isActive: true,
      }),
    ).resolves.toEqual(row as any);
    expect(values).toHaveBeenCalledTimes(1);
    expect(returning).toHaveBeenCalledTimes(1);
  });

  test("updates package details and activation state", async () => {
    const detailsRow = { id: "p1", name: "Updated" };
    const activeRow = { id: "p1", isActive: false };
    const updateDetailsReturning = mock(async () => [detailsRow]);
    const updateActiveReturning = mock(async () => [activeRow]);
    const detailsWhere = mock(() => ({ returning: updateDetailsReturning }));
    const activeWhere = mock(() => ({ returning: updateActiveReturning }));
    const detailsSet = mock(() => ({ where: detailsWhere }));
    const activeSet = mock(() => ({ where: activeWhere }));
    const update = mock()
      .mockImplementationOnce(() => ({ set: detailsSet }))
      .mockImplementationOnce(() => ({ set: activeSet }));

    await expect(
      updateDetails({ update } as any, "p1", {
        name: "Updated",
        marks: 75,
        priceIdr: 450_000,
      }),
    ).resolves.toEqual(detailsRow as any);
    await expect(
      setActive({ update } as any, "p1", false) as any,
    ).resolves.toEqual(activeRow as any);
    expect(detailsSet).toHaveBeenCalledWith({
      name: "Updated",
      marks: 75,
      priceIdr: 450_000,
    });
    expect(activeSet).toHaveBeenCalledWith({ isActive: false });
  });

  test("returns null when updates affect no row", async () => {
    const returning = mock(async () => []);
    const where = mock(() => ({ returning }));
    const set = mock(() => ({ where }));
    const update = mock(() => ({ set }));

    await expect(
      updateDetails({ update } as any, "missing", {
        name: "Name",
        marks: 10,
        priceIdr: 100,
      }),
    ).resolves.toBeNull();
    await expect(
      setActive({ update } as any, "missing", true),
    ).resolves.toBeNull();
  });

  test("factory exposes all repository operations", () => {
    expect(createAdminMarkPackageRepo()).toEqual({
      listAll,
      getById,
      insert,
      updateDetails,
      setActive,
    });
  });
});
