import { describe, test, expect } from "bun:test";
import {
  validateUpdate,
  validateDelete,
} from "../../modules/achievement/achievement.service";
import { AchievementNotEditableError } from "../../modules/achievement/achievement.errors";

function makeAchievement(overrides: Partial<{ status: string }> = {}) {
  return { id: "a1", status: "pending", ...overrides } as any;
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
});
