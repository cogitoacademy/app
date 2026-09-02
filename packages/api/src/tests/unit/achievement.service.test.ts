import { describe, test, expect, mock } from "bun:test";
import {
  validateUpdate,
  validateAdminUpdate,
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

  describe("validateAdminUpdate", () => {
    test("allows pending and pending_review achievements", () => {
      expect(() =>
        validateAdminUpdate(makeAchievement({ status: "pending" })),
      ).not.toThrow();
      expect(() =>
        validateAdminUpdate(makeAchievement({ status: "pending_review" })),
      ).not.toThrow();
    });

    test("rejects approved, rejected, and missing achievements", () => {
      expect(() =>
        validateAdminUpdate(makeAchievement({ status: "approved" })),
      ).toThrow(AchievementNotEditableError);
      expect(() =>
        validateAdminUpdate(makeAchievement({ status: "rejected" })),
      ).toThrow(AchievementNotEditableError);
      expect(() => validateAdminUpdate(undefined)).toThrow(
        AchievementNotEditableError,
      );
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

  describe("adminUpdate", () => {
    test("updates pending content and records before/after audit state", async () => {
      const auditPort = {
        record: mock(async () => {}),
      };
      const repo = {
        getById: mock(async () => ({
          id: "a1",
          userId: "u1",
          eventName: "Old name",
          category: "competition",
          award: "Gold",
          level: "National",
          status: "pending",
          version: 4,
        })),
        updateByIdWithVersion: mock(async () => [
          {
            id: "a1",
            userId: "u1",
            eventName: "Corrected name",
            category: "competition",
            award: "Gold",
            level: "International",
            location: "Geneva, Switzerland",
            description:
              "Ranked 1st among 1,000 participants across 20 countries.",
            status: "pending",
            version: 5,
          },
        ]),
      };
      const service = createAchievementService({
        achievementRepo: repo as any,
        auditPort: auditPort as any,
        notificationPort: { writeBestEffort: mock(async () => {}) } as any,
        db: makeDb(),
      });

      const result = await service.adminUpdate("admin1", {
        id: "a1",
        version: 4,
        data: {
          eventName: "Corrected name",
          level: "International",
          location: "Geneva, Switzerland",
          description:
            "Ranked 1st among 1,000 participants across 20 countries.",
        },
      });

      expect(result.version).toBe(5);
      expect(repo.updateByIdWithVersion).toHaveBeenCalledWith(
        expect.anything(),
        "a1",
        4,
        {
          eventName: "Corrected name",
          level: "International",
          location: "Geneva, Switzerland",
          description:
            "Ranked 1st among 1,000 participants across 20 countries.",
        },
      );
      expect(auditPort.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: "admin1",
          action: "achievement_admin_updated",
          targetId: "a1",
          targetType: "achievement",
          beforeState: expect.objectContaining({ eventName: "Old name" }),
          afterState: expect.objectContaining({
            eventName: "Corrected name",
            level: "International",
          }),
          details: { previousStatus: "pending" },
        }),
      );
    });

    test("throws on a stale admin correction", async () => {
      const repo = {
        getById: mock(async () => ({
          id: "a1",
          userId: "u1",
          status: "pending",
          version: 4,
        })),
        updateByIdWithVersion: mock(async () => []),
      };
      const service = createAchievementService({
        achievementRepo: repo as any,
        auditPort: { record: mock(async () => {}) } as any,
        notificationPort: { writeBestEffort: mock(async () => {}) } as any,
        db: makeDb(),
      });

      await expect(
        service.adminUpdate("admin1", {
          id: "a1",
          version: 4,
          data: { eventName: "Stale correction" },
        }),
      ).rejects.toThrow(/modified by another transaction/i);
    });
  });
});
