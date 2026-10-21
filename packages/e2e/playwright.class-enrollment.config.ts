// Linked worktrees share Vite's config-bundle cache; runner avoids that startup lock.
import config from "./playwright.config";
const servers = config.webServer;
if (!Array.isArray(servers))
  throw new Error("Expected the repository web servers");
for (const server of servers) {
  if (server.command?.includes("--mode test"))
    server.command += " --configLoader runner";
}
export default config;
