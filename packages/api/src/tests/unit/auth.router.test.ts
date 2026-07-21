import { describe, test, expect, mock } from "bun:test";

const { authRouter } = await import("../../modules/auth/auth.router");
import { updateProfileInput } from "../../modules/auth/auth.types";
import { authHandlers } from "../../modules/auth/auth.handlers";

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

describe("authHandlers", () => {
  describe("me", () => {
    test("returns user, profile, tutorProfile, and wallet from auth.me", async () => {
      const me = mock(async () => ({
        profile: { id: "p1" },
        tutorProfile: { id: "t1" },
        wallet: { id: "w1", totalBalance: 100 },
      }));
      const context = {
        session: { user: { id: "u1", email: "u1@test.com" } },
        services: { auth: { me } },
      };

      const result = await authHandlers.me({ context });

      expect(me).toHaveBeenCalledWith("u1");
      expect(result).toEqual({
        user: { id: "u1", email: "u1@test.com" },
        profile: { id: "p1" },
        tutorProfile: { id: "t1" },
        wallet: { id: "w1", totalBalance: 100 },
      });
    });
  });

  describe("getProfile", () => {
    test("calls auth.getProfile with userId", async () => {
      const getProfile = mock(async () => ({ id: "p1", userId: "u1" }));
      const context = {
        session: { user: { id: "u1" } },
        services: { auth: { getProfile } },
      };

      const result = await authHandlers.getProfile({ context });

      expect(getProfile).toHaveBeenCalledWith("u1");
      expect(result).toEqual({ id: "p1", userId: "u1" });
    });
  });

  describe("updateProfile", () => {
    test("calls auth.updateProfile with userId and input", async () => {
      const updateProfile = mock(async () => ({ id: "p1", userId: "u1" }));
      const context = {
        session: { user: { id: "u1" } },
        services: { auth: { updateProfile } },
      };
      const input = { phoneNumber: "0812" };

      const result = await authHandlers.updateProfile({ context, input });

      expect(updateProfile).toHaveBeenCalledWith("u1", input);
      expect(result).toEqual({ id: "p1", userId: "u1" });
    });
  });
});
