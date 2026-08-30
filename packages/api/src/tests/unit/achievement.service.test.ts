import { describe, test, expect, mock } from "bun:test";
import {
  validateUpdate,
  validateDelete,
  createAchievementService,
} from "../../modules/achievement/achievement.service";
import { AchievementNotEditableError } from "../../modules/achievement/achievement.errors";

function makeAchievement(overrides: Partial<{ status: string }> = {}) {
  return { id: "a1", status: "pending", ...overrides } as any;
}

function makeDb() {
  return {
    transaction: mock(async (fn: any) => fn({})),
  } as any;
}

describe("Achievement Service", () => {
  describe("validateUpdate", () => {
    test("does not throw for pending achievement", () => {
      expect(() =>
        validateUpdate(makeAchievement({ status: "pending" })),
      ).not.toThrow();
    });

    test("throws AchievementNotEditableError for undefined achievement", () => {
      expect(() => validateUpdate(undefined)).toThrow(
        AchievementNotEditableError,
      );
    });

    test("throws AchievementNotEditableError for approved achievement", () => {
      expect(() =>
        validateUpdate(makeAchievement({ status: "approved" })),
      ).toThrow(AchievementNotEditableError);
    });

    test("throws AchievementNotEditableError for rejected achievement", () => {
      expect(() =>
        validateUpdate(makeAchievement({ status: "rejected" })),
      ).toThrow(AchievementNotEditableError);
    });
  });

  describe("validateDelete", () => {
    test("does not throw for pending achievement", () => {
      expect(() =>
        validateDelete(makeAchievement({ status: "pending" })),
      ).not.toThrow();
    });

    test("throws AchievementNotEditableError for undefined achievement", () => {
      expect(() => validateDelete(undefined)).toThrow(
        AchievementNotEditableError,
      );
    });

    test("throws AchievementNotEditableError for approved achievement", () => {
      expect(() =>
        validateDelete(makeAchievement({ status: "approved" })),
      ).toThrow(AchievementNotEditableError);
    });
  });

  describe("adminReview", () => {
    test("escapes eventName in the notification body (R9)", async () => {
      const notificationPort = {
        writeBestEffort: mock(async () => {}),
      };
      const auditPort = { record: mock(async () => {}) };
      const achievementRepo = {
        getById: mock(async () => ({
          id: "a1",
          userId: "u1",
          eventName: '<script>alert("xss")</script>',
          status: "pending",
        })),
        updateStatus: mock(async () => ({ id: "a1" })),
      };
      const service = createAchievementService({
        achievementRepo: achievementRepo as any,
        auditPort: auditPort as any,
        notificationPort: notificationPort as any,
        db: makeDb() as any,
      });

      await service.adminReview("admin1", {
        achievementId: "a1",
        status: "approved",
      });

      expect(notificationPort.writeBestEffort).toHaveBeenCalledTimes(1);
      const body = notificationPort.writeBestEffort.mock.calls[0][0].body;
      expect(body).toContain("&lt;script&gt;");
      expect(body).not.toContain("<script>");
    });

    test("escapes adminNote in the rejection body (R9)", async () => {
      const notificationPort = {
        writeBestEffort: mock(async () => {}),
      };
      const auditPort = { record: mock(async () => {}) };
      const achievementRepo = {
        getById: mock(async () => ({
          id: "a1",
          userId: "u1",
          eventName: "Safe name",
          status: "pending",
        })),
        updateStatus: mock(async () => ({ id: "a1" })),
      };
      const service = createAchievementService({
        achievementRepo: achievementRepo as any,
        auditPort: auditPort as any,
        notificationPort: notificationPort as any,
        db: makeDb() as any,
      });

      await service.adminReview("admin1", {
        achievementId: "a1",
        status: "rejected",
        adminNote: "<img src=x onerror=alert(1)>",
      });

      const body = notificationPort.writeBestEffort.mock.calls[0][0].body;
      expect(body).toContain("&lt;img");
      expect(body).not.toContain("<img");
    });

    test("F12: archives an approved achievement and notifies the owner", async () => {
      const notificationPort = {
        writeBestEffort: mock(async () => {}),
      };
      const auditPort = { record: mock(async () => {}) };
      const achievementRepo = {
        getById: mock(async () => ({
          id: "a1",
          userId: "u1",
          eventName: "Regional Olympiad",
          status: "approved",
        })),
        updateStatus: mock(async () => ({ id: "a1", status: "archived" })),
      };
      const service = createAchievementService({
        achievementRepo: achievementRepo as any,
        auditPort: auditPort as any,
        notificationPort: notificationPort as any,
        db: makeDb() as any,
      });

      const result = await service.adminReview("admin1", {
        achievementId: "a1",
        status: "archived",
      });

      expect(result).toEqual({ id: "a1", status: "archived" });
      expect(achievementRepo.updateStatus).toHaveBeenCalledWith(
        expect.anything(),
        "a1",
        "archived",
        undefined,
        "approved",
        undefined,
      );
      const notif = notificationPort.writeBestEffort.mock.calls[0][0];
      expect(notif.title).toBe("Achievement archived");
      expect(notif.body).toContain("Regional Olympiad");
      expect(auditPort.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "achievement_archived",
          targetId: "a1",
        }),
      );
    });

    test("F12: restores an archived achievement back to approved", async () => {
      const notificationPort = {
        writeBestEffort: mock(async () => {}),
      };
      const auditPort = { record: mock(async () => {}) };
      const achievementRepo = {
        getById: mock(async () => ({
          id: "a1",
          userId: "u1",
          eventName: "Regional Olympiad",
          status: "archived",
        })),
        updateStatus: mock(async () => ({ id: "a1", status: "approved" })),
      };
      const service = createAchievementService({
        achievementRepo: achievementRepo as any,
        auditPort: auditPort as any,
        notificationPort: notificationPort as any,
        db: makeDb() as any,
      });

      const result = await service.adminReview("admin1", {
        achievementId: "a1",
        status: "approved",
      });

      expect(result).toEqual({ id: "a1", status: "approved" });
      expect(achievementRepo.updateStatus).toHaveBeenCalledWith(
        expect.anything(),
        "a1",
        "approved",
        undefined,
        "archived",
        undefined,
      );
      const notif = notificationPort.writeBestEffort.mock.calls[0][0];
      expect(notif.title).toBe("Achievement approved");
    });

    test("F12: rejects review transitions from unrelated states (e.g. rejected → archived is allowed, draft → archived is not)", async () => {
      const achievementRepo = {
        getById: mock(async () => ({
          id: "a1",
          userId: "u1",
          eventName: "Draft",
          status: "draft",
        })),
        updateStatus: mock(async () => ({ id: "a1", status: "archived" })),
      };
      const service = createAchievementService({
        achievementRepo: achievementRepo as any,
        auditPort: { record: mock(async () => {}) } as any,
        notificationPort: { writeBestEffort: mock(async () => {}) } as any,
        db: makeDb() as any,
      });

      await expect(
        service.adminReview("admin1", {
          achievementId: "a1",
          status: "archived",
        }),
      ).rejects.toThrow(AchievementNotEditableError);
    });
  });
});
