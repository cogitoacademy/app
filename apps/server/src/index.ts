import { initLogger } from "evlog";

import { env } from "@cogito-app/env/server";
import { isProductionLike } from "@cogito-app/env/node-env";
import {
  setAuthEmailSender,
  setVerificationEmailSender,
} from "@cogito-app/auth";
import { buildResetPasswordEmail } from "@cogito-app/auth/reset-password-email";
import { buildVerificationEmail } from "@cogito-app/auth/verification-email";
import { log } from "@cogito-app/api/lib/logger";
import { sql } from "drizzle-orm";

initLogger({
  env: { service: "cogito-app-server" },
});

process.on("unhandledRejection", (reason) => {
  log({
    level: "error",
    action: "unhandled_rejection",
    error: { message: String(reason) },
  });
});

process.on("uncaughtException", (error) => {
  log({
    level: "error",
    action: "uncaught_exception",
    error: { message: String(error), stack: error.stack },
  });
  setTimeout(() => process.exit(1), 1000);
});

async function waitForDb(maxAttempts = 10, delayMs = 2000): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const { db } = await import("@cogito-app/db");
      // eslint-disable-next-line no-await-in-loop
      await db.execute(sql`SELECT 1`);
      log({
        level: "info",
        action: "db_connected",
        message: `Database connected on attempt ${attempt}`,
      });
      return;
    } catch (error) {
      log({
        level: "warn",
        action: "db_retry",
        message: `Database not ready, attempt ${attempt}/${maxAttempts}`,
        error: { message: String(error) },
      });
      if (attempt === maxAttempts) throw error;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

await waitForDb();

// Reconcile configured operator accounts before accepting requests. This
// promotes an existing production account without demoting other admins.
const { ensureConfiguredProductionAdmins } = await import("./admin-bootstrap");
await ensureConfiguredProductionAdmins();

// IMPORTANT: @cogito-app/db (the drizzle schema graph) must be imported BEFORE
// ./routes, which loads evlog's Elysia plugin. Evaluating the schema modules
// while evlog/elysia is already loaded segfaults Bun 1.3.14 (engine bug —
// "panic: Segmentation fault", see bun.report on the server boot crash).
// Keep this import order; do not hoist ./routes or ./scheduler back to the top.
const { createServer } = await import("./routes");
const { initScheduler, shutdownScheduler } = await import("./scheduler");

const app = createServer();
const port = env.PORT;

const { services } = await import("@cogito-app/api/services");

// Xendit Test/Live is selected by the API key, while XENDIT_MODE records the
// intended deployment mode and drives the production UAT allowlist. Log only
// the non-secret mode so operators can verify a Coolify rollout safely.
if (env.PAYMENT_PROVIDER === "xendit") {
  log({
    level: "info",
    action: "payment_provider_configured",
    provider: "xendit",
    xenditMode: env.XENDIT_MODE,
  });
}

setAuthEmailSender(async ({ user, url }) => {
  if (!isProductionLike(env.NODE_ENV)) {
    log({
      level: "info",
      action: "reset_password_link",
      userId: user.id,
      url,
    });
  }
  const { subject, html } = buildResetPasswordEmail({
    name: user.name,
    url,
  });
  await services.email.send({
    to: user.email,
    subject,
    html,
    category: "auth",
  });
});

// P2/G2: signup welcome copy and email verification OTP share one delivery;
// other OTP types remain purpose-specific.
setVerificationEmailSender(async ({ email, otp, type, isSignup }) => {
  if (!isProductionLike(env.NODE_ENV)) {
    log({
      level: "info",
      action: "verification_otp",
      email,
      type,
      otp,
    });
  }
  const isSignupVerification =
    type === "email-verification" && isSignup === true;
  const { subject, html } = buildVerificationEmail({
    name: email.split("@")[0] ?? email,
    otp,
    expiresInMinutes: 5,
    includeWelcome: isSignupVerification,
    loginUrl: isSignupVerification
      ? `${env.CORS_ORIGIN.replace(/\/$/, "")}/login`
      : undefined,
  });
  await services.email.send({
    to: email,
    subject,
    html,
    category: "auth",
  });
});

const server = app.listen(port, () => {
  log({ level: "info", action: "server_started", url: env.BETTER_AUTH_URL });
});

await initScheduler();

// P4.2/X3: boot-time Google Meet probe — a broken credential set (or missing
// GOOGLE_IMPERSONATED_USER in SA mode) must fail loudly at boot, not silently
// at the first booking.
if (env.GOOGLE_MEET_ENABLED && services.meeting?.probe) {
  const probeResult = await services.meeting.probe();
  if (!probeResult.ok) {
    log({
      level: "error",
      action: "google_meet_boot_probe_failed",
      message:
        "Google Meet is enabled but the boot probe failed — meetings will silently fall back to manual links. Fix credentials before launch.",
      error: { message: probeResult.error ?? "unknown" },
    });
  }
}

async function gracefulShutdown(signal: string) {
  log({ level: "info", action: "shutdown_signal", signal });
  // C8: bound the drain — if the DB pool (or anything else) hangs, force-exit
  // instead of letting the container time out and SIGKILL us.
  const forceExit = setTimeout(() => {
    log({ level: "warn", action: "shutdown_force_exit" });
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.stop();
  await shutdownScheduler();
  try {
    const { getRedisClient } = await import("@cogito-app/api/lib/redis");
    await getRedisClient().quit();
    log({ level: "info", action: "redis_quit" });
  } catch {
    log({ level: "info", action: "redis_quit_skipped" });
  }
  try {
    const { db } = await import("@cogito-app/db");
    await db.$client.end();
    log({ level: "info", action: "db_pool_drained" });
  } catch {
    log({ level: "info", action: "db_pool_drain_skipped" });
  }
  clearTimeout(forceExit);
  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
