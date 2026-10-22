import { realpathSync } from "node:fs";
import path from "node:path";
import config from "../../apps/web/vite.config";

const workspaceRoot = path.resolve(import.meta.dirname,"../..");
export default {
  ...config,
  cacheDir: process.env.VITE_TEST_CACHE_DIR ?? path.join(workspaceRoot,"tmp/classes-vite-cache"),
  server: {
    ...config.server,
    fs: {
      // Linked worktrees share installed packages; allow their fonts/UI sources.
      allow: [workspaceRoot,realpathSync(path.join(workspaceRoot,"node_modules")),realpathSync(path.join(workspaceRoot,"apps/web/node_modules/@cogito-app/ui"))],
    },
  },
};
