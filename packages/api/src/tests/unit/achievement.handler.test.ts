import { describe, test, expect, mock } from "bun:test";
import { createAchievementHandler } from "../../modules/achievement/achievement.handler";
import { createAchievementService } from "../../modules/achievement/achievement.service";
import {
  validateUpdate,
  validateDelete,
} from "../../modules/achievement/achievement.service";
import { ACHIEVEMENT_STATUS } from "../../shared/constants";

function makeDb() {
  return {
    transaction: mock(async (fn: any) => {
      return fn({
        ...makeDb(),
      });
    }),
  } as any;
}

function makeAchievementRepo(overrides: Record<string, unknown> = {}) {
  return {
    listByUserId: mock(async () => []),
    insert: mock(async () => ({ id: "a1", userId: "u1" })),
    findByIdForUser: mock(async () => ({
      id: "a1",
      userId: "u1",
      status: ACHIEVEMENT_STATUS.PENDING,
    })),
    update: mock(async () => ({ id: "a1", userId: "u1" })),
    deleteRow: mock(async () => undefined),
    adminList: mock(async () => []),
    getById: mock(async () => ({
      id: "a1",
      status: ACHIEVEMENT_STATUS.PENDING_REVIEW,
    })),
    updateStatus: mock(async () => ({
      id: "a1",
      status: "approved",
    })),
    ...overrides,
  };
}

function makeAuditPort() {
  return { record: mock(async () => {}) };
}

function makeContext(userId = "u1") {
  return { session: { user: { id: userId } } } as any;
}

describe("AchievementHandler", () => {
  describe("list", () => {
    test("delegates to achievementService.list", async () => {
      const repo = makeAchievementRepo({
        listByUserId: mock(async () => [{ id: "a1" }]),
      });
      const auditPort = makeAuditPort();
      const db = makeDb();
      const service = createAchievementService({
        achievementRepo: repo as any,
        auditPort: auditPort as any,
        db,
      });
      const handler = createAchievementHandler({ achievementService: service });

      const result = await handler.list({ context: makeContext() });

      expect(result).toEqual([{ id: "a1" }]);
    });
  });

  describe("create", () => {
    test("delegates to achievementService.create", async () => {
      const repo = makeAchievementRepo({
        insert: mock(async () => ({
          id: "a1",
          userId: "u1",
          eventName: "Test",
        })),
      });
      const service = createAchievementService({
        achievementRepo: repo as any,
        auditPort: makeAuditPort() as any,
        db: makeDb(),
      });
      const handler = createAchievementHandler({ achievementService: service });

      const input = {
        eventName: "Test",
        category: "cat",
        award: "1st",
        level: "regional",
      };
      const result = await handler.create({ context: makeContext(), input });

      expect(result.userId).toBe("u1");
    });
  });

  describe("update", () => {
    test("delegates to achievementService.update", async () => {
      const repo = makeAchievementRepo();
      const service = createAchievementService({
        achievementRepo: repo as any,
        auditPort: makeAuditPort() as any,
        db: makeDb(),
      });
      const handler = createAchievementHandler({ achievementService: service });

      const result = await handler.update({
        context: makeContext(),
        input: { id: "a1", data: { eventName: "Updated" } },
      });

      expect(result.id).toBe("a1");
    });
  });

  describe("remove", () => {
    test("delegates to achievementService.remove", async () => {
      const repo = makeAchievementRepo();
      const service = createAchievementService({
        achievementRepo: repo as any,
        auditPort: makeAuditPort() as any,
        db: makeDb(),
      });
      const handler = createAchievementHandler({ achievementService: service });

      await handler.remove({
        context: makeContext(),
        input: { id: "a1" },
      });

      expect(repo.deleteRow).toHaveBeenCalled();
    });
  });

  describe("adminList", () => {
    test("delegates to achievementService.adminList", async () => {
      const repo = makeAchievementRepo({
        adminList: mock(async () => [{ id: "a1" }]),
      });
      const service = createAchievementService({
        achievementRepo: repo as any,
        auditPort: makeAuditPort() as any,
        db: makeDb(),
      });
      const handler = createAchievementHandler({ achievementService: service });

      const result = await handler.adminList({
        context: makeContext(),
        input: {},
      });

      expect(result).toEqual([{ id: "a1" }]);
    });
  });

  describe("adminReview", () => {
    test("delegates to achievementService.adminReview", async () => {
      const repo = makeAchievementRepo();
      const auditPort = makeAuditPort();
      const service = createAchievementService({
        achievementRepo: repo as any,
        auditPort: auditPort as any,
        db: makeDb(),
      });
      const handler = createAchievementHandler({ achievementService: service });

      const result = await handler.adminReview({
        context: makeContext("admin1"),
        input: {
          achievementId: "a1",
          status: "approved",
        },
      });

      expect(result.id).toBe("a1");
    });
  });
});

