import { createRouterClient } from "@orpc/server";
import { auth } from "@cogito-app/auth";
import { db } from "@cogito-app/db";
import { eq } from "drizzle-orm";
import {
  user,
  tutorProfile,
  tutorInvite,
  auditLog,
} from "@cogito-app/db/schema";

import { appRouter, type AppRouter } from "../../routers";
import { services } from "../../services";

export type TestClient = ReturnType<typeof createTestClient>;

export async function createTestContext(sessionCookie?: string) {
  const headers = new Headers();
  if (sessionCookie) headers.set("cookie", sessionCookie);
  const session = await auth.api.getSession({ headers });
  return { session, services };
}

export function createTestClient(
  context: Awaited<ReturnType<typeof createTestContext>>,
) {
  return createRouterClient<AppRouter>(appRouter, { context });
}

export async function signUpAndSignIn(
  email: string,
  password: string,
  name: string,
) {
  await auth.api.signUpEmail({
    body: { email, password, name },
    headers: new Headers(),
  });

  const response = await auth.api.signInEmail({
    body: { email, password },
    headers: new Headers(),
    asResponse: true,
  });

  const setCookie = response.headers.getSetCookie();
  const sessionCookie = setCookie.find((c: string) =>
    c.includes("better-auth.session_token"),
  );
  return { cookie: sessionCookie?.split(";")[0] ?? "" };
}

export async function setUserRole(userId: string, role: string) {
  await db.update(user).set({ role }).where(eq(user.id, userId));
}

export async function cleanUser(email: string) {
  const [found] = await db
    .select()
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (found) {
    await db
      .delete(tutorProfile)
      .where(eq(tutorProfile.userId, found.id))
      .catch(() => {});
    await db
      .delete(auditLog)
      .where(eq(auditLog.actorId, found.id))
      .catch(() => {});
    await db
      .delete(tutorInvite)
      .where(eq(tutorInvite.email, email))
      .catch(() => {});
    await db.delete(user).where(eq(user.id, found.id));
  }
}
