import { createAuthMiddleware } from "better-auth/api";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins/email-otp";
import { eq, sql } from "drizzle-orm";
import { Buffer } from "node:buffer";
import {
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import { db } from "@cogito-app/db";
import { isConfiguredAdminEmail } from "@cogito-app/env/admin";
import { isProductionLike } from "@cogito-app/env/node-env";
import { getAuthTrustedOrigins } from "@cogito-app/env/origins";
import { env } from "@cogito-app/env/server";

import * as schema from "@cogito-app/db/schema";

import {
  createSecondaryStorage,
  type SecondaryStorageRedis,
} from "./secondary-storage";

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

export type PreAccountSignupEmailSender = (params: {
  email: string;
  otp: string;
}) => Promise<void>;

export type SignupWelcomeEmailSender = (params: {
  user: CogitoUser;
}) => Promise<void>;

let resetPasswordEmailSender: ResetPasswordEmailSender | null = null;
let verificationEmailSender: VerificationEmailSender | null = null;
let preAccountSignupEmailSender: PreAccountSignupEmailSender | null = null;
let signupWelcomeEmailSender: SignupWelcomeEmailSender | null = null;

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
 * Same circular-dependency rationale as setAuthEmailSender. This remains
 * scoped to existing-account verification and related OTPs.
 */
export function setVerificationEmailSender(sender: VerificationEmailSender) {
  verificationEmailSender = sender;
}

/** Wires the separate pre-account signup OTP email port. */
export function setPreAccountSignupEmailSender(
  sender: PreAccountSignupEmailSender | null,
) {
  preAccountSignupEmailSender = sender;
}

/** Wires the welcome email sent once, after a verified signup commits. */
export function setSignupWelcomeEmailSender(
  sender: SignupWelcomeEmailSender | null,
) {
  signupWelcomeEmailSender = sender;
}

// R1: the shared Redis client for Better Auth secondary storage. Set once
// from the server composition root at boot via
// setAuthSecondaryStorageRedis(getRedisClient()). This package cannot import
// the client (or its type) from @cogito-app/api — api depends on auth, so
// that import would be circular; the SecondaryStorageRedis structural
// interface in ./secondary-storage.ts keeps the dependency one-way.
let secondaryStorageRedis: SecondaryStorageRedis | null = null;

export function setAuthSecondaryStorageRedis(
  redis: SecondaryStorageRedis,
): void {
  secondaryStorageRedis = redis;
}

// No Redis wired (tests using the singleton, or boot before wiring):
// behave exactly like today — DB-only sessions. Reads miss so better-auth
// falls through to the database row (storeSessionInDatabase below).
const nullSecondaryStorageRedis: SecondaryStorageRedis = {
  get: async () => null,
  set: async () => "OK",
  del: async () => 0,
};

// The auth singleton is constructed at import time, before the composition
// root can pass the shared client — so the wired storage resolves the
// client lazily per operation. Boot wiring takes effect for every request
// after setAuthSecondaryStorageRedis runs.
const lazySecondaryStorageRedis: SecondaryStorageRedis = {
  get: (key) => (secondaryStorageRedis ?? nullSecondaryStorageRedis).get(key),
  set: (key, value, ...args) =>
    (secondaryStorageRedis ?? nullSecondaryStorageRedis).set(
      key,
      value,
      ...args,
    ),
  del: (key) => (secondaryStorageRedis ?? nullSecondaryStorageRedis).del(key),
};

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
      // Force Google's OAuth permission screen for every authorization.
      // This is required for the verification demo and makes a previously
      // authorized account show the requested identity scopes again.
      prompt: "consent" as const,
    },
  };
}

type InternalAuthOptions = {
  secondaryStorageRedis?: SecondaryStorageRedis;
  /** Internal transaction-bound adapter used only after signup proof checks. */
  database?: typeof db;
  /** Internal email scope used by the signup transaction's create hook. */
  verifiedSignupEmail?: string;
};