describe("AchievementService", () => {
  describe("list", () => {
    test("delegates to achievementRepo.listByUserId", async () => {
      const repo = makeAchievementRepo({
        listByUserId: mock(async () => [{ id: "a1" }]),
      });
      const service = createAchievementService({
        achievementRepo: repo as any,
        auditPort: makeAuditPort() as any,
        db: makeDb(),
      });

      const result = await service.list("u1");

      expect(repo.listByUserId).toHaveBeenCalledWith(expect.anything(), "u1");
      expect(result).toEqual([{ id: "a1" }]);
    });
  });

  describe("create", () => {
    test("passes input with userId to repo.insert", async () => {
      const repo = makeAchievementRepo({
        insert: mock(async (params: any) => ({ id: "a1", ...params })),
      });
      const service = createAchievementService({
        achievementRepo: repo as any,
        auditPort: makeAuditPort() as any,
        db: makeDb(),
      });

      const input = {
        eventName: "Test",
        category: "cat",
        award: "1st",
        level: "regional",
      };
      await service.create("u1", input);

      expect(repo.insert).toHaveBeenCalledWith(expect.anything(), {
        ...input,
        userId: "u1",
      });
    });
  });

  describe("update", () => {
    test("updates when existing achievement is pending", async () => {
      const repo = makeAchievementRepo({
        findByIdForUser: mock(async () => ({
          id: "a1",
          userId: "u1",
          status: ACHIEVEMENT_STATUS.PENDING,
        })),
        update: mock(async () => ({ id: "a1", eventName: "Updated" })),
      });
      const service = createAchievementService({
        achievementRepo: repo as any,
        auditPort: makeAuditPort() as any,
        db: makeDb(),
      });

      const result = await service.update("u1", {
        id: "a1",
        data: { eventName: "Updated" },
      });

      expect(repo.update).toHaveBeenCalledWith(expect.anything(), "a1", "u1", {
        eventName: "Updated",
      });
      expect(result.id).toBe("a1");
    });

    test("throws when achievement not found", async () => {
      const repo = makeAchievementRepo({
        findByIdForUser: mock(async () => undefined),
      });
      const service = createAchievementService({
        achievementRepo: repo as any,
        auditPort: makeAuditPort() as any,
        db: makeDb(),
      });

      try {
        await service.update("u1", { id: "a1", data: { eventName: "X" } });
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.code).toBe("BAD_REQUEST");
      }
    });

    test("throws when achievement status is not pending", async () => {
      const repo = makeAchievementRepo({
        findByIdForUser: mock(async () => ({
          id: "a1",
          userId: "u1",
          status: ACHIEVEMENT_STATUS.APPROVED,
        })),
      });
      const service = createAchievementService({
        achievementRepo: repo as any,
        auditPort: makeAuditPort() as any,
        db: makeDb(),
      });

      try {
        await service.update("u1", { id: "a1", data: { eventName: "X" } });
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.code).toBe("BAD_REQUEST");
      }
    });
  });

  describe("remove", () => {
    test("deletes when existing achievement is pending", async () => {
      const repo = makeAchievementRepo({
        findByIdForUser: mock(async () => ({
          id: "a1",
          userId: "u1",
          status: ACHIEVEMENT_STATUS.PENDING,
        })),
        deleteRow: mock(async () => undefined),
      });
      const service = createAchievementService({
        achievementRepo: repo as any,
        auditPort: makeAuditPort() as any,
        db: makeDb(),
      });

      await service.remove("u1", "a1");

      expect(repo.deleteRow).toHaveBeenCalledWith(
        expect.anything(),
        "a1",
        "u1",
      );
    });

    test("throws when achievement not found", async () => {
      const repo = makeAchievementRepo({
        findByIdForUser: mock(async () => undefined),
      });
      const service = createAchievementService({
        achievementRepo: repo as any,
        auditPort: makeAuditPort() as any,
        db: makeDb(),
      });

      try {
        await service.remove("u1", "a1");
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.code).toBe("BAD_REQUEST");
      }
    });

    test("throws when achievement status is not pending", async () => {
      const repo = makeAchievementRepo({
        findByIdForUser: mock(async () => ({
          id: "a1",
          userId: "u1",
          status: ACHIEVEMENT_STATUS.REJECTED,
        })),
      });
      const service = createAchievementService({
        achievementRepo: repo as any,
        auditPort: makeAuditPort() as any,
        db: makeDb(),
      });

      try {
        await service.remove("u1", "a1");
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.code).toBe("BAD_REQUEST");
      }
    });
  });

  describe("adminList", () => {
    test("delegates to repo with input", async () => {
      const repo = makeAchievementRepo({
        adminList: mock(async () => [{ id: "a1" }]),
      });
      const service = createAchievementService({
        achievementRepo: repo as any,
        auditPort: makeAuditPort() as any,
        db: makeDb(),
      });

      const input = { status: "pending_review", limit: 10 };
      await service.adminList(input);

      expect(repo.adminList).toHaveBeenCalledWith(expect.anything(), input);
    });

    test("uses default empty object when no input", async () => {
      const repo = makeAchievementRepo({
        adminList: mock(async () => []),
      });
      const service = createAchievementService({
        achievementRepo: repo as any,
        auditPort: makeAuditPort() as any,
        db: makeDb(),
      });

      await service.adminList();

      expect(repo.adminList).toHaveBeenCalledWith(expect.anything(), {});
    });
  });

  describe("adminReview", () => {
    test("throws notFound when achievement does not exist", async () => {
      const repo = makeAchievementRepo({
        getById: mock(async () => undefined),
      });
      const service = createAchievementService({
        achievementRepo: repo as any,
        auditPort: makeAuditPort() as any,
        db: makeDb(),
      });

      try {
        await service.adminReview("admin1", {
          achievementId: "nonexistent",
          status: "approved",
        });
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.code).toBe("NOT_FOUND");
      }
    });

    test("updates status and records audit in transaction", async () => {
      const existing = { id: "a1", status: ACHIEVEMENT_STATUS.PENDING_REVIEW };
      const updated = { id: "a1", status: "approved" };
      const repo = makeAchievementRepo({
        getById: mock(async () => existing),
        updateStatus: mock(async () => updated),
      });
      const auditPort = makeAuditPort();
      const service = createAchievementService({
        achievementRepo: repo as any,
        auditPort: auditPort as any,
        db: makeDb(),
      });

      const result = await service.adminReview("admin1", {
        achievementId: "a1",
        status: "approved",
        adminNote: "Looks good",
      });

      expect(result.id).toBe("a1");
      expect(repo.updateStatus).toHaveBeenCalled();
      expect(auditPort.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "achievement_approved",
          targetId: "a1",
        }),
      );
    });

    test("records audit with rejection action", async () => {
      const existing = { id: "a1", status: ACHIEVEMENT_STATUS.PENDING_REVIEW };
      const updated = { id: "a1", status: "rejected" };
      const repo = makeAchievementRepo({
        getById: mock(async () => existing),
        updateStatus: mock(async () => updated),
      });
      const auditPort = makeAuditPort();
      const service = createAchievementService({
        achievementRepo: repo as any,
        auditPort: auditPort as any,
        db: makeDb(),
      });

      await service.adminReview("admin1", {
        achievementId: "a1",
        status: "rejected",
      });

      expect(auditPort.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "achievement_rejected",
        }),
      );
    });
  });
});

