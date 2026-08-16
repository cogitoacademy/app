import { initLogger } from "evlog";

import { env } from "@cogito-app/env/server";
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

// IMPORTANT: @cogito-app/db (the drizzle schema graph) must be imported BEFORE
// ./routes, which loads evlog's Elysia plugin. Evaluating the schema modules
// while evlog/elysia is already loaded segfaults Bun 1.3.14 (engine bug —
// "panic: Segmentation fault", see bun.report on the server boot crash).
// Keep this import order; do not hoist ./routes or ./scheduler back to the top.
const { createServer } = await import("./routes");
const { initScheduler, shutdownScheduler } = await import("./scheduler");

const app = createServer();
const port = env.PORT;

const server = app.listen(port, () => {
  log({ level: "info", action: "server_started", url: env.BETTER_AUTH_URL });
});

await initScheduler();

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
