import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const faviconPlugin = () => ({
  name: "favicon-env-swap",
  transformIndexHtml: {
    order: "pre" as const,
    handler(html: string, ctx: { server?: { config?: { mode?: string } } }) {
      const mode =
        ctx.server?.config?.mode ?? process.env.NODE_ENV ?? "production";
      const isDevelopment = mode === "development";
      const href = isDevelopment ? "/favicon-dev.svg" : "/favicon.svg";
      const type = "image/svg+xml";
      return html
        .replace("%FAVICON_TYPE%", type)
        .replace("%FAVICON_HREF%", href);
    },
  },
});

export default defineConfig({
  // The guarded T05 server shares linked dependencies with dev; keep Vite's
  // optimize cache separate so the two servers do not block each other's lock.
  ...(process.env.T05_ENROLLMENT_TEST_DB_PORT === "6769" && {
    cacheDir:
      process.env.VITE_TEST_CACHE_DIR ?? "node_modules/.vite-t05-enrollment",
  }),
  server: {
    port: Number(process.env.WEB_PORT ?? 3000),
    strictPort: !!process.env.WEB_PORT,
    host: true,
    watch: { usePolling: true, interval: 1000 },
  },
  resolve: {
    tsconfigPaths: true,
  },
  build: {
    chunkSizeWarningLimit: 800,
  },
  plugins: [
    faviconPlugin(),
    tailwindcss(),
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
  ],
});
