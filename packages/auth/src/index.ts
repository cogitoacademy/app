import { createAuthMiddleware } from "better-auth/api";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { createDb } from "@cogito-app/db";
import { wallet } from "@cogito-app/db/schema";
import { env } from "@cogito-app/env/server";

import * as schema from "@cogito-app/db/schema";

export type CogitoUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: string;
  createdAt: Date;
  updatedAt: Date;
};

export function createAuth() {
  const db = createDb();

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: schema,
    }),
    trustedOrigins: [env.CORS_ORIGIN],
    emailAndPassword: {
      enabled: true,
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
      defaultCookieAttributes: {
        sameSite: "none",
        secure: true,
        httpOnly: true,
      },
    },
    plugins: [],
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path.startsWith("/sign-up")) {
          const newSession = ctx.context.newSession;
          if (newSession?.user?.id) {
            await db.insert(wallet).values({
              id: crypto.randomUUID(),
              userId: newSession.user.id,
              totalBalance: 0,
              heldBalance: 0,
              availableBalance: 0,
            });
          }
        }
      }),
    },
  });
}

export const auth = createAuth();
