import { describe, test, expect } from "bun:test";
import {
  validateRoleChange,
  type TargetUser,
} from "../../modules/admin/admin.service";

function makeTarget(overrides: Partial<TargetUser> = {}): TargetUser {
  return { id: "u1", role: "student", ...overrides };
}

describe("Admin Service", () => {
  describe("validateRoleChange", () => {
    test("returns ok for changing student to tutor", () => {
      const result = validateRoleChange(
        makeTarget({ role: "student" }),
        "tutor",
        2,
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.previousRole).toBe("student");
    });

    test("returns ok for changing tutor to student", () => {
      const result = validateRoleChange(
        makeTarget({ role: "tutor" }),
        "student",
        2,
      );
      expect(result.ok).toBe(true);
    });

    test("returns ok for changing admin to admin (no change)", () => {
      const result = validateRoleChange(
        makeTarget({ role: "admin" }),
        "admin",
        1,
      );
      expect(result.ok).toBe(true);
    });

    test("returns error for null target (user not found)", () => {
      const result = validateRoleChange(null, "tutor", 2);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
    });

    test("returns error when demoting last admin", () => {
      const result = validateRoleChange(
        makeTarget({ role: "admin" }),
        "student",
        1,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("CONFLICT");
    });

    test("returns ok when demoting admin with other admins present", () => {
      const result = validateRoleChange(
        makeTarget({ role: "admin" }),
        "student",
        3,
      );
      expect(result.ok).toBe(true);
    });
  });
});
