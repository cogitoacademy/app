import config from "./vite.classes-layout.config";
import path from "node:path";
export default {
  ...config,
  cacheDir: path.resolve(
    import.meta.dirname,
    "../../tmp/kol-settlement-synthetic-vite-cache",
  ),
};
