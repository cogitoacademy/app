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

  describe("me handler", () => {
    test("calls auth.me with userId and returns composed result", async () => {
      const meResult = {
        profile: { id: "p1" },
        tutorProfile: { id: "t1" },
        wallet: { id: "w1" },
      };
      const me = mock(async () => meResult);
      const context = {
        session: { user: { id: "u1" } },
        services: { auth: { me } },
      };

      const result = await authRouter.me({ context });

      expect(me).toHaveBeenCalledWith("u1");
      expect(result).toEqual({
        user: context.session.user,
        profile: meResult.profile,
        tutorProfile: meResult.tutorProfile,
        wallet: meResult.wallet,
      });
    });
  });

  describe("getProfile handler", () => {
    test("calls auth.getProfile with userId", async () => {
      const getProfile = mock(async () => ({ id: "p1", userId: "u1" }));
      const context = {
        session: { user: { id: "u1" } },
        services: { auth: { getProfile } },
      };

      const result = await authRouter.getProfile({ context });

      expect(getProfile).toHaveBeenCalledWith("u1");
      expect(result).toEqual({ id: "p1", userId: "u1" });
    });
  });

  describe("updateProfile handler", () => {
    test("calls auth.updateProfile with userId and input", async () => {
      const updateProfile = mock(async () => ({ id: "p1", updated: true }));
      const context = {
        session: { user: { id: "u1" } },
        services: { auth: { updateProfile } },
      };
      const input = { phoneNumber: "0812", schoolName: "SMA 1" };

      const result = await authRouter.updateProfile({ context, input });

      expect(updateProfile).toHaveBeenCalledWith("u1", input);
      expect(result).toEqual({ id: "p1", updated: true });
    });
  });
});