describe("AchievementService validation", () => {
  describe("validateUpdate", () => {
    test("returns ok for pending achievement", () => {
      const result = validateUpdate({
        id: "a1",
        userId: "u1",
        status: ACHIEVEMENT_STATUS.PENDING,
      } as any);
      expect(result.ok).toBe(true);
    });

    test("returns error when achievement is undefined", () => {
      const result = validateUpdate(undefined);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("BAD_REQUEST");
    });

    test("returns error for approved achievement", () => {
      const result = validateUpdate({
        id: "a1",
        status: ACHIEVEMENT_STATUS.APPROVED,
      } as any);
      expect(result.ok).toBe(false);
    });

    test("returns error for rejected achievement", () => {
      const result = validateUpdate({
        id: "a1",
        status: ACHIEVEMENT_STATUS.REJECTED,
      } as any);
      expect(result.ok).toBe(false);
    });
  });

  describe("validateDelete", () => {
    test("returns ok for pending achievement", () => {
      const result = validateDelete({
        id: "a1",
        userId: "u1",
        status: ACHIEVEMENT_STATUS.PENDING,
      } as any);
      expect(result.ok).toBe(true);
    });

    test("returns error when achievement is undefined", () => {
      const result = validateDelete(undefined);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("BAD_REQUEST");
    });

    test("returns error for draft achievement", () => {
      const result = validateDelete({
        id: "a1",
        status: ACHIEVEMENT_STATUS.DRAFT,
      } as any);
      expect(result.ok).toBe(false);
    });

    test("returns error for archived achievement", () => {
      const result = validateDelete({
        id: "a1",
        status: ACHIEVEMENT_STATUS.ARCHIVED,
      } as any);
      expect(result.ok).toBe(false);
    });
  });
});
