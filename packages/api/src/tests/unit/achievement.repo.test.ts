import { describe, test, expect, mock } from "bun:test";
import { createAchievementRepo } from "../../modules/achievement/achievement.repo";

function makeInsertConn(returned: any[] = [{}]) {
  const returning = mock(async () => returned);
  const values = mock(() => ({ returning }));
  const insert = mock(() => ({ values }));
  return { insert, values, returning };
}

function makeUpdateConn(returned: any[] = [{}]) {
  const returning = mock(async () => returned);
  const where = mock(() => ({ returning }));
  const set = mock(() => ({ where }));
  const update = mock(() => ({ set }));
  return { update, set, where, returning };
}

function makeDeleteConn() {
  const where = mock(async () => undefined);
  const del = mock(() => ({ where }));
  return { delete: del, where };
}

const repo = createAchievementRepo();

describe("listByUserId", () => {
  test("returns achievements for a user", async () => {
    const rows = [{ id: "a1", userId: "u1" }];
    const orderBy = mock(() => rows);
    const where = mock(() => ({ orderBy }));
    const from = mock(() => ({ where }));
    const select = mock(() => ({ from }));

    const result = await repo.listByUserId(
      { select, from, where, orderBy } as any,
      "u1",
    );

    expect(result).toEqual(rows);
    expect(select).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledTimes(1);
    expect(orderBy).toHaveBeenCalledTimes(1);
  });

  test("returns empty array when no achievements", async () => {
    const orderBy = mock(() => []);
    const where = mock(() => ({ orderBy }));
    const from = mock(() => ({ where }));
    const select = mock(() => ({ from }));

    const result = await repo.listByUserId(
      { select, from, where, orderBy } as any,
      "u1",
    );

    expect(result).toEqual([]);
  });
});

describe("insert", () => {
  test("inserts achievement and returns result", async () => {
    const returned = {
      id: "a1",
      userId: "u1",
      eventName: "Math Olympiad",
      category: "academic",
      award: "gold",
      level: "national",
    };
    const conn = { ...makeInsertConn([returned]) } as any;

    const result = await repo.insert(conn, {
      userId: "u1",
      eventName: "Math Olympiad",
      category: "academic",
      award: "gold",
      level: "national",
    });

    expect(result).toEqual(returned);
    expect(conn.insert).toHaveBeenCalledTimes(1);
    expect(conn.values).toHaveBeenCalledTimes(1);
    expect(conn.returning).toHaveBeenCalledTimes(1);
  });

  test("defaults optional fields to null or empty array", async () => {
    const conn = { ...makeInsertConn([{ id: "a2" }]) } as any;

    await repo.insert(conn, {
      userId: "u1",
      eventName: "Science Fair",
      category: "science",
      award: "silver",
      level: "regional",
    });

    expect(conn.values).toHaveBeenCalledWith(
      expect.objectContaining({
        eventDate: null,
        location: null,
        description: null,
        subjects: [],
        imageUrl: null,
      }),
    );
  });

  test("passes optional fields when provided", async () => {
    const conn = { ...makeInsertConn([{ id: "a3" }]) } as any;

    await repo.insert(conn, {
      userId: "u1",
      eventName: "Art Show",
      category: "art",
      award: "bronze",
      level: "local",
      eventDate: "2025-01-01",
      location: "Jakarta",
      description: "Nice work",
      subjects: ["math", "physics"],
      imageUrl: "https://img.png",
    });

    expect(conn.values).toHaveBeenCalledWith(
      expect.objectContaining({
        eventDate: "2025-01-01",
        location: "Jakarta",
        description: "Nice work",
        subjects: ["math", "physics"],
        imageUrl: "https://img.png",
      }),
    );
  });
});

describe("findByIdForUser", () => {
  test("returns achievement when found", async () => {
    const row = { id: "a1", userId: "u1" };
    const limit = mock(async () => [row]);
    const where = mock(() => ({ limit }));
    const from = mock(() => ({ where }));
    const select = mock(() => ({ from }));

    const result = await repo.findByIdForUser(
      { select, from, where, limit } as any,
      "a1",
      "u1",
    );

    expect(result).toEqual(row);
    expect(limit).toHaveBeenCalledTimes(1);
  });

  test("returns undefined when not found", async () => {
    const limit = mock(async () => []);
    const where = mock(() => ({ limit }));
    const from = mock(() => ({ where }));
    const select = mock(() => ({ from }));

    const result = await repo.findByIdForUser(
      { select, from, where, limit } as any,
      "missing",
      "u1",
    );

    expect(result).toBeUndefined();
  });
});

describe("update", () => {
  test("updates achievement and returns result", async () => {
    const updated = { id: "a1", userId: "u1", eventName: "Updated" };
    const conn = { ...makeUpdateConn([updated]) } as any;

    const result = await repo.update(conn, "a1", "u1", {
      eventName: "Updated",
    });

    expect(result).toEqual(updated);
    expect(conn.update).toHaveBeenCalledTimes(1);
    expect(conn.set).toHaveBeenCalledTimes(1);
    expect(conn.where).toHaveBeenCalledTimes(1);
    expect(conn.returning).toHaveBeenCalledTimes(1);
  });

  test("returns undefined when no row matched", async () => {
    const conn = { ...makeUpdateConn([]) } as any;

    const result = await repo.update(conn, "missing", "u1", {
      eventName: "Nope",
    });

    expect(result).toBeUndefined();
  });
});

