import { describe, test, expect, mock } from "bun:test";
import {
  insertAuditLog,
  createAuditRepo,
} from "../../modules/audit/audit.repo";

function makeConn() {
  const values = mock(async () => {});
  const insert = mock(() => ({ values }));
  return { insert, values };
}

describe("insertAuditLog", () => {
  test("calls conn.insert with auditLog values", async () => {
    const conn = makeConn() as any;

    await insertAuditLog(conn, {
      actorId: "user1",
      actorType: "admin",
      action: "role.change",
      targetId: "user2",
      targetType: "user",
      beforeState: { role: "student" },
      afterState: { role: "tutor" },
      details: { note: "promoted" },
    });

    expect(conn.insert).toHaveBeenCalledTimes(1);
    expect(conn.values).toHaveBeenCalledTimes(1);
  });

  test("works with optional fields omitted", async () => {
    const conn = makeConn() as any;

    await insertAuditLog(conn, {
      actorId: null,
      actorType: "system",
      action: "cron.cleanup",
      targetType: "booking",
    });

    expect(conn.insert).toHaveBeenCalledTimes(1);
    expect(conn.values).toHaveBeenCalledTimes(1);
  });
});

describe("createAuditRepo", () => {
  test("returns object with insertAuditLog", () => {
    const repo = createAuditRepo();
    expect(repo).toHaveProperty("insertAuditLog");
    expect(typeof repo.insertAuditLog).toBe("function");
  });
});
