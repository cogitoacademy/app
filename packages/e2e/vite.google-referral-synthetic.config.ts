import config from "./vite.classes-layout.config";
import { realpathSync } from "node:fs";
import path from "node:path";
export default {
  ...config,
  cacheDir: path.resolve(
    import.meta.dirname,
    "../../tmp/google-referral-synthetic-vite-cache",
  ),
  server: {
    ...config.server,
    fs: {
      allow: [
        ...config.server.fs.allow,
        realpathSync(
          path.resolve(import.meta.dirname, "../../node_modules/.bun"),
        ),
      ],
    },
  },
};
