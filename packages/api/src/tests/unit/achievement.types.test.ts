import { describe, test, expect } from "bun:test";
import {
  achievementInput,
  updateAchievementInput,
  deleteAchievementInput,
  adminListInput,
  adminReviewInput,
} from "../../modules/achievement/achievement.types";

describe("Achievement Types (Zod schemas)", () => {
  test("achievementInput validates required fields", () => {
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

  test("updateAchievementInput accepts partial data", () => {
    const result = updateAchievementInput.safeParse({
      id: "a1",
      version: 1,
      data: { eventName: "Updated" },
    });
    expect(result.success).toBe(true);
  });

  test("updateAchievementInput requires version", () => {
    expect(
      updateAchievementInput.safeParse({
        id: "a1",
        data: { eventName: "Updated" },
      }).success,
    ).toBe(false);
    const withVersion = updateAchievementInput.safeParse({
      id: "a1",
      version: 2,
      data: { eventName: "Updated" },
    });
    expect(withVersion.success).toBe(true);
  });

  test("deleteAchievementInput requires id and version", () => {
    expect(
      deleteAchievementInput.safeParse({ id: "a1", version: 1 }).success,
    ).toBe(true);
    expect(deleteAchievementInput.safeParse({ id: "a1" }).success).toBe(false);
    expect(deleteAchievementInput.safeParse({}).success).toBe(false);
  });

  test("adminListInput defaults limit and offset", () => {
    const result = adminListInput.safeParse(undefined);
    expect(result.success).toBe(true);
  });

  test("adminReviewInput validates status enum", () => {
    expect(
      adminReviewInput.safeParse({
        achievementId: "a1",
        status: "approved",
      }).success,
    ).toBe(true);
    expect(
      adminReviewInput.safeParse({
        achievementId: "a1",
        status: "invalid",
      }).success,
    ).toBe(false);
  });
});
