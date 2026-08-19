import { env } from "@cogito-app/env/web";

import { resolveServerUrl } from "./resolve-server-url";

// VITE_SERVER_URL is optional at build time (the Docker build sets /rpc, CI
// and plain `bun run dev` set nothing). Defaults: dev -> API on localhost:3001
// (matching apps/web/.env.example), otherwise -> same-origin /rpc (Caddy routes
// app.cogitoacademy.id/rpc/* to the server container).
const configuredUrl =
  env.VITE_SERVER_URL ??
  (import.meta.env.DEV ? "http://localhost:3001" : "/rpc");

export const serverUrl = resolveServerUrl(
  configuredUrl,
  typeof window === "undefined" ? undefined : window.location.hostname,
  import.meta.env.DEV,
);