function buildAuth(options?: InternalAuthOptions) {
  return betterAuth({
    database: drizzleAdapter(options?.database ?? db, {
      provider: "pg",
      schema: schema,
    }),
    // R1: Redis secondary storage over the shared client (explicit client in
    // tests, boot-wired lazy client for the singleton). Reads come from
    // Redis; storeSessionInDatabase keeps the database row as the fallback
    // and revoke path, so both stores are written on login and cleared on
    // revoke.
    secondaryStorage: createSecondaryStorage(
      options?.secondaryStorageRedis ?? lazySecondaryStorageRedis,
    ),
    // Verification values (email OTPs, password-reset tokens) route to
    // secondary storage too once it is configured — keep the database copy
    // as the fallback/consume path so a cold cache or missing Redis entry
    // never breaks verification or reset flows.
    verification: {
      storeInDatabase: true,
    },
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
      // R1: keep the database row alongside the Redis entry — reads fall
      // back to it on a cache miss/Redis outage, and revokes clear it.
      storeSessionInDatabase: true,
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
      // Existing-account email verification, sign-in, reset, and change-email
      // continue through Better Auth. Public email signup has its own
      // pre-account proof flow below.
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
        sendVerificationOnSignUp: false,
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
          // Set these fields before insert so a signup transaction does not
          // need a second connection to update the new row.
          before: async (user) => {
            const data = { ...user };
            if (
              options?.verifiedSignupEmail &&
              normalizeEmail(user.email) === options.verifiedSignupEmail
            ) {
              data.emailVerified = true;
            }
            if (
              isProductionLike(env.NODE_ENV) &&
              isConfiguredAdminEmail(user.email, env.ADMIN_EMAILS)
            ) {
              data.role = "admin";
            }
            return { data };
          },
        },
      },
    },
  });
}

/** Public auth factory retains only storage configuration. */
export function createAuth(options?: {
  secondaryStorageRedis?: SecondaryStorageRedis;
}) {
  return buildAuth(options);
}

export const auth = createAuth();

const SIGNUP_OTP_PREFIX = "pre-account-signup-otp:";
const SIGNUP_OUTCOME_PREFIX = "pre-account-signup-outcome:";
const SIGNUP_OTP_TTL_MS = 5 * 60_000;
const SIGNUP_RESEND_COOLDOWN_MS = 60_000;
const SIGNUP_OUTCOME_TTL_MS = 24 * 60 * 60_000;
const SIGNUP_OTP_MAX_ATTEMPTS = 3;

type SignupFailure = {
  ok: false;
  status: number;
  error: string;
  retryAfterSeconds?: number;
  signupAttemptId?: string;
};

const testSignupOtps = new Map<string, { otp: string; expiresAt: number }>();

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function signupOtpIdentifier(email: string) {
  return `${SIGNUP_OTP_PREFIX}${email}`;
}

function signupOutcomeIdentifier(attemptId: string) {
  return `${SIGNUP_OUTCOME_PREFIX}${attemptId}`;
}

function makeOtpDigest(email: string, otp: string) {
  return createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(`${email}\0${otp}`)
    .digest("hex");
}

function encodeSignupOtp(
  email: string,
  otp: string,
  attempts: number,
  attemptId: string,
) {
  return `${makeOtpDigest(email, otp)}:${attempts}:${attemptId}`;
}

function parseSignupOtp(value: string) {
  const [digest, attemptsValue, attemptId] = value.split(":");
  const attempts = Number(attemptsValue);
  if (
    !digest ||
    !/^[0-9a-f]{64}$/i.test(digest) ||
    !Number.isInteger(attempts) ||
    attempts < 0 ||
    !attemptId ||
    !isUuid(attemptId)
  ) {
    return null;
  }
  return { digest, attempts, attemptId };
}

function otpMatches(email: string, otp: string, digest: string) {
  const expected = Buffer.from(makeOtpDigest(email, otp), "hex");
  const stored = Buffer.from(digest, "hex");
  return expected.length === stored.length && timingSafeEqual(expected, stored);
}

