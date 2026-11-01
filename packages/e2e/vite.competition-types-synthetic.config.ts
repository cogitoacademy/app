import config from "./vite.classes-layout.config";
import path from "node:path";
export default {
  ...config,
  cacheDir: path.resolve(
    import.meta.dirname,
    `../../tmp/competition-types-synthetic-vite-cache-${process.env.WEB_PORT ?? "3376"}`,
  ),
};
