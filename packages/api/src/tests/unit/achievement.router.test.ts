import { describe, test, expect, mock } from "bun:test";

const { createAchievementRouter } =
  await import("../../modules/achievement/achievement.router");
import {
  achievementInput,
  updateAchievementInput,
  deleteAchievementInput,
  adminListInput,
  adminReviewInput,
} from "../../modules/achievement/achievement.types";
import { createAchievementHandler } from "../../modules/achievement/achievement.handler";

describe("achievementRouter", () => {
  test("exports expected route keys", () => {
    const handler = createAchievementHandler({
      achievementService: {
        list: mock(async () => []),
        create: mock(async () => ({})),
        update: mock(async () => ({})),
        remove: mock(async () => {}),
        adminList: mock(async () => []),
        adminReview: mock(async () => ({})),
      } as any,
    });
    const router = createAchievementRouter(handler);
    expect(Object.keys(router).toSorted()).toEqual([
      "adminList",
      "adminReview",
      "create",
      "delete",
      "list",
      "listApproved",
      "update",
    ]);
  });

  describe("input validation", () => {
    test("achievementInput accepts valid required fields", () => {
      const result = achievementInput.safeParse({
        eventName: "Olympiad",
        category: "other",
        award: "Gold",
        level: "national",
      });
      expect(result.success).toBe(true);
    });

    test("achievementInput rejects missing required fields", () => {
      const result = achievementInput.safeParse({ eventName: "" });
      expect(result.success).toBe(false);
    });

    test("achievementInput accepts optional fields", () => {
      const result = achievementInput.safeParse({
        eventName: "Olympiad",
        category: "other",
        award: "Gold",
        level: "national",
        awardingDate: "2024-01-01",
        location: "Jakarta",
        description: "Desc",
        subjects: ["math"],
        evidenceUrl: "https://img.jpg",
      });
      expect(result.success).toBe(true);
    });

    test("updateAchievementInput accepts partial data", () => {
      const result = updateAchievementInput.safeParse({
        id: "a1",
        version: 1,
        data: { eventName: "Updated" },
      });
      expect(result.success).toBe(true);
    });

    test("deleteAchievementInput requires id and version", () => {
      expect(
        deleteAchievementInput.safeParse({ id: "a1", version: 1 }).success,
      ).toBe(true);
      expect(deleteAchievementInput.safeParse({ id: "a1" }).success).toBe(
        false,
      );
      expect(deleteAchievementInput.safeParse({}).success).toBe(false);
    });

    test("adminListInput accepts undefined", () => {
      const result = adminListInput.safeParse(undefined);
      expect(result.success).toBe(true);
    });

    test("adminListInput applies defaults", () => {
      const result = adminListInput.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(50);
        expect(result.data.offset).toBe(0);
      }
    });

    test("adminReviewInput accepts valid status enum", () => {
      expect(
        adminReviewInput.safeParse({ achievementId: "a1", status: "approved" })
          .success,
      ).toBe(true);
      expect(
        adminReviewInput.safeParse({ achievementId: "a1", status: "rejected" })
          .success,
      ).toBe(true);
    });

    test("adminReviewInput rejects invalid status", () => {
      expect(
        adminReviewInput.safeParse({ achievementId: "a1", status: "invalid" })
          .success,
      ).toBe(false);
    });
  });
});

describe("achievementHandler", () => {
  describe("list", () => {
    test("calls achievementService.list with userId", async () => {
      const list = mock(async () => [{ id: "a1" }]);
      const handler = createAchievementHandler({
        achievementService: { list } as any,
      });
      const context = {
        session: { user: { id: "u1" } },
      } as any;

      const result = await handler.list({ context });

      expect(list).toHaveBeenCalledWith("u1");
      expect(result).toEqual([{ id: "a1" }]);
    });
  });

  describe("create", () => {
    test("calls achievementService.create with userId and input", async () => {
      const create = mock(async () => ({ id: "a1" }));
      const handler = createAchievementHandler({
        achievementService: { create } as any,
      });
      const context = {
        session: { user: { id: "u1" } },
      } as any;
      const input = {
        eventName: "Olympiad",
        category: "other",
        award: "Gold",
        level: "national",
      };

      const result = await handler.create({ context, input });

      expect(create).toHaveBeenCalledWith("u1", input);
      expect(result).toEqual({ id: "a1" });
    });
  });

  describe("update", () => {
    test("calls achievementService.update with userId and input", async () => {
      const update = mock(async () => ({ id: "a1" }));
      const handler = createAchievementHandler({
        achievementService: { update } as any,
      });
      const context = {
        session: { user: { id: "u1" } },
      } as any;
      const input = { id: "a1", version: 1, data: { eventName: "Updated" } };

      const result = await handler.update({ context, input });

      expect(update).toHaveBeenCalledWith("u1", input);
      expect(result).toEqual({ id: "a1" });
    });
  });

  describe("remove", () => {
    test("calls achievementService.remove with userId, input.id and version", async () => {
      const remove = mock(async () => undefined);
      const handler = createAchievementHandler({
        achievementService: { remove } as any,
      });
      const context = {
        session: { user: { id: "u1" } },
      } as any;
      const input = { id: "a1", version: 1 };

      await handler.remove({ context, input });

      expect(remove).toHaveBeenCalledWith("u1", "a1", 1);
    });
  });

  describe("adminList", () => {
    test("calls achievementService.adminList with input", async () => {
      const adminList = mock(async () => [{ id: "a1" }]);
      const handler = createAchievementHandler({
        achievementService: { adminList } as any,
      });
      const context = {
        session: { user: { id: "admin1" } },
      } as any;
      const input = { status: "pending_review", limit: 10 };

      const result = await handler.adminList({ context, input });

      expect(adminList).toHaveBeenCalledWith(input);
      expect(result).toEqual([{ id: "a1" }]);
    });

    test("calls achievementService.adminList with undefined when input is undefined", async () => {
      const adminList = mock(async () => []);
      const handler = createAchievementHandler({
        achievementService: { adminList } as any,
      });
      const context = {
        session: { user: { id: "admin1" } },
      } as any;

      await handler.adminList({ context, input: undefined as any });

      expect(adminList).toHaveBeenCalledWith(undefined);
    });
  });

  describe("adminReview", () => {
    test("calls achievementService.adminReview with userId and input", async () => {
      const adminReview = mock(async () => ({ id: "a1", status: "approved" }));
      const handler = createAchievementHandler({
        achievementService: { adminReview } as any,
      });
      const context = {
        session: { user: { id: "admin1" } },
      } as any;
      const input = { achievementId: "a1", status: "approved" as const };

      const result = await handler.adminReview({ context, input });

      expect(adminReview).toHaveBeenCalledWith("admin1", input);
      expect(result).toEqual({ id: "a1", status: "approved" });
    });
  });
});