describe("deleteRow", () => {
  test("deletes achievement by id and userId", async () => {
    const conn = makeDeleteConn() as any;

    await repo.deleteRow(conn, "a1", "u1");

    expect(conn.delete).toHaveBeenCalledTimes(1);
    expect(conn.where).toHaveBeenCalledTimes(1);
  });
});

function makeAdminListConn(rows: any[]) {
  const offset = mock(() => rows);
  const limit = mock(() => ({ offset }));
  const orderBy = mock(() => ({ limit }));
  const where = mock(() => ({ orderBy }));
  const from = mock(() => ({ where }));
  const select = mock(() => ({ from }));
  return { select, from, where, orderBy, limit, offset };
}

describe("adminList", () => {
  test("lists achievements with default limit and offset", async () => {
    const rows = [{ id: "a1" }, { id: "a2" }];
    const conn = makeAdminListConn(rows);

    const result = await repo.adminList(conn as any);

    expect(result).toEqual(rows);
    expect(conn.limit).toHaveBeenCalledWith(50);
    expect(conn.offset).toHaveBeenCalledWith(0);
  });

  test("applies status filter when provided", async () => {
    const rows = [{ id: "a1", status: "approved" }];
    const conn = makeAdminListConn(rows);

    const result = await repo.adminList(conn as any, { status: "approved" });

    expect(result).toEqual(rows);
    expect(conn.where).toHaveBeenCalledTimes(1);
  });

  test("uses custom limit and offset", async () => {
    const rows = [{ id: "a3" }];
    const conn = makeAdminListConn(rows);

    await repo.adminList(conn as any, { limit: 10, offset: 20 });

    expect(conn.limit).toHaveBeenCalledWith(10);
    expect(conn.offset).toHaveBeenCalledWith(20);
  });
});

describe("getById", () => {
  test("returns achievement when found", async () => {
    const row = { id: "a1" };
    const limit = mock(async () => [row]);
    const where = mock(() => ({ limit }));
    const from = mock(() => ({ where }));
    const select = mock(() => ({ from }));

    const result = await repo.getById(
      { select, from, where, limit } as any,
      "a1",
    );

    expect(result).toEqual(row);
  });

  test("returns undefined when not found", async () => {
    const limit = mock(async () => []);
    const where = mock(() => ({ limit }));
    const from = mock(() => ({ where }));
    const select = mock(() => ({ from }));

    const result = await repo.getById(
      { select, from, where, limit } as any,
      "missing",
    );

    expect(result).toBeUndefined();
  });
});

describe("updateStatus", () => {
  test("updates status and returns result", async () => {
    const updated = { id: "a1", status: "approved" };
    const conn = { ...makeUpdateConn([updated]) } as any;

    const result = await repo.updateStatus(conn, "a1", "approved");

    expect(result).toEqual(updated);
    expect(conn.update).toHaveBeenCalledTimes(1);
    expect(conn.set).toHaveBeenCalledTimes(1);
    expect(conn.where).toHaveBeenCalledTimes(1);
    expect(conn.returning).toHaveBeenCalledTimes(1);
  });

  test("passes adminNote when provided", async () => {
    const conn = { ...makeUpdateConn([{ id: "a1" }]) } as any;

    await repo.updateStatus(conn, "a1", "rejected", "Not eligible");

    expect(conn.set).toHaveBeenCalledWith({
      status: "rejected",
      adminNote: "Not eligible",
    });
  });

  test("defaults adminNote to null when not provided", async () => {
    const conn = { ...makeUpdateConn([{ id: "a1" }]) } as any;

    await repo.updateStatus(conn, "a1", "approved");

    expect(conn.set).toHaveBeenCalledWith({
      status: "approved",
      adminNote: null,
    });
  });

  test("returns undefined when no row matched", async () => {
    const conn = { ...makeUpdateConn([]) } as any;

    const result = await repo.updateStatus(conn, "missing", "approved");

    expect(result).toBeUndefined();
  });
});

describe("createAchievementRepo", () => {
  test("returns object with all repo methods", () => {
    const r = createAchievementRepo();

    expect(r).toHaveProperty("listByUserId");
    expect(r).toHaveProperty("insert");
    expect(r).toHaveProperty("findByIdForUser");
    expect(r).toHaveProperty("update");
    expect(r).toHaveProperty("deleteRow");
    expect(r).toHaveProperty("adminList");
    expect(r).toHaveProperty("getById");
    expect(r).toHaveProperty("updateStatus");
    expect(typeof r.listByUserId).toBe("function");
    expect(typeof r.insert).toBe("function");
    expect(typeof r.findByIdForUser).toBe("function");
    expect(typeof r.update).toBe("function");
    expect(typeof r.deleteRow).toBe("function");
    expect(typeof r.adminList).toBe("function");
    expect(typeof r.getById).toBe("function");
    expect(typeof r.updateStatus).toBe("function");
  });
});
