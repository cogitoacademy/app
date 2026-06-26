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
    PAYMENT_PROVIDER: z.enum(["stub", "midtrans", "xendit"]).default("stub"),
    PAYMENT_WEBHOOK_SECRET: z.string().min(32),
    COMPETITION_CALENDAR_URL: z
      .string()
      .url()
      .default("https://cogitoacademy.id/en/calendar"),
    KNOWLEDGE_BANK_URL: z
      .string()
      .url()
      .default("https://cogitoacademy.id/knowledge-bank"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
