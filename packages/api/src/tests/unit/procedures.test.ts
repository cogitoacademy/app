import { describe, test, expect } from "bun:test";
import { ORPCError } from "@orpc/server";

describe("procedures", () => {
  test("exports publicProcedure, protectedProcedure, and adminProcedure", async () => {
    const mod = await import("../../procedures");
    expect(mod.publicProcedure).toBeDefined();
    expect(mod.protectedProcedure).toBeDefined();
    expect(mod.adminProcedure).toBeDefined();
    expect(mod.o).toBeDefined();
    expect(mod.requireAuth).toBeDefined();
    expect(mod.requireEmailVerified).toBeDefined();
    expect(mod.requireAdmin).toBeDefined();
  });

  test("requireAuth throws UNAUTHORIZED when session is null", async () => {
    const { requireAuth } = await import("../../procedures");

    try {
      await (requireAuth as any)({
        context: { session: null, services: {} },
        next: async () => "should not reach",
      });
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ORPCError);
      expect((e as ORPCError).code).toBe("UNAUTHORIZED");
    }
  });

  test("requireAuth throws UNAUTHORIZED when session has no user", async () => {
    const { requireAuth } = await import("../../procedures");

    try {
      await (requireAuth as any)({
        context: { session: {}, services: {} },
        next: async () => "should not reach",
      });
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ORPCError);
      expect((e as ORPCError).code).toBe("UNAUTHORIZED");
    }
  });

  test("requireAuth calls next when session has user", async () => {
    const { requireAuth } = await import("../../procedures");

    let nextCalled = false;
    const next = async () => {
      nextCalled = true;
      return "ok";
    };

    await (requireAuth as any)({
      context: { session: { user: { id: "u1" } }, services: {} },
      next,
    });

    expect(nextCalled).toBe(true);
  });

  test("requireEmailVerified rejects an unverified user", async () => {
    const { requireEmailVerified } = await import("../../procedures");

    await expect(
      (requireEmailVerified as any)({
        context: {
          session: { user: { id: "u1", emailVerified: false } },
          services: {},
        },
        next: async () => "should not reach",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "EMAIL_NOT_VERIFIED",
    });
  });

  test("requireEmailVerified calls next for a verified user", async () => {
    const { requireEmailVerified } = await import("../../procedures");

    await expect(
      (requireEmailVerified as any)({
        context: {
          session: { user: { id: "u1", emailVerified: true } },
          services: {},
        },
        next: async () => "ok",
      }),
    ).resolves.toBe("ok");
  });

  test("requireAdmin throws UNAUTHORIZED when session is null", async () => {
    const { requireAdmin } = await import("../../procedures");

    try {
      await (requireAdmin as any)({
        context: { session: null, services: {} },
        next: async () => "should not reach",
      });
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ORPCError);
      expect((e as ORPCError).code).toBe("UNAUTHORIZED");
    }
  });

  test("requireAdmin throws FORBIDDEN when user is not admin", async () => {
    const { requireAdmin } = await import("../../procedures");

    try {
      await (requireAdmin as any)({
        context: {
          session: { user: { id: "u1", role: "student" } },
          services: {},
        },
        next: async () => "should not reach",
      });
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ORPCError);
      expect((e as ORPCError).code).toBe("FORBIDDEN");
    }
  });

  test("requireAdmin calls next when user is admin", async () => {
    const { requireAdmin } = await import("../../procedures");
    const { USER_ROLE } = await import("../../shared/constants");

    let nextCalled = false;
    const next = async () => {
      nextCalled = true;
      return "ok";
    };

    await (requireAdmin as any)({
      context: {
        session: { user: { id: "admin1", role: USER_ROLE.ADMIN } },
        services: {},
      },
      next,
    });

    expect(nextCalled).toBe(true);
  });

  test("requireTutor throws UNAUTHORIZED when session is null", async () => {
    const { requireTutor } = await import("../../procedures");

    try {
      await (requireTutor as any)({
        context: { session: null, services: {} },
        next: async () => "should not reach",
      });
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ORPCError);
      expect((e as ORPCError).code).toBe("UNAUTHORIZED");
    }
  });

  test("requireTutor throws UNAUTHORIZED when session has no user", async () => {
    const { requireTutor } = await import("../../procedures");

    try {
      await (requireTutor as any)({
        context: { session: {}, services: {} },
        next: async () => "should not reach",
      });
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ORPCError);
      expect((e as ORPCError).code).toBe("UNAUTHORIZED");
    }
  });

  test("requireTutor throws FORBIDDEN when user role is student", async () => {
    const { requireTutor } = await import("../../procedures");

    try {
      await (requireTutor as any)({
        context: {
          session: { user: { id: "u1", role: "student" } },
          services: {},
        },
        next: async () => "should not reach",
      });
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ORPCError);
      expect((e as ORPCError).code).toBe("FORBIDDEN");
    }
  });

  test("requireTutor calls next when user is tutor", async () => {
    const { requireTutor } = await import("../../procedures");
    const { USER_ROLE } = await import("../../shared/constants");

    let nextCalled = false;
    const next = async () => {
      nextCalled = true;
      return "ok";
    };

    await (requireTutor as any)({
      context: {
        session: { user: { id: "t1", role: USER_ROLE.TUTOR } },
        services: {},
      },
      next,
    });

    expect(nextCalled).toBe(true);
  });

  test("tutorProcedure is exported", async () => {
    const mod = await import("../../procedures");
    expect(mod.tutorProcedure).toBeDefined();
  });

  test("requireStudent rejects tutor and allows student", async () => {
    const { requireStudent } = await import("../../procedures");

    await expect(
      (requireStudent as any)({
        context: {
          session: { user: { id: "t1", role: "tutor" } },
          services: {},
        },
        next: async () => "ok",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      (requireStudent as any)({
        context: {
          session: { user: { id: "s1", role: "student" } },
          services: {},
        },
        next: async () => "ok",
      }),
    ).resolves.toBe("ok");
  });

  test("studentProcedure is exported", async () => {
    const mod = await import("../../procedures");
    expect(mod.studentProcedure).toBeDefined();
  });
});
