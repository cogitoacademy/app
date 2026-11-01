import { describe, test, expect, mock, spyOn } from "bun:test";
import { auth } from "@cogito-app/auth";
import { db } from "@cogito-app/db";
import { createContext, refreshSessionUser } from "../../context";

describe("refreshSessionUser (N4)", () => {
  test("re-fetches emailVerified from the DB per request alongside role", async () => {
    const findFirst = mock(async () => ({
      role: "student",
      emailVerified: true,
      referralChoicePending: false,
    }));
    const sessionUser = {
      id: "u1",
      email: "student@cogito.test",
      name: "Student",
      role: "student",
      emailVerified: false,
      referralChoicePending: true,
    };

    await refreshSessionUser(
      { query: { user: { findFirst } } } as any,
      sessionUser,
    );

    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findFirst.mock.calls[0]![0]).toMatchObject({
      columns: {
        role: true,
        emailVerified: true,
        referralChoicePending: true,
      },
    });
    expect(sessionUser.role).toBe("student");
    expect(sessionUser.emailVerified).toBe(true);
    expect(sessionUser.referralChoicePending).toBe(false);
  });

  test("keeps the cookie values when the DB row is missing", async () => {
    const findFirst = mock(async () => null);
    const sessionUser = {
      id: "u1",
      email: "student@cogito.test",
      name: "Student",
      role: "student",
      emailVerified: false,
      referralChoicePending: true,
    };

    await refreshSessionUser(
      { query: { user: { findFirst } } } as any,
      sessionUser,
    );

    expect(sessionUser.emailVerified).toBe(false);
    expect(sessionUser.role).toBe("student");
    expect(sessionUser.referralChoicePending).toBe(true);
  });

  test("overwrites a stale cached emailVerified with the DB value", async () => {
    const findFirst = mock(async () => ({
      role: "tutor",
      emailVerified: true,
      referralChoicePending: false,
    }));
    const sessionUser = {
      id: "u1",
      email: "student@cogito.test",
      name: "Student",
      role: "student",
      emailVerified: false,
      referralChoicePending: true,
    };

    await refreshSessionUser(
      { query: { user: { findFirst } } } as any,
      sessionUser,
    );

    expect(sessionUser.role).toBe("tutor");
    expect(sessionUser.emailVerified).toBe(true);
  });
});

describe("createContext (N4 wiring)", () => {
  test("refreshes the session user via the injected session + db deps", async () => {
    const getSession = mock(async () => ({
      user: {
        id: "u1",
        email: "student@cogito.test",
        name: "Student",
        role: "student",
        emailVerified: false,
      },
    }));
    const findFirst = mock(async () => ({
      role: "student",
      emailVerified: true,
      referralChoicePending: false,
    }));

    const ctx = await createContext(
      {
        context: {
          request: new Request("http://localhost/rpc/booking.create", {
            headers: { cookie: "better-auth.session_token=abc" },
          }),
        },
      } as any,
      { getSession, conn: { query: { user: { findFirst } } } as any },
    );

    expect(getSession).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(ctx.session!.user.emailVerified).toBe(true);
    expect(ctx.session!.user.referralChoicePending).toBe(false);
    expect(ctx.services).toBeDefined();
    expect(ctx.headers.get("cookie")).toBe("better-auth.session_token=abc");
  });

  test("returns a null session when unauthenticated", async () => {
    const getSession = mock(async () => null);

    const ctx = await createContext(
      {
        context: {
          request: new Request("http://localhost/rpc/booking.me"),
        },
      } as any,
      { getSession } as any,
    );

    expect(ctx.session).toBeNull();
    expect(ctx.services).toBeDefined();
  });

  test("uses the default auth session resolver when no override is provided", async () => {
    const originalGetSession = (auth.api as any).getSession;
    const getSession = mock(async () => null);
    (auth.api as any).getSession = getSession;

    try {
      const ctx = await createContext({
        context: {
          request: new Request("http://localhost/rpc/auth.getSession"),
        },
      } as any);

      expect(ctx.session).toBeNull();
      expect(getSession).toHaveBeenCalledTimes(1);
    } finally {
      (auth.api as any).getSession = originalGetSession;
    }
  });

  test("uses the default database connection when refreshing the session user", async () => {
    const findFirst = spyOn(db.query.user, "findFirst").mockResolvedValue({
      role: "admin",
      emailVerified: true,
      referralChoicePending: false,
    } as never);
    const getSession = mock(async () => ({
      user: {
        id: "u1",
        email: "student@cogito.test",
        name: "Student",
        role: "student",
        emailVerified: false,
        referralChoicePending: true,
      },
    }));

    try {
      const ctx = await createContext(
        {
          context: {
            request: new Request("http://localhost/rpc/auth.getSession"),
          },
        } as any,
        { getSession } as any,
      );

      expect(findFirst).toHaveBeenCalledTimes(1);
      expect(ctx.session!.user).toMatchObject({
        role: "admin",
        emailVerified: true,
        referralChoicePending: false,
      });
    } finally {
      findFirst.mockRestore();
    }
  });
});
