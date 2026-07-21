import { describe, test, expect, mock } from "bun:test";
import { createAuditService } from "../../modules/audit/audit.service";

describe("createAuditService", () => {
  test("record delegates to repo.insertAuditLog", async () => {
    const mockInsertAuditLog = mock(async () => {});
    const repo = { insertAuditLog: mockInsertAuditLog };

    const service = createAuditService(repo as any);

    const params = {
      db: {},
      actorId: "admin1",
      actorType: "admin",
      action: "user.promote",
      targetId: "user2",
      targetType: "user",
      beforeState: { role: "student" },
      afterState: { role: "tutor" },
      details: { reason: "merit" },
    };

    await service.record(params);

    expect(mockInsertAuditLog).toHaveBeenCalledTimes(1);
    expect(mockInsertAuditLog).toHaveBeenCalledWith(
      {},
      {
        actorId: "admin1",
        actorType: "admin",
        action: "user.promote",
        targetId: "user2",
        targetType: "user",
        beforeState: { role: "student" },
        afterState: { role: "tutor" },
        details: { reason: "merit" },
      },
    );
  });

  test("record works with minimal params", async () => {
    const mockInsertAuditLog = mock(async () => {});
    const repo = { insertAuditLog: mockInsertAuditLog };

    const service = createAuditService(repo as any);

    await service.record({
      db: {},
      actorId: null,
      actorType: "system",
      action: "booking.expire",
      targetId: undefined,
      targetType: "booking",
    });

    expect(mockInsertAuditLog).toHaveBeenCalledWith(
      {},
      {
        actorId: null,
        actorType: "system",
        action: "booking.expire",
        targetId: undefined,
        targetType: "booking",
        beforeState: undefined,
        afterState: undefined,
        details: undefined,
      },
    );
  });
});
