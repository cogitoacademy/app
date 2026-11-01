// Node avoids the Bun native-loader startup stall in linked Windows worktrees.
import config from "./playwright.class-enrollment.config";
if (!Array.isArray(config.webServer)) throw new Error("Expected server list");
for (const server of config.webServer) {
  if (server.command?.includes("vite/bin/vite.js")) {
    server.command =
      "node ./node_modules/vite/bin/vite.js dev --mode test --configLoader runner";
  }
}
export default config;
