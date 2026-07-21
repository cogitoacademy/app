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
});
