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
      const href = isDevelopment ? "/favicon-dev.svg" : "/c%20of%20cogito.png";
      const type = isDevelopment ? "image/svg+xml" : "image/png";
      return html
        .replace("%FAVICON_TYPE%", type)
        .replace("%FAVICON_HREF%", href);
    },
  },
});

export default defineConfig({
  server: {
    port: Number(process.env.WEB_PORT ?? 3000),
    strictPort: !!process.env.WEB_PORT,
    host: true,
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
