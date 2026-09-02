import { describe, test, expect } from "bun:test";
import {
  achievementInput,
  studentAchievementInput,
  updateAchievementInput,
  adminUpdateAchievementInput,
  deleteAchievementInput,
  adminListInput,
  adminReviewInput,
} from "../../modules/achievement/achievement.types";

describe("Achievement Types (Zod schemas)", () => {
  test("achievementInput validates required fields", () => {
    const result = achievementInput.safeParse({
      eventName: "Olympiad",
      category: "competition",
      award: "Gold",
      level: "national",
    });
    expect(result.success).toBe(true);
  });

  test("achievementInput rejects a non-enum category (U10)", () => {
    const result = achievementInput.safeParse({
      eventName: "Olympiad",
      category: "academic",
      award: "Gold",
      level: "national",
    });
    expect(result.success).toBe(false);
  });

  test("achievementInput accepts issuer and visibility (U10)", () => {
    const result = achievementInput.safeParse({
      eventName: "Olympiad",
      category: "award",
      award: "Gold",
      level: "national",
      issuer: "Kemendikbud",
      visibility: false,
    });
    expect(result.success).toBe(true);
    expect(result.data!.issuer).toBe("Kemendikbud");
    expect(result.data!.visibility).toBe(false);
  });

  test("achievementInput allows only HTTP(S) external links", () => {
    const base = {
      eventName: "Olympiad",
      category: "competition" as const,
      award: "Gold",
      level: "national",
    };
    expect(
      achievementInput.safeParse({
        ...base,
        evidenceUrl: "https://example.com/evidence",
      }).success,
    ).toBe(true);
    expect(
      achievementInput.safeParse({
        ...base,
        evidenceUrl: "javascript:alert(1)",
      }).success,
    ).toBe(false);
    expect(
      achievementInput.safeParse({
        ...base,
        documentationUrl: "data:text/html,unsafe",
      }).success,
    ).toBe(false);
  });

  test("achievementInput rejects missing required fields", () => {
    const result = achievementInput.safeParse({ eventName: "" });
    expect(result.success).toBe(false);
  });

  test("studentAchievementInput strips public documentation images", () => {
    const result = studentAchievementInput.safeParse({
      eventName: "Olympiad",
      category: "competition",
      award: "Gold",
      level: "National",
      documentationUrl: "https://example.com/public-proof.jpg",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("documentationUrl");
    }
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

  test("updateAchievementInput does not forward public documentation images", () => {
    const result = updateAchievementInput.safeParse({
      id: "a1",
      version: 1,
      data: {
        description: "Corrected result",
        documentationUrl: "https://example.com/public-proof.jpg",
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.data).not.toHaveProperty("documentationUrl");
    }
  });

  test("adminUpdateAchievementInput accepts corrections and cleared optional fields", () => {
    const result = adminUpdateAchievementInput.safeParse({
      id: "a1",
      version: 3,
      data: {
        eventName: "Corrected Olympiad",
        location: "Jakarta, Indonesia",
        description: null,
        documentationUrl: null,
      },
    });
    expect(result.success).toBe(true);
  });

  test("adminUpdateAchievementInput validates awarding dates", () => {
    expect(
      adminUpdateAchievementInput.safeParse({
        id: "a1",
        version: 3,
        data: { awardingDate: "2024-01-01" },
      }).success,
    ).toBe(true);
    expect(
      adminUpdateAchievementInput.safeParse({
        id: "a1",
        version: 3,
        data: { awardingDate: "not-a-date" },
      }).success,
    ).toBe(false);
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
