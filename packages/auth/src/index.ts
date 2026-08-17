import { createAuthMiddleware } from "better-auth/api";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { db } from "@cogito-app/db";
import { getAuthTrustedOrigins } from "@cogito-app/env/origins";
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

export type ResetPasswordEmailSender = (params: {
  user: CogitoUser;
  url: string;
  token: string;
}) => Promise<void>;

let resetPasswordEmailSender: ResetPasswordEmailSender | null = null;

/**
 * Wires the email port used by Better Auth's reset-password flow.
 *
 * The sender lives outside this package (the EmailService in @cogito-app/api)
 * to avoid a circular dependency — @cogito-app/api imports @cogito-app/auth.
 * The composition root (apps/server) calls this at boot. Tests wire a spy.
 */
export function setAuthEmailSender(sender: ResetPasswordEmailSender) {
  resetPasswordEmailSender = sender;
}

export function createAuth() {
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: schema,
    }),
    trustedOrigins: getAuthTrustedOrigins(env.CORS_ORIGIN, env.NODE_ENV),
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: false,
          defaultValue: "student",
          input: false,
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      cookieCache: {
        enabled: true,
        maxAge: env.SESSION_COOKIE_CACHE_MAX_AGE,
      },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url, token }, _request) => {
        const sender = resetPasswordEmailSender;
        if (!sender) {
          console.warn(
            JSON.stringify({
              level: "warn",
              action: "reset_password_email_not_configured",
              userId: user.id,
            }),
          );
          return;
        }
        try {
          await sender({
            user: user as unknown as CogitoUser,
            url,
            token,
          });
        } catch (error) {
          // Never surface email failures to the caller: the request endpoint
          // must return the same response for known and unknown emails
          // (anti-enumeration). The email provider logs its own failures.
          console.error(
            JSON.stringify({
              level: "error",
              action: "reset_password_email_send_failed",
              userId: user.id,
              error: { message: String(error) },
            }),
          );
        }
      },
    },
    socialProviders:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
            },
          }
        : {},
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
      defaultCookieAttributes: {
        sameSite: env.NODE_ENV === "production" ? "strict" : "lax",
        secure: env.NODE_ENV === "production",
        httpOnly: true,
      },
    },
    plugins: [],
    hooks: {
      after: createAuthMiddleware(async () => {
        // Wallet creation is now handled lazily by WalletService.getOrCreate()
        // when the user first calls auth.me. This decouples auth from wallet.
      }),
    },
  });
}

export const auth = createAuth();
