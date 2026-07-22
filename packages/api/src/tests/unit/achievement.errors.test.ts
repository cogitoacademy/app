import { describe, it, expect } from "bun:test";
import { DomainError } from "../../lib/domain-errors";
import {
  AchievementNotFoundError,
  AchievementNotEditableError,
  mapAchievementError,
} from "../../modules/achievement/achievement.errors";

class TestDomainError extends DomainError {
  readonly domain = "test";
  constructor() {
    super("TEST_ERROR", "Test error");
  }
}

describe("achievement.errors", () => {
  describe("AchievementNotFoundError", () => {
    it("should be instance of DomainError", () => {
      const err = new AchievementNotFoundError("ach_123");
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(Error);
    });
    it("should have correct properties", () => {
      const err = new AchievementNotFoundError("ach_123");
      expect(err.code).toBe("ACHIEVEMENT_NOT_FOUND");
      expect(err.domain).toBe("achievement");
      expect(err.message).toBe("Achievement not found");
      expect(err.details).toEqual({ id: "ach_123" });
      expect(err.name).toBe("AchievementNotFoundError");
    });
  });
  describe("AchievementNotEditableError", () => {
    it("should be instance of DomainError", () => {
      const err = new AchievementNotEditableError("ach_456");
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(Error);
    });
    it("should have correct properties", () => {
      const err = new AchievementNotEditableError("ach_456");
      expect(err.code).toBe("ACHIEVEMENT_NOT_EDITABLE");
      expect(err.domain).toBe("achievement");
      expect(err.message).toBe("Achievement is not editable");
      expect(err.details).toEqual({ id: "ach_456" });
      expect(err.name).toBe("AchievementNotEditableError");
    });
  });
  describe("mapAchievementError", () => {
    it("should map AchievementNotFoundError to NOT_FOUND", () => {
      const err = new AchievementNotFoundError("ach_123");
      const result = mapAchievementError(err);
      expect(result.status).toBe(404);
    });
    it("should map AchievementNotEditableError to BAD_REQUEST", () => {
      const err = new AchievementNotEditableError("ach_456");
      const result = mapAchievementError(err);
      expect(result.status).toBe(400);
    });
    it("should fall back to INTERNAL_SERVER_ERROR for unknown domain error", () => {
      const err = new TestDomainError();
      const result = mapAchievementError(err);
      expect(result.status).toBe(500);
    });
  });
});
