// Run Vite directly on Bun: the Windows CLI shim can spawn Node and stall
// before startup in linked worktrees. Bun loads the TypeScript config natively.
import config from "./playwright.config";
const servers = config.webServer;
if (!Array.isArray(servers))
  throw new Error("Expected the repository web servers");
for (const server of servers) {
  if (server.command?.includes("--mode test")) {
    const command = server.command.replace(
      "run --bun dev -- --mode test",
      "./node_modules/vite/bin/vite.js dev --mode test --configLoader native",
    );
    if (command === server.command)
      throw new Error("Unexpected Vite test startup command");
    server.command = command;
  }
}
export default config;
