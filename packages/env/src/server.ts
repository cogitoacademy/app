// eslint-disable-next-line import/no-unassigned-import
import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    CORS_ORIGIN: z.url(),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    PAYMENT_PROVIDER: z.enum(["stub", "xendit"]).default("stub"),
    PAYMENT_WEBHOOK_SECRET: z.string().min(32),
    COMPETITION_CALENDAR_URL: z
      .string()
      .url()
      .default("https://cogitoacademy.id/en/calendar"),
    KNOWLEDGE_BANK_URL: z
      .string()
      .url()
      .default("https://cogitoacademy.id/knowledge-bank"),
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
    SESSION_COOKIE_CACHE_MAX_AGE: z.coerce.number().default(60),
    SENTRY_DSN: z.string().url().optional(),
    SENTRY_ENVIRONMENT: z.string().default("development"),
    REDIS_URL: z.string().url().optional(),
    SCHEDULER_ENABLED: z.coerce.boolean().default(false),
    GOOGLE_CLIENT_EMAIL: z.string().email().optional(),
    GOOGLE_PRIVATE_KEY: z.string().optional(),
    GOOGLE_CALENDAR_ID: z.string().optional(),
    GOOGLE_IMPERSONATED_USER: z.string().email().optional(),
    GOOGLE_MEET_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_MEET_CLIENT_SECRET: z.string().min(1).optional(),
    GOOGLE_MEET_REFRESH_TOKEN: z.string().min(1).optional(),
    GOOGLE_MEET_ENABLED: z.coerce.boolean().default(false),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().default("noreply@cogitoacademy.id"),
    METRICS_TOKEN: z.string().optional(),
    DB_SSL_REJECT_UNAUTHORIZED: z.coerce.boolean().default(true),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
