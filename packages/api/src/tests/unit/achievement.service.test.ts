import { describe, test, expect } from "bun:test";
import {
  validateUpdate,
  validateDelete,
} from "../../modules/achievement/achievement.service";

function makeAchievement(overrides: Partial<{ status: string }> = {}) {
  return { id: "a1", status: "pending", ...overrides } as any;
}

describe("Achievement Service", () => {
  describe("validateUpdate", () => {
    test("returns ok for pending achievement", () => {
      const result = validateUpdate(makeAchievement({ status: "pending" }));
      expect(result.ok).toBe(true);
    });

    test("returns error for undefined achievement", () => {
      const result = validateUpdate(undefined);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("BAD_REQUEST");
    });

    test("returns error for approved achievement", () => {
      const result = validateUpdate(makeAchievement({ status: "approved" }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("BAD_REQUEST");
    });

    test("returns error for rejected achievement", () => {
      const result = validateUpdate(makeAchievement({ status: "rejected" }));
      expect(result.ok).toBe(false);
    });
  });

  describe("validateDelete", () => {
    test("returns ok for pending achievement", () => {
      const result = validateDelete(makeAchievement({ status: "pending" }));
      expect(result.ok).toBe(true);
    });

    test("returns error for undefined achievement", () => {
      const result = validateDelete(undefined);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("BAD_REQUEST");
    });

    test("returns error for approved achievement", () => {
      const result = validateDelete(makeAchievement({ status: "approved" }));
      expect(result.ok).toBe(false);
    });
  });
});
