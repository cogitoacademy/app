import { initLogger } from "evlog";

import { createServer } from "./routes";
import { env } from "@cogito-app/env/server";
import { setAuthEmailSender } from "@cogito-app/auth";
import { buildResetPasswordEmail } from "@cogito-app/auth/reset-password-email";
import { log } from "@cogito-app/api/lib/logger";
import { sql } from "drizzle-orm";
import { initScheduler, shutdownScheduler } from "./scheduler";

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

const app = createServer();
const port = env.PORT;

await waitForDb();

const { services } = await import("@cogito-app/api/services");
setAuthEmailSender(async ({ user, url }) => {
  if (env.NODE_ENV !== "production") {
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

const server = app.listen(port, () => {
  log({ level: "info", action: "server_started", url: env.BETTER_AUTH_URL });
});

await initScheduler();

async function gracefulShutdown(signal: string) {
  log({ level: "info", action: "shutdown_signal", signal });
  server.stop();
  await shutdownScheduler();
  try {
    const { db } = await import("@cogito-app/db");
    await db.$client.end();
    log({ level: "info", action: "db_pool_drained" });
  } catch {
    log({ level: "info", action: "db_pool_drain_skipped" });
  }
  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
