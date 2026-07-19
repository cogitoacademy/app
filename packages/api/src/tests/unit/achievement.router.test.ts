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
});
