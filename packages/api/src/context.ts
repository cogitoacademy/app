import { auth } from "@cogito-app/auth";
import { db } from "@cogito-app/db";
import { user } from "@cogito-app/db/schema";
import { eq } from "drizzle-orm";
import type { Context as ElysiaContext } from "elysia";

import { services } from "./services";

export type CreateContextOptions = {
  context: ElysiaContext;
};

export async function createContext({ context }: CreateContextOptions) {
  const session = await auth.api.getSession({
    headers: context.request.headers,
  });
  if (session?.user) {
    const currentUser = await db.query.user.findFirst({
      columns: { role: true, emailVerified: true },
      where: eq(user.id, session.user.id),
    });
    if (currentUser) {
      session.user.role = currentUser.role;
      session.user.emailVerified = currentUser.emailVerified;
    }
  }
  return {
    session,
    services,
    headers: context.request.headers,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
