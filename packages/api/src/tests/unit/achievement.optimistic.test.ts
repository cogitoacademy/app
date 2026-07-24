import { describe, test, expect, mock } from "bun:test";
import { createAchievementService } from "../../modules/achievement/achievement.service";
import { OptimisticLockError } from "../../modules/achievement/achievement.errors";
import { ACHIEVEMENT_STATUS } from "../../shared/constants";

function makeDb() {
  return {
    transaction: mock(async (fn: any) => fn({})),
  } as any;
}

function makeAuditPort() {
  return { record: mock(async () => {}) };
}

function makeRepo(overrides: Record<string, unknown> = {}) {
  return {
    listByUserId: mock(async () => []),
    insert: mock(async () => ({ id: "a1" })),
    findByIdForUser: mock(async () => ({
      id: "a1",
      userId: "u1",
      status: ACHIEVEMENT_STATUS.PENDING,
      version: 1,
    })),
    update: mock(async () => ({ id: "a1" })),
    updateWithVersion: mock(async () => [{ id: "a1", version: 2 }]),
    deleteRow: mock(async () => undefined),
    deleteWithVersion: mock(async () => [{ id: "a1" }]),
    adminList: mock(async () => []),
    getById: mock(async () => ({ id: "a1", status: "pending_review" })),
    updateStatus: mock(async () => ({ id: "a1" })),
    ...overrides,
  };
}

describe("Achievement optimistic locking (D2)", () => {
  test("update with stale version throws OptimisticLockError", async () => {
    const repo = makeRepo({
      updateWithVersion: mock(async () => []),
    });
    const service = createAchievementService({
      achievementRepo: repo as any,
      auditPort: makeAuditPort() as any,
      db: makeDb(),
    });

    await expect(
      service.update("u1", {
        id: "a1",
        version: 1,
        data: { eventName: "Updated" },
      }),
    ).rejects.toThrow(OptimisticLockError);
  });

  test("update with current version succeeds", async () => {
    const repo = makeRepo({
      updateWithVersion: mock(async () => [{ id: "a1", version: 2 }]),
    });
    const service = createAchievementService({
      achievementRepo: repo as any,
      auditPort: makeAuditPort() as any,
      db: makeDb(),
    });

    const result = await service.update("u1", {
      id: "a1",
      version: 1,
      data: { eventName: "Updated" },
    });

    expect(result.id).toBe("a1");
  });

  test("concurrent updates: one succeeds, one throws OptimisticLockError", async () => {
    let version = 1;
    const repo = makeRepo({
      updateWithVersion: mock(async (_conn, _id, _userId, expected) => {
        if (expected === version) {
          version++;
          return [{ id: "a1", version }];
        }
        return [];
      }),
    });
    const service = createAchievementService({
      achievementRepo: repo as any,
      auditPort: makeAuditPort() as any,
      db: makeDb(),
    });

    const input = {
      id: "a1",
      version: 1,
      data: { eventName: "Updated" },
    };

    const [r1, r2] = await Promise.allSettled([
      service.update("u1", input),
      service.update("u1", input),
    ]);

    const successes = [r1, r2].filter((r) => r.status === "fulfilled").length;
    const failures = [r1, r2].filter(
      (r) => r.status === "rejected" && r.reason instanceof OptimisticLockError,
    ).length;

    expect(successes).toBe(1);
    expect(failures).toBe(1);
  });

  test("delete with stale version throws OptimisticLockError", async () => {
    const repo = makeRepo({
      deleteWithVersion: mock(async () => []),
    });
    const service = createAchievementService({
      achievementRepo: repo as any,
      auditPort: makeAuditPort() as any,
      db: makeDb(),
    });

    await expect(service.remove("u1", "a1", 1)).rejects.toThrow(
      OptimisticLockError,
    );
  });
});
