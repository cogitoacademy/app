import { describe, test, expect } from "bun:test";
import {
  dashboardAnalyticsInput,
  listUsersInput,
  setRoleInput,
} from "../../modules/admin/admin.types";

describe("Admin Types (Zod schemas)", () => {
  test("dashboardAnalyticsInput accepts the supported periods", () => {
    expect(dashboardAnalyticsInput.safeParse(undefined).success).toBe(true);
    expect(dashboardAnalyticsInput.safeParse({ period: "7d" }).data).toEqual({
      period: "7d",
    });
    expect(dashboardAnalyticsInput.safeParse({ period: "365d" }).success).toBe(
      false,
    );
  });

  test("listUsersInput defaults limit and offset", () => {
    const result = listUsersInput.safeParse(undefined);
    expect(result.success).toBe(true);
  });

  test("setRoleInput validates role enum", () => {
    expect(
      setRoleInput.safeParse({
        userId: "u1",
        role: "student",
        expectedRole: "tutor",
      }).success,
    ).toBe(true);
    expect(
      setRoleInput.safeParse({
        userId: "u1",
        role: "tutor",
        expectedRole: "student",
      }).success,
    ).toBe(true);
    expect(
      setRoleInput.safeParse({
        userId: "u1",
        role: "admin",
        expectedRole: "student",
      }).success,
    ).toBe(true);
    expect(
      setRoleInput.safeParse({
        userId: "u1",
        role: "superadmin",
        expectedRole: "student",
      }).success,
    ).toBe(false);
  });

  test("setRoleInput requires expectedRole", () => {
    expect(
      setRoleInput.safeParse({ userId: "u1", role: "student" }).success,
    ).toBe(false);
    expect(
      setRoleInput.safeParse({
        userId: "u1",
        role: "student",
        expectedRole: "tutor",
      }).success,
    ).toBe(true);
  });
});
