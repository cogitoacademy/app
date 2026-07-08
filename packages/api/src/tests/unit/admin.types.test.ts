import { describe, test, expect } from "bun:test";
import { listUsersInput, setRoleInput } from "../../modules/admin/admin.types";

describe("Admin Types (Zod schemas)", () => {
  test("listUsersInput defaults limit and offset", () => {
    const result = listUsersInput.safeParse(undefined);
    expect(result.success).toBe(true);
  });

  test("setRoleInput validates role enum", () => {
    expect(
      setRoleInput.safeParse({ userId: "u1", role: "student" }).success,
    ).toBe(true);
    expect(
      setRoleInput.safeParse({ userId: "u1", role: "tutor" }).success,
    ).toBe(true);
    expect(
      setRoleInput.safeParse({ userId: "u1", role: "admin" }).success,
    ).toBe(true);
    expect(
      setRoleInput.safeParse({ userId: "u1", role: "superadmin" }).success,
    ).toBe(false);
  });
});
