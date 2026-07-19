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

const { authRouter } = await import("../../modules/auth/auth.router");
import { updateProfileInput } from "../../modules/auth/auth.types";

describe("authRouter", () => {
  test("exports expected route keys", () => {
    expect(Object.keys(authRouter).toSorted()).toEqual([
      "getProfile",
      "me",
      "updateProfile",
    ]);
  });

  describe("input validation", () => {
    test("updateProfileInput accepts valid partial input", () => {
      const result = updateProfileInput.safeParse({ phoneNumber: "0812" });
      expect(result.success).toBe(true);
    });

    test("updateProfileInput accepts all fields", () => {
      const result = updateProfileInput.safeParse({
        phoneNumber: "0812",
        schoolName: "SMA 1",
        gradeLevel: "12",
        parentName: "Parent",
        parentPhone: "0813",
        parentEmail: "p@example.com",
      });
      expect(result.success).toBe(true);
    });

    test("updateProfileInput rejects invalid email", () => {
      const result = updateProfileInput.safeParse({
        parentEmail: "not-an-email",
      });
      expect(result.success).toBe(false);
    });

    test("updateProfileInput accepts empty object", () => {
      const result = updateProfileInput.safeParse({});
      expect(result.success).toBe(true);
    });
  });
});
