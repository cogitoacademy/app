import { describe, test, expect } from "bun:test";
import {
  validateRoleChange,
  type TargetUser,
} from "../../modules/admin/admin.service";
import {
  UserNotFoundError,
  LastAdminError,
} from "../../modules/admin/admin.errors";

function makeTarget(overrides: Partial<TargetUser> = {}): TargetUser {
  return { id: "u1", role: "student", ...overrides };
}

describe("Admin Service", () => {
  describe("validateRoleChange", () => {
    test("returns previousRole for changing student to tutor", () => {
      const result = validateRoleChange(
        makeTarget({ role: "student" }),
        "tutor",
        2,
        "u1",
      );
      expect(result.previousRole).toBe("student");
    });

    test("returns previousRole for changing tutor to student", () => {
      const result = validateRoleChange(
        makeTarget({ role: "tutor" }),
        "student",
        2,
        "u1",
      );
      expect(result.previousRole).toBe("tutor");
    });

    test("returns previousRole for changing admin to admin (no change)", () => {
      const result = validateRoleChange(
        makeTarget({ role: "admin" }),
        "admin",
        1,
        "u1",
      );
      expect(result.previousRole).toBe("admin");
    });

    test("throws UserNotFoundError for null target", () => {
      expect(() => validateRoleChange(null, "tutor", 2, "u1")).toThrow(
        UserNotFoundError,
      );
    });

    test("throws LastAdminError when demoting last admin", () => {
      expect(() =>
        validateRoleChange(makeTarget({ role: "admin" }), "student", 1, "u1"),
      ).toThrow(LastAdminError);
    });

    test("returns previousRole when demoting admin with other admins present", () => {
      const result = validateRoleChange(
        makeTarget({ role: "admin" }),
        "student",
        3,
        "u1",
      );
      expect(result.previousRole).toBe("admin");
    });
  });
});
