import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const absoluteOrSameOriginRelativeUrl = z
  .string()
  .min(1)
  .refine((value) => {
    // Same-origin relative paths (e.g. "/rpc" in production behind Traefik)
    // are valid and resolved against window.location.origin at runtime.
    if (value.startsWith("/")) return true;
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }, "VITE_SERVER_URL must be an absolute URL or a same-origin relative path (e.g. /rpc)");

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    // Optional: when unset, apps/web/src/lib/server-url.ts applies the
    // dev default (http://localhost:3001) or the production default (/rpc).
    VITE_SERVER_URL: absoluteOrSameOriginRelativeUrl.optional(),
  },
  runtimeEnv: (import.meta as any).env,
  emptyStringAsUndefined: true,
});
