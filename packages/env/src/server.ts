// eslint-disable-next-line import/no-unassigned-import
import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

import { DEFAULT_PRODUCTION_ADMIN_EMAIL } from "./admin";
import { isProductionLike } from "./node-env";

// H1: z.coerce.boolean() treats the string "false" (and "0", "FALSE") as
// truthy — an ops guard that sets TRUST_PROXY=false would actually ENABLE
// proxy trust. All boolean env vars must go through this preprocess so the
// string forms parse as their literal value and an empty string falls back to
// the schema default. Unknown strings fail loudly (z.boolean()) instead of
// silently coercing to a boolean.
function boolFromEnv(v: unknown): unknown {
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (trimmed === "") return undefined; // treat as unset → .default() applies
    const lower = trimmed.toLowerCase();
    if (lower === "true" || lower === "1") return true;
    if (lower === "false" || lower === "0") return false;
    return trimmed;
  }
  return v;
}

const boolSchema = (defaultValue: boolean) =>
  z.preprocess((v) => {
    // Normalize an empty string to the default so `.default()` applies for
    // direct schema.parse() calls too (createEnv's emptyStringAsUndefined
    // only handles process.env, not explicit "" values).
    if (v === undefined || v === "") return defaultValue;
    return boolFromEnv(v);
  }, z.boolean());

const serverShape = {
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  CORS_ORIGIN: z.url(),
  NODE_ENV: z
    .enum(["development", "production", "test", "staging"])
    .default("development"),
  // Comma-separated emails that may be bootstrapped as admins in
  // production-like environments. The default keeps the initial operator
  // account deterministic while additional admins remain possible through
  // the normal admin role-management flow.
  ADMIN_EMAILS: z.string().default(DEFAULT_PRODUCTION_ADMIN_EMAIL),
  PAYMENT_PROVIDER: z.enum(["stub", "xendit"]).default("stub"),
  STUB_WEBHOOK_ALLOWED: boolSchema(false),
  PAYMENT_WEBHOOK_SECRET: z.string().min(32),
  SANITY_PROJECT_ID: z.string().min(1).default("skfmwuke"),
  SANITY_DATASET: z.string().min(1).default("development"),
  SANITY_API_VERSION: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .default("2024-03-01"),
  SANITY_API_TOKEN: z.string().min(1).optional(),
  WEBHOOK_ALLOWED_IPS: z.string().optional(),
  XENDIT_SECRET_KEY: z.string().min(1).optional(),
  XENDIT_WEBHOOK_TOKEN: z.string().min(1).optional(),
  XENDIT_SUCCESS_REDIRECT_URL: z.string().url().optional(),
  XENDIT_FAILURE_REDIRECT_URL: z.string().url().optional(),
  XENDIT_DEFAULT_PAYMENT_METHOD: z
    .enum(["ewallet_ovo", "qris", "va_bca"])
    .default("ewallet_ovo"),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  PORT: z.coerce.number().default(3001),
  TRUST_PROXY: boolSchema(false),
  SESSION_COOKIE_CACHE_MAX_AGE: z.coerce.number().default(60),
  REDIS_URL: z.string().url(),
  SCHEDULER_ENABLED: boolSchema(false),
  GOOGLE_CLIENT_EMAIL: z.string().email().optional(),
  GOOGLE_PRIVATE_KEY: z.string().optional(),
  GOOGLE_CALENDAR_ID: z.string().optional(),
  GOOGLE_IMPERSONATED_USER: z.string().email().optional(),
  GOOGLE_MEET_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_MEET_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_MEET_REFRESH_TOKEN: z.string().min(1).optional(),
  GOOGLE_MEET_ENABLED: boolSchema(false),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("noreply@cogitoacademy.id"),
  METRICS_TOKEN: z.string().optional(),
  DB_SSL_ENABLED: boolSchema(true),
  DB_SSL_REJECT_UNAUTHORIZED: boolSchema(true),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_URL: z.url().optional(),
  UPLOAD_DIR: z.string().default("./uploads"),
} as const;