function makeSignupOtp(email: string, previousDigest?: string) {
  while (true) {
    const otp = randomInt(0, 1_000_000).toString().padStart(6, "0");
    if (!previousDigest || !otpMatches(email, otp, previousDigest)) return otp;
  }
}

function lockSignupEmail(tx: typeof db, email: string) {
  return lockSignupKey(tx, `cogito-pre-account-signup-email:${email}`);
}

function lockSignupAttempt(tx: typeof db, attemptId: string) {
  return lockSignupKey(tx, `cogito-pre-account-signup-attempt:${attemptId}`);
}

function lockSignupKey(tx: typeof db, key: string) {
  return tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
  );
}

/**
 * Send an OTP before account creation. Replacements happen under an
 * email-scoped transaction lock, so old codes are invalidated and concurrent
 * send requests cannot bypass the 60-second cooldown.
 */
export async function sendPreAccountSignupOtp(input: {
  email: string;
  signupAttemptId: string;
}): Promise<
  | { ok: true; signupAttemptId: string; resendAfterSeconds: number }
  | SignupFailure
> {
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email) || !isUuid(input.signupAttemptId)) {
    return { ok: false, status: 400, error: "Enter a valid email address." };
  }
  const sender = preAccountSignupEmailSender;
  if (!sender) {
    return {
      ok: false,
      status: 502,
      error: "We couldn't send a code right now. Please try again.",
    };
  }

  let capturedOtp: { otp: string; expiresAt: number } | null = null;
  let clearCapturedOtp = false;
  const result = await db.transaction(async (tx) => {
    await lockSignupEmail(tx as unknown as typeof db, email);
    const identifier = signupOtpIdentifier(email);
    const [current] = await tx
      .select()
      .from(verificationRow)
      .where(eq(verificationRow.identifier, identifier))
      .orderBy(sql`${verificationRow.createdAt} desc`)
      .limit(1);
    const now = Date.now();
    if (current && current.createdAt.getTime() + SIGNUP_RESEND_COOLDOWN_MS > now) {
      return {
        ok: false as const,
        status: 429,
        error: "Please wait before requesting another code.",
        retryAfterSeconds: Math.ceil(
          (current.createdAt.getTime() + SIGNUP_RESEND_COOLDOWN_MS - now) /
            1000,
        ),
        signupAttemptId: parseSignupOtp(current.value)?.attemptId,
      };
    }

    await tx
      .delete(verificationRow)
      .where(eq(verificationRow.identifier, identifier));
    const otp = makeSignupOtp(email, parseSignupOtp(current?.value ?? "")?.digest);
    const rowId = randomUUID();
    await tx.insert(verificationRow).values({
      id: rowId,
      identifier,
      value: encodeSignupOtp(email, otp, 0, input.signupAttemptId),
      expiresAt: new Date(now + SIGNUP_OTP_TTL_MS),
      createdAt: new Date(now),
      updatedAt: new Date(now),
    });

    try {
      await sender({ email, otp });
    } catch (error) {
      await tx.delete(verificationRow).where(eq(verificationRow.id, rowId));
      clearCapturedOtp = true;
      if (env.NODE_ENV !== "production") {
        console.error(
          JSON.stringify({
            level: "error",
            action: "pre_account_signup_otp_send_failed",
            error: { message: String(error) },
          }),
        );
      }
      return {
        ok: false as const,
        status: 502,
        error: "We couldn't send a code right now. Please try again.",
      };
    }

    if (env.NODE_ENV === "test") {
      capturedOtp = {
        otp,
        expiresAt: now + SIGNUP_OTP_TTL_MS,
      };
    }
    return {
      ok: true as const,
      signupAttemptId: input.signupAttemptId,
      resendAfterSeconds: SIGNUP_RESEND_COOLDOWN_MS / 1000,
    };
  });
  if (env.NODE_ENV === "test") {
    if (result.ok && capturedOtp) {
      testSignupOtps.set(email, capturedOtp);
    } else if (clearCapturedOtp) {
      testSignupOtps.delete(email);
    }
  }
  return result;
}

