import { env } from "@cogito-app/env/web";

import { resolveServerUrl } from "./resolve-server-url";

export const serverUrl = resolveServerUrl(
  env.VITE_SERVER_URL,
  typeof window === "undefined" ? undefined : window.location.hostname,
  import.meta.env.DEV,
);
