import { initLogger } from "evlog";

import { createServer } from "./routes";
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

const server = app.listen(port, () => {
  log({ level: "info", action: "server_started", url: env.BETTER_AUTH_URL });
});

async function gracefulShutdown(signal: string) {
  log({ level: "info", action: "shutdown_signal", signal });
  server.stop();
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