/** Test-only reader used by the loopback E2E fixture endpoint. */
export function getPreAccountSignupOtpForTest(email: string) {
  if (env.NODE_ENV !== "test") return null;
  const normalizedEmail = normalizeEmail(email);
  const captured = testSignupOtps.get(normalizedEmail);
  if (!captured || captured.expiresAt <= Date.now()) {
    testSignupOtps.delete(normalizedEmail);
    return null;
  }
  return captured.otp;
}

class FailedBetterAuthSignup extends Error {
  constructor(readonly response: Response) {
    super("Better Auth rejected the signup.");
  }
}

async function betterAuthErrorMessage(response: Response) {
  try {
    const body = (await response.clone().json()) as { message?: unknown };
    return typeof body.message === "string"
      ? body.message
      : "Unable to create account.";
  } catch {
    return "Unable to create account.";
  }
}

/**
 * Create an account only after a valid OTP. The lock, Better Auth account
 * records, proof deletion, and outcome record share one PostgreSQL
 * transaction. A failed Better Auth response rolls back and preserves proof.
 */
export async function completePreAccountSignup(input: {
  email: string;
  password: string;
  name: string;
  otp: string;
  signupAttemptId: string;
  headers: Headers;
}): Promise<
  | { ok: true; response: Response }
  | (SignupFailure & { response?: Response })