export const serverEnvSchema = z.object(serverShape).superRefine((val, ctx) => {
  if (val.PAYMENT_PROVIDER === "xendit") {
    if (!val.XENDIT_SECRET_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["XENDIT_SECRET_KEY"],
        message: "required when PAYMENT_PROVIDER=xendit",
      });
    }
    if (!val.XENDIT_WEBHOOK_TOKEN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["XENDIT_WEBHOOK_TOKEN"],
        message: "required when PAYMENT_PROVIDER=xendit",
      });
    }
    // P3.7: the 2024-11-11 payment-request schema requires the success and
    // failure return URLs (channel_properties) — an empty default would make
    // every checkout redirect fail.
    if (!val.XENDIT_SUCCESS_REDIRECT_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["XENDIT_SUCCESS_REDIRECT_URL"],
        message: "required when PAYMENT_PROVIDER=xendit",
      });
    }
    if (!val.XENDIT_FAILURE_REDIRECT_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["XENDIT_FAILURE_REDIRECT_URL"],
        message: "required when PAYMENT_PROVIDER=xendit",
      });
    }
  }

  // P4.1 (X2): in production-like environments (production + staging) the
  // Resend API key is mandatory — without it the email module silently uses
  // the stub provider and every critical email (invites, booking
  // confirmations, refunds, alerts) is suppressed with no alert. EMAIL_FROM
  // must not be the dev default either: the sending domain has to be verified
  // at Resend (RUNBOOK).
  if (isProductionLike(val.NODE_ENV)) {
    if (!val.RESEND_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["RESEND_API_KEY"],
        message:
          "required when NODE_ENV is production/staging — the stub email provider would silently suppress all emails",
      });
    }
    if (val.EMAIL_FROM === "noreply@cogitoacademy.id") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["EMAIL_FROM"],
        message:
          "must be a verified Resend sending address in production/staging (the dev default is not verified)",
      });
    }
  }

  // P4.2 (X3): GOOGLE_MEET_ENABLED=true requires a complete credential set —
  // either the OAuth triple or the service-account email+key. A partial set
  // would silently fall back to manual links (or, worse, land events on the
  // SA's own calendar when GOOGLE_IMPERSONATED_USER is missing).
  if (val.GOOGLE_MEET_ENABLED) {
    const oauthComplete =
      Boolean(val.GOOGLE_MEET_CLIENT_ID || val.GOOGLE_CLIENT_ID) &&
      Boolean(val.GOOGLE_MEET_CLIENT_SECRET || val.GOOGLE_CLIENT_SECRET) &&
      Boolean(val.GOOGLE_MEET_REFRESH_TOKEN);
    const saComplete =
      Boolean(val.GOOGLE_CLIENT_EMAIL) && Boolean(val.GOOGLE_PRIVATE_KEY);

    if (!oauthComplete && !saComplete) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GOOGLE_MEET_ENABLED"],
        message:
          "GOOGLE_MEET_ENABLED=true requires a complete credential set: the OAuth triple (GOOGLE_MEET_CLIENT_ID + GOOGLE_MEET_CLIENT_SECRET + GOOGLE_MEET_REFRESH_TOKEN) OR the service account (GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY)",
      });
    }

    if (saComplete && !oauthComplete && !val.GOOGLE_IMPERSONATED_USER) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GOOGLE_IMPERSONATED_USER"],
        message:
          "required in service-account mode — without domain-wide delegation events land on the SA's own calendar and never produce a Meet URL",
      });
    }
  }

  // P4.3 (X4): in production-like environments (production + staging) R2 is
  // mandatory — without it uploads silently write to the container-local
  // UPLOAD_DIR and are lost on every redeploy. And when R2 IS configured,
  // R2_PUBLIC_URL must be set too, otherwise objects are written but
  // unreachable (GET /uploads/* is disabled when R2 is configured).
  if (isProductionLike(val.NODE_ENV)) {
    const r2Vars = [
      val.R2_ACCOUNT_ID,
      val.R2_ACCESS_KEY_ID,
      val.R2_SECRET_ACCESS_KEY,
      val.R2_BUCKET,
    ];
    const anyR2 = r2Vars.some(Boolean);
    const allR2 = r2Vars.every(Boolean);
    if (anyR2 && !allR2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["R2_ACCOUNT_ID"],
        message:
          "partial R2 configuration: all of R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET are required together",
      });
    }
    if (allR2 && !val.R2_PUBLIC_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["R2_PUBLIC_URL"],
        message:
          "required when R2 is configured — objects would be unreachable (GET /uploads/* is disabled when R2 is set)",
      });
    }
  }

  // D3: in production-like environments the scheduler must be enabled —
  // a prod server started with SCHEDULER_ENABLED=false silently skips every
  // booking-expiry / hold-release / email / SLA job while /health stays ok.
  if (isProductionLike(val.NODE_ENV) && val.SCHEDULER_ENABLED !== true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["SCHEDULER_ENABLED"],
      message:
        "must be true when NODE_ENV is production/staging — a prod server without the scheduler silently skips booking expiry, hold release, email dispatch and SLA escalation",
    });
  }

  // D2: with PAYMENT_PROVIDER=xendit in production-like environments the
  // webhook IP allowlist is mandatory — an empty WEBHOOK_ALLOWED_IPS means
  // every IP can reach the webhook endpoint (signature still gates, but the
  // allowlist is the second defense layer; RUNBOOK requires it at deploy).
  if (
    isProductionLike(val.NODE_ENV) &&
    val.PAYMENT_PROVIDER === "xendit" &&
    !val.WEBHOOK_ALLOWED_IPS
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["WEBHOOK_ALLOWED_IPS"],
      message:
        "required when PAYMENT_PROVIDER=xendit in production/staging — an empty allowlist leaves the webhook endpoint open to every IP",
    });
  }
});

export const env = createEnv({
  server: serverShape,
  createFinalSchema: () => serverEnvSchema,
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
