import { initLogger } from "evlog";

import { createServer } from "./routes";

initLogger({
  env: { service: "cogito-app-server" },
});

const app = createServer();

const server = app.listen(3001, () => {
  console.log("Server is running on http://localhost:3001");
});

async function gracefulShutdown(signal: string) {
  console.log(`\n${signal} received, shutting down gracefully...`);
  server.stop();
  try {
    const { db } = await import("@cogito-app/db");
    await db.$client.end();
    console.log("Database pool drained.");
  } catch {
    console.log("Database pool drain skipped.");
  }
  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
