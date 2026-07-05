import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const faviconPlugin = () => ({
  name: "favicon-env-swap",
  transformIndexHtml: {
    order: "pre" as const,
    handler(html: string, ctx: { server?: { config?: { mode?: string } } }) {
      const mode = ctx.server?.config?.mode ?? process.env.NODE_ENV ?? "production";
      const href = mode === "development" ? "/favicon-dev.svg" : "/favicon.svg";
      return html.replace("%FAVICON_HREF%", href);
    },
  },
});

export default defineConfig({
  server: {
    port: 3000,
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
