import { describe, test, expect, mock } from "bun:test";

const { createAuthRouter } = await import("../../modules/auth/auth.router");
import { updateProfileInput } from "../../modules/auth/auth.types";
import { createAuthHandler } from "../../modules/auth/auth.handler";
import { USER_ROLE } from "../../shared/constants";
import { ORPCError } from "@orpc/server";

describe("authRouter", () => {
  test("exports expected route keys", () => {
    const handler = createAuthHandler({
      me: mock(),
      getProfile: mock(),
      updateProfile: mock(),
    } as any);
    const authRouter = createAuthRouter(handler);
    expect(Object.keys(authRouter).toSorted()).toEqual([
      "getProfile",
      "me",
      "searchStudents",
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
        allowContactRequests: false,
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

describe("authHandler", () => {
  describe("me", () => {
    test("returns user, profile, tutorProfile, and wallet from authService.me", async () => {
      const me = mock(async () => ({
        profile: { id: "p1" },
        tutorProfile: { id: "t1" },
        wallet: { id: "w1", totalBalance: 100 },
      }));
      const handler = createAuthHandler({ me } as any);
      const context = {
        session: { user: { id: "u1", email: "u1@test.com" } },
      };

      const result = await handler.me({ context } as any);

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
    test("calls authService.getProfile with userId", async () => {
      const getProfile = mock(async () => ({ id: "p1", userId: "u1" }));
      const handler = createAuthHandler({ getProfile } as any);
      const context = {
        session: { user: { id: "u1" } },
      };

      const result = await handler.getProfile({ context } as any);

      expect(getProfile).toHaveBeenCalledWith("u1");
      expect(result).toEqual({ id: "p1", userId: "u1" });
    });
  });

  describe("updateProfile", () => {
    test("calls authService.updateProfile with userId and input", async () => {
      const updateProfile = mock(async () => ({ id: "p1", userId: "u1" }));
      const handler = createAuthHandler({ updateProfile } as any);
      const context = {
        session: { user: { id: "u1" } },
      };
      const input = { phoneNumber: "0812" };

      const result = await handler.updateProfile({ context, input } as any);

      expect(updateProfile).toHaveBeenCalledWith("u1", input);
      expect(result).toEqual({ id: "p1", userId: "u1" });
    });
  });

  describe("searchStudents", () => {
    test("allows students and calls authService.searchStudents", async () => {
      const searchStudents = mock(async () => [
        { id: "s1", name: "A", image: null, email: "a@x.com" },
      ]);
      const handler = createAuthHandler({ searchStudents } as any);
      const context = {
        session: { user: { id: "u1", role: USER_ROLE.STUDENT } },
      };

      const result = await handler.searchStudents({
        context,
        input: { query: "alex", limit: 5 },
      } as any);

      expect(searchStudents).toHaveBeenCalledWith("u1", "alex", 5);
      expect(result).toEqual([{ id: "s1", name: "A", image: null }]);
    });

    test("rejects tutors with a FORBIDDEN error", async () => {
      const searchStudents = mock();
      const handler = createAuthHandler({ searchStudents } as any);
      const context = {
        session: { user: { id: "t1", role: USER_ROLE.TUTOR } },
      };

      await expect(
        handler.searchStudents({
          context,
          input: { query: "alex", limit: 5 },
        } as any),
      ).rejects.toBeInstanceOf(ORPCError);
      expect(searchStudents).not.toHaveBeenCalled();
    });

    test("rejects admins with a FORBIDDEN error", async () => {
      const searchStudents = mock();
      const handler = createAuthHandler({ searchStudents } as any);
      const context = {
        session: { user: { id: "a1", role: USER_ROLE.ADMIN } },
      };

      await expect(
        handler.searchStudents({
          context,
          input: { query: "alex", limit: 5 },
        } as any),
      ).rejects.toBeInstanceOf(ORPCError);
      expect(searchStudents).not.toHaveBeenCalled();
    });
  });
});
