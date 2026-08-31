import { createAuthMiddleware } from "better-auth/api";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins/email-otp";
import { eq } from "drizzle-orm";

import { db } from "@cogito-app/db";
import { isConfiguredAdminEmail } from "@cogito-app/env/admin";
import { isProductionLike } from "@cogito-app/env/node-env";
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

export type VerificationEmailSender = (params: {
  email: string;
  otp: string;
  type: "sign-in" | "email-verification" | "forget-password" | "change-email";
}) => Promise<void>;

/**
 * Email port for the signup-confirmation (welcome) email (PRD notification
 * matrix: "Account created" -> email to the new student). Fires once on actual
 * user creation, never on a subsequent existing-user sign-in.
 */
export type WelcomeEmailSender = (params: {
  user: CogitoUser;
  loginUrl: string;
}) => Promise<void>;

let resetPasswordEmailSender: ResetPasswordEmailSender | null = null;
let verificationEmailSender: VerificationEmailSender | null = null;
let welcomeEmailSender: WelcomeEmailSender | null = null;

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

/**
 * Wires the email port used by the email-OTP verification plugin (G2).
 * Same circular-dependency rationale as setAuthEmailSender.
 */
export function setVerificationEmailSender(sender: VerificationEmailSender) {
  verificationEmailSender = sender;
}

/**
 * Wires the signup-confirmation (welcome) email port (P2).
 * Same circular-dependency rationale as setAuthEmailSender — the sender lives
 * in @cogito-app/api's EmailService and is wired at boot by the composition
 * root (apps/server). Fires only on actual user creation.
 */
export function setWelcomeEmailSender(sender: WelcomeEmailSender) {
  welcomeEmailSender = sender;
}

// C6 (foundation-hardening): passwords must contain at least one uppercase
// letter, one lowercase letter, and one digit (min length 8 enforced by
// better-auth's minPasswordLength). Validated at sign-up via the createUser
// hook — better-auth 1.6.11 has no built-in complexity options.
export function assertPasswordPolicy(password: string) {
  if (!/[A-Z]/.test(password)) {
    return "Password must contain at least one uppercase letter";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must contain at least one lowercase letter";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must contain at least one digit";
  }
  return null;
}

export function resolveGoogleSocialProviders(input: {
  clientId?: string;
  clientSecret?: string;
}) {
  if (!input.clientId || !input.clientSecret) return {};
  return {
    google: {
      clientId: input.clientId,
      clientSecret: input.clientSecret,
    },
  };
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
    socialProviders: resolveGoogleSocialProviders({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
      defaultCookieAttributes: {
        sameSite: isProductionLike(env.NODE_ENV) ? "strict" : "lax",
        secure: isProductionLike(env.NODE_ENV),
        httpOnly: true,
      },
      // The OAuth callback is a top-level GET navigation from the provider.
      // Keep session cookies Strict, but allow Better Auth's short-lived,
      // signed state cookie to return with that callback. The database state
      // strategy still verifies the value against the verification record.
      cookies: {
        state: {
          attributes: { sameSite: "lax" },
        },
        // Future-proof the cookie strategy as well; the current database
        // adapter uses `state`, while cookie-backed state uses `oauth_state`.
        oauth_state: {
          attributes: { sameSite: "lax" },
        },
      },
    },
    plugins: [
      // G2: email verification via OTP (better-auth email-otp plugin). The
      // OTP is delivered through the shared email port (wired at boot via
      // setVerificationEmailSender). sendVerificationOnSignUp sends the OTP
      // right after sign-up; the verify-email endpoint marks the user verified.
      emailOTP({
        sendVerificationOTP: async ({ email, otp, type }) => {
          const sender = verificationEmailSender;
          if (!sender) {
            console.warn(
              JSON.stringify({
                level: "warn",
                action: "verification_email_not_configured",
                email,
                type,
              }),
            );
            return;
          }
          try {
            await sender({ email, otp, type });
          } catch (error) {
            // Never surface email failures to the caller (anti-enumeration);
            // the email provider logs its own failures.
            console.error(
              JSON.stringify({
                level: "error",
                action: "verification_email_send_failed",
                email,
                type,
                error: { message: String(error) },
              }),
            );
          }
        },
        sendVerificationOnSignUp: true,
        expiresIn: 300,
        otpLength: 6,
      }),
    ],
    hooks: {
      after: createAuthMiddleware(async () => {
        // Wallet creation is now handled lazily by WalletService.getOrCreate()
        // when the user first calls auth.me. This decouples auth from wallet.
      }),
    },
    databaseHooks: {
      user: {
        create: {
          // P2: send the signup-confirmation (welcome) email on actual account
          // creation. The PRD notification matrix requires a welcome email to
          // new students with an onboarding entry point, login link, and brief
          // platform intro. Fires only on a genuine new signup — an existing
          // user signing in never re-creates the user row, so it does not re-send.
          after: async (user) => {
            // Keep the configured production operator usable when the account
            // is created after the server has booted. Boot reconciliation
            // covers pre-existing accounts; this hook covers first-time
            // signup without changing local/test defaults.
            if (
              isProductionLike(env.NODE_ENV) &&
              isConfiguredAdminEmail(user.email, env.ADMIN_EMAILS)
            ) {
              try {
                await db
                  .update(schema.user)
                  .set({ role: "admin" })
                  .where(eq(schema.user.id, user.id));
              } catch (error) {
                console.error(
                  JSON.stringify({
                    level: "error",
                    action: "production_admin_signup_bootstrap_failed",
                    userId: user.id,
                    error: { message: String(error) },
                  }),
                );
              }
            }

            const sender = welcomeEmailSender;
            if (!sender) {
              console.warn(
                JSON.stringify({
                  level: "warn",
                  action: "welcome_email_not_configured",
                  userId: user.id,
                }),
              );
              return;
            }
            try {
              const origin = env.CORS_ORIGIN.replace(/\/$/, "");
              await sender({
                user: user as unknown as CogitoUser,
                loginUrl: `${origin}/login`,
              });
            } catch (error) {
              // Never surface email failures to the caller (anti-enumeration);
              // the email provider logs its own failures.
              console.error(
                JSON.stringify({
                  level: "error",
                  action: "welcome_email_send_failed",
                  userId: user.id,
                  error: { message: String(error) },
                }),
              );
            }
          },
        },
      },
    },
  });
}

export const auth = createAuth();
