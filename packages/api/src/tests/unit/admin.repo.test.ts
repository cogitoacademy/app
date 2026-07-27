import { describe, test, expect, mock } from "bun:test";
import {
  listUsers,
  countUsers,
  getById,
  countAdmins,
  updateRole,
  updateRoleWithExpected,
  createAdminRepo,
} from "../../modules/admin/admin.repo";

function makeQueryChain(resolvedValue: any) {
  const chain: any = {};
  const methods = ["from", "where", "limit", "offset", "orderBy"];
  const promise = Promise.resolve(resolvedValue);

  for (const method of methods) {
    chain[method] = mock(() => promise);
  }

  for (const method of methods) {
    (promise as any)[method] = chain[method];
  }

  return { chain, promise };
}

function makeSelectConn(resolvedValue: any) {
  const { chain, promise } = makeQueryChain(resolvedValue);
  const select = mock(() => promise);
  return { select, chain };
}

function makeUpdateConn(returningRows: any[] = []) {
  const returning = mock(() => Promise.resolve(returningRows));
  const where = mock(() => ({ returning }));
  const set = mock(() => ({ where }));
  const update = mock(() => ({ set }));
  return { update, set, where, returning };
}

describe("listUsers", () => {
  test("selects users with limit and offset", async () => {
    const rows = [{ id: "u1" }, { id: "u2" }];
    const { select, chain } = makeSelectConn(rows);
    const conn: any = { select };

    const result = await listUsers(conn, 10, 5);

    expect(result).toEqual(rows);
    expect(chain.from).toHaveBeenCalledTimes(1);
    expect(chain.orderBy).toHaveBeenCalledTimes(1);
    expect(chain.limit).toHaveBeenCalledWith(10);
    expect(chain.offset).toHaveBeenCalledWith(5);
  });
});

describe("countUsers", () => {
  test("returns count from select", async () => {
    const { select, chain } = makeSelectConn([{ count: 42 }]);
    const conn: any = { select };

    const result = await countUsers(conn);

    expect(result).toBe(42);
    expect(chain.from).toHaveBeenCalledTimes(1);
  });

  test("returns 0 when no rows", async () => {
    const { select } = makeSelectConn([]);
    const conn: any = { select };

    const result = await countUsers(conn);

    expect(result).toBe(0);
  });
});

describe("getById", () => {
  test("returns user when found", async () => {
    const row = { id: "u1", role: "student" };
    const { select, chain } = makeSelectConn([row]);
    const conn: any = { select };

    const result = await getById(conn, "u1");

    expect(result).toEqual(row);
    expect(chain.where).toHaveBeenCalledTimes(1);
    expect(chain.limit).toHaveBeenCalledWith(1);
  });

  test("returns null when not found", async () => {
    const { select } = makeSelectConn([]);
    const conn: any = { select };

    const result = await getById(conn, "missing");

    expect(result).toBeNull();
  });
});

describe("countAdmins", () => {
  test("returns admin count", async () => {
    const { select, chain } = makeSelectConn([{ count: 3 }]);
    const conn: any = { select };

    const result = await countAdmins(conn);

    expect(result).toBe(3);
    expect(chain.where).toHaveBeenCalledTimes(1);
  });

  test("returns 0 when no admins", async () => {
    const { select } = makeSelectConn([{ count: 0 }]);
    const conn: any = { select };

    const result = await countAdmins(conn);

    expect(result).toBe(0);
  });
});

describe("updateRole", () => {
  test("updates and returns user row", async () => {
    const updated = { id: "u1", role: "admin" };
    const updateConn = makeUpdateConn([updated]);
    const conn: any = { ...updateConn };

    const result = await updateRole(conn, "u1", "admin");

    expect(result).toEqual(updated);
    expect(updateConn.update).toHaveBeenCalledTimes(1);
    expect(updateConn.set).toHaveBeenCalledWith({ role: "admin" });
  });
});

describe("createAdminRepo", () => {
  test("returns object with all repo methods", () => {
    const repo = createAdminRepo();

    expect(repo).toHaveProperty("listUsers");
    expect(repo).toHaveProperty("countUsers");
    expect(repo).toHaveProperty("getById");
    expect(repo).toHaveProperty("countAdmins");
    expect(repo).toHaveProperty("updateRole");
    expect(repo).toHaveProperty("updateRoleWithExpected");
  });
});

describe("updateRoleWithExpected", () => {
  test("updates role with expected role condition", async () => {
    const updated = [{ id: "u1", role: "admin" }];
    const returning = mock(async () => updated);
    const where = mock(() => ({ returning }));
    const set = mock(() => ({ where }));
    const update = mock(() => ({ set }));
    const conn: any = { update };

    const result = await updateRoleWithExpected(conn, "u1", "admin", "student");

    expect(result).toEqual(updated);
    expect(update).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({ role: "admin" });
  });

  test("returns empty array when expected role does not match", async () => {
    const returning = mock(async () => []);
    const where = mock(() => ({ returning }));
    const set = mock(() => ({ where }));
    const update = mock(() => ({ set }));
    const conn: any = { update };

    const result = await updateRoleWithExpected(conn, "u1", "admin", "tutor");

    expect(result).toEqual([]);
  });
});