> {
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email) || !isUuid(input.signupAttemptId)) {
    return { ok: false, status: 400, error: "Invalid signup request." };
  }
  const passwordError = assertPasswordPolicy(input.password);
  if (passwordError) {
    return { ok: false, status: 400, error: passwordError };
  }
  if (!/^\d{6}$/.test(input.otp)) {
    return { ok: false, status: 400, error: "Enter the six-digit code." };
  }

  let createdUser: CogitoUser | null = null;
  let signupResponse: Response | null = null;
  try {
    const result = await db.transaction(async (tx) => {
      await lockSignupEmail(tx as unknown as typeof db, email);
      await lockSignupAttempt(
        tx as unknown as typeof db,
        input.signupAttemptId,
      );
      const outcomeIdentifier = signupOutcomeIdentifier(input.signupAttemptId);
      const [existingOutcome] = await tx
        .select()
        .from(verificationRow)
        .where(eq(verificationRow.identifier, outcomeIdentifier))
        .limit(1);
      if (existingOutcome) {
        if (
          existingOutcome.value === email &&
          existingOutcome.expiresAt > new Date()
        ) {
          return { kind: "already-completed" as const };
        }
        if (existingOutcome.value !== email) {
          return { kind: "attempt-mismatch" as const };
        }
        await tx
          .delete(verificationRow)
          .where(eq(verificationRow.id, existingOutcome.id));
      }

      const [proof] = await tx
        .select()
        .from(verificationRow)
        .where(eq(verificationRow.identifier, signupOtpIdentifier(email)))
        .orderBy(sql`${verificationRow.createdAt} desc`)
        .limit(1);
      if (!proof) return { kind: "invalid-code" as const };
      if (proof.expiresAt <= new Date()) return { kind: "expired-code" as const };

      const parsed = parseSignupOtp(proof.value);
      if (!parsed || parsed.attemptId !== input.signupAttemptId) {
        return { kind: "invalid-code" as const };
      }
      if (parsed.attempts >= SIGNUP_OTP_MAX_ATTEMPTS) {
        return { kind: "attempt-limited" as const };
      }
      if (!otpMatches(email, input.otp, parsed.digest)) {
        const attempts = parsed.attempts + 1;
        await tx
          .update(verificationRow)
          .set({ value: `${parsed.digest}:${attempts}:${parsed.attemptId}` })
          .where(eq(verificationRow.id, proof.id));
        return {
          kind:
            attempts >= SIGNUP_OTP_MAX_ATTEMPTS
              ? ("attempt-limited" as const)
              : ("invalid-code" as const),
        };
      }

      const [existingUser] = await tx
        .select({ id: schema.user.id })
        .from(schema.user)
        .where(eq(schema.user.email, email))
        .limit(1);
      if (existingUser) return { kind: "existing-account" as const };

      const signupAuth = buildAuth({
        database: tx as unknown as typeof db,
        secondaryStorageRedis: nullSecondaryStorageRedis,
        verifiedSignupEmail: email,
      });
      const response = await signupAuth.api.signUpEmail({
        body: {
          email,
          password: input.password,
          name: input.name,
        },
        headers: input.headers,
        asResponse: true,
      });
      const body = (await response.clone().json().catch(() => null)) as
        | { user?: CogitoUser }
        | null;
      if (!response.ok || !body?.user) {
        throw new FailedBetterAuthSignup(response);
      }

      await tx
        .delete(verificationRow)
        .where(eq(verificationRow.id, proof.id));
      const now = new Date();
      await tx.insert(verificationRow).values({
        id: randomUUID(),
        identifier: outcomeIdentifier,
        value: email,
        expiresAt: new Date(now.getTime() + SIGNUP_OUTCOME_TTL_MS),
        createdAt: now,
        updatedAt: now,
      });
      return {
        kind: "created" as const,
        response,
        user: body.user,
      };
    });

    if (result.kind === "created") {
      signupResponse = result.response;
      createdUser = result.user;
      if (env.NODE_ENV === "test") testSignupOtps.delete(email);
    } else if (result.kind === "already-completed") {
      return {
        ok: false,
        status: 409,
        error: "Signup was already completed. Check the signup status before trying again.",
      };
    } else if (result.kind === "existing-account") {
      return {
        ok: false,
        status: 409,
        error: "An account already uses this email.",
      };
    } else if (result.kind === "attempt-mismatch") {
      return { ok: false, status: 409, error: "Signup attempt is not valid." };
    } else if (result.kind === "expired-code") {
      return {
        ok: false,
        status: 400,
        error: "This code has expired. Send a new code.",
      };
    } else if (result.kind === "attempt-limited") {
      return {
        ok: false,
        status: 429,
        error: "Too many incorrect codes. Send a new code.",
      };
    } else {
      return {
        ok: false,
        status: 400,
        error: "The code is incorrect or no longer valid.",
      };
    }
  } catch (error) {
    if (error instanceof FailedBetterAuthSignup) {
      return {
        ok: false,
        status: error.response.status,
        error: await betterAuthErrorMessage(error.response),
        response: error.response,
      };
    }
    console.error(
      JSON.stringify({
        level: "error",
        action: "pre_account_signup_failed",
        error: { message: String(error) },
      }),
    );
    return {
      ok: false,
      status: 500,
      error: "We couldn't complete signup. Your code is still available to retry.",
    };
  }

  if (!signupResponse || !createdUser) {
    return { ok: false, status: 500, error: "We couldn't complete signup." };
  }
  if (signupWelcomeEmailSender) {
    try {
      await signupWelcomeEmailSender({ user: createdUser });
    } catch (error) {
      console.error(
        JSON.stringify({
          level: "error",
          action: "signup_welcome_email_send_failed",
          userId: createdUser.id,
          error: { message: String(error) },
        }),
      );
    }
  }
  return { ok: true, response: signupResponse };
}

/** Read the signup result after a browser loses the create response. */
export async function getPreAccountSignupOutcome(input: {
  email: string;
  signupAttemptId: string;
}) {
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email) || !isUuid(input.signupAttemptId)) return false;
  const [outcome] = await db
    .select({
      value: schema.verification.value,
      expiresAt: schema.verification.expiresAt,
    })
    .from(schema.verification)
    .where(
      eq(
        schema.verification.identifier,
        signupOutcomeIdentifier(input.signupAttemptId),
      ),
    )
    .limit(1);
  return outcome?.value === email && outcome.expiresAt > new Date();
}
