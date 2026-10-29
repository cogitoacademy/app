import { expect, mock, test } from "bun:test";

const findFirst = mock(async () => ({
  role: "admin",
  emailVerified: true,
  referralChoicePending: false,
}));

mock.module("@cogito-app/auth", () => ({
  auth: { api: { getSession: async () => null } },
}));
mock.module("@cogito-app/db", () => ({
  db: { query: { user: { findFirst } } },
}));
mock.module("../../services", () => ({ services: {} }));

const { createContext } = await import("../../context");

test("refreshes a session user through the default database connection", async () => {
  const sessionUser = {
    id: "user-1",
    role: "student",
    emailVerified: false,
    referralChoicePending: true,
  };
  const requestContext = {
    request: { headers: new Headers() },
  } as never;

  await createContext(
    { context: requestContext },
    {
      getSession: async () => ({ user: sessionUser }) as never,
    },
  );

  expect(findFirst).toHaveBeenCalledTimes(1);
  expect(sessionUser).toEqual({
    id: "user-1",
    role: "admin",
    emailVerified: true,
    referralChoicePending: false,
  });
});
