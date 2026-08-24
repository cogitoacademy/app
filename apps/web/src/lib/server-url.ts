import { env } from "@cogito-app/env/web";

import { resolveServerUrl } from "./resolve-server-url";

// VITE_SERVER_URL is optional at build time. Defaults: dev -> API on
// localhost:3001 (matching apps/web/.env.example), otherwise -> the
// production API subdomain. The Docker build and CI pass the same absolute
// production URL explicitly.
const configuredUrl =
  env.VITE_SERVER_URL ??
  (import.meta.env.DEV
    ? "http://localhost:3001"
    : "https://api.cogitoacademy.id");

export const serverUrl = resolveServerUrl(
  configuredUrl,
  typeof window === "undefined" ? undefined : window.location.hostname,
  import.meta.env.DEV,
);
