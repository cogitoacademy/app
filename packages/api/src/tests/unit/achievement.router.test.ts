import { describe, test, expect, mock } from "bun:test";

mock.module("../../procedures", () => {
  const mockProc = {
    route: () => mockProc,
    input: () => mockProc,
    handler: (fn: any) => fn,
  };
  return {
    protectedProcedure: mockProc,
    adminProcedure: mockProc,
  };
});

const { achievementRouter } =
  await import("../../modules/achievement/achievement.router");
import {
  achievementInput,
  updateAchievementInput,
  deleteAchievementInput,
  adminListInput,
  adminReviewInput,
} from "../../modules/achievement/achievement.types";

describe("achievementRouter", () => {
  test("exports expected route keys", () => {
    expect(Object.keys(achievementRouter).toSorted()).toEqual([
      "adminList",
      "adminReview",
      "create",
      "delete",
      "list",
      "update",
    ]);
  });

  describe("input validation", () => {
    test("achievementInput accepts valid required fields", () => {
      const result = achievementInput.safeParse({
        eventName: "Olympiad",
        category: "academic",
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
        category: "academic",
        award: "Gold",
        level: "national",
        eventDate: "2024-01-01",
        location: "Jakarta",
        description: "Desc",
        subjects: ["math"],
        imageUrl: "https://img.jpg",
      });
      expect(result.success).toBe(true);
    });

    test("updateAchievementInput accepts partial data", () => {
      const result = updateAchievementInput.safeParse({
        id: "a1",
        data: { eventName: "Updated" },
      });
      expect(result.success).toBe(true);
    });

    test("deleteAchievementInput requires id", () => {
      expect(deleteAchievementInput.safeParse({ id: "a1" }).success).toBe(true);
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

  describe("list handler", () => {
    test("calls achievement.list with userId", async () => {
      const list = mock(async () => [{ id: "a1" }]);
      const context = {
        session: { user: { id: "u1" } },
        services: { achievement: { list } },
      };

      const result = await achievementRouter.list({ context });

      expect(list).toHaveBeenCalledWith("u1");
      expect(result).toEqual([{ id: "a1" }]);
    });
  });

  describe("create handler", () => {
    test("calls achievement.create with userId and input", async () => {
      const create = mock(async () => ({ id: "a1" }));
      const context = {
        session: { user: { id: "u1" } },
        services: { achievement: { create } },
      };
      const input = {
        eventName: "Olympiad",
        category: "academic",
        award: "Gold",
        level: "national",
      };

      const result = await achievementRouter.create({ context, input });

      expect(create).toHaveBeenCalledWith("u1", input);
      expect(result).toEqual({ id: "a1" });
    });
  });

  describe("update handler", () => {
    test("calls achievement.update with userId and input", async () => {
      const update = mock(async () => ({ id: "a1", updated: true }));
      const context = {
        session: { user: { id: "u1" } },
        services: { achievement: { update } },
      };
      const input = { id: "a1", data: { eventName: "Updated" } };

      const result = await achievementRouter.update({ context, input });

      expect(update).toHaveBeenCalledWith("u1", input);
      expect(result).toEqual({ id: "a1", updated: true });
    });
  });

  describe("delete handler", () => {
    test("calls achievement.remove with userId and input.id", async () => {
      const remove = mock(async () => ({ success: true }));
      const context = {
        session: { user: { id: "u1" } },
        services: { achievement: { remove } },
      };
      const input = { id: "a1" };

      const result = await achievementRouter.delete({ context, input });

      expect(remove).toHaveBeenCalledWith("u1", "a1");
      expect(result).toEqual({ success: true });
    });
  });

  describe("adminList handler", () => {
    test("calls achievement.adminList with input", async () => {
      const adminList = mock(async () => ({ items: [], nextCursor: null }));
      const context = {
        session: { user: { id: "admin1" } },
        services: { achievement: { adminList } },
      };
      const input = { status: "pending", limit: 50, offset: 0 };

      const result = await achievementRouter.adminList({ context, input });

      expect(adminList).toHaveBeenCalledWith(input);
      expect(result).toEqual({ items: [], nextCursor: null });
    });

    test("calls achievement.adminList with empty object when input is undefined", async () => {
      const adminList = mock(async () => ({ items: [], nextCursor: null }));
      const context = {
        session: { user: { id: "admin1" } },
        services: { achievement: { adminList } },
      };

      await achievementRouter.adminList({
        context,
        input: undefined,
      });

      expect(adminList).toHaveBeenCalledWith({});
    });
  });

  describe("adminReview handler", () => {
    test("calls achievement.adminReview with userId and input", async () => {
      const adminReview = mock(async () => ({ id: "a1", status: "approved" }));
      const context = {
        session: { user: { id: "admin1" } },
        services: { achievement: { adminReview } },
      };
      const input = { achievementId: "a1", status: "approved" as const };

      const result = await achievementRouter.adminReview({ context, input });

      expect(adminReview).toHaveBeenCalledWith("admin1", input);
      expect(result).toEqual({ id: "a1", status: "approved" });
    });

    test("calls achievement.adminReview with optional adminNote", async () => {
      const adminReview = mock(async () => ({ id: "a1", status: "rejected" }));
      const context = {
        session: { user: { id: "admin1" } },
        services: { achievement: { adminReview } },
      };
      const input = {
        achievementId: "a1",
        status: "rejected" as const,
        adminNote: "Insufficient evidence",
      };

      await achievementRouter.adminReview({ context, input });

      expect(adminReview).toHaveBeenCalledWith("admin1", input);
    });
  });
});
