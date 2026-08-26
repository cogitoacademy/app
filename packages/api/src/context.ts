import { auth } from "@cogito-app/auth";
import { db } from "@cogito-app/db";
import { user } from "@cogito-app/db/schema";
import { eq } from "drizzle-orm";
import type { Context as ElysiaContext } from "elysia";

import type { DbType } from "./lib/db";
import { services } from "./services";

export type CreateContextOptions = {
  context: ElysiaContext;
};

/**
 * N4: refreshes the session user's `role` and `emailVerified` from the DB.
 * The session cookie cache (SESSION_COOKIE_CACHE_MAX_AGE, 60s) can otherwise
 * serve a stale emailVerified to verifiedStudentProcedure for up to a minute
 * after a fresh OTP verification. Extracted as a pure helper so it is
 * unit-testable without mocking the auth/db modules.
 */
export async function refreshSessionUser(
  conn: Pick<DbType, "query">,
  sessionUser: { id: string; role?: string | null; emailVerified: boolean },
): Promise<void> {
  const currentUser = await conn.query.user.findFirst({
    columns: { role: true, emailVerified: true },
    where: eq(user.id, sessionUser.id),
  });
  if (currentUser) {
    sessionUser.role = currentUser.role;
    sessionUser.emailVerified = currentUser.emailVerified;
  }
}

export async function createContext(
  { context }: CreateContextOptions,
  deps: {
    getSession?: (
      headers: Headers,
    ) => Promise<Awaited<ReturnType<typeof auth.api.getSession>> | null>;
    conn?: Pick<DbType, "query">;
  } = {},
) {
  const getSession =
    deps.getSession ?? ((headers) => auth.api.getSession({ headers }));
  const session = await getSession(context.request.headers);
  if (session?.user) {
<<<<<<< HEAD
    const currentUser = await db.query.user.findFirst({
      columns: { role: true, emailVerified: true },
      where: eq(user.id, session.user.id),
    });
    if (currentUser) {
      session.user.role = currentUser.role;
      session.user.emailVerified = currentUser.emailVerified;
    }
=======
    await refreshSessionUser(deps.conn ?? db, session.user);
>>>>>>> a84ac29 (fix(auth): refresh emailVerified per request)
  }
  return {
    session,
    services,
    headers: context.request.headers,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
