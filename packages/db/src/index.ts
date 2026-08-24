import { env } from "@cogito-app/env/server";
import { isProductionLike } from "@cogito-app/env/node-env";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export function warnIfInsecureProductionSsl(
  nodeEnv: string,
  sslEnabled: boolean,
  rejectUnauthorized: boolean,
) {
  if (isProductionLike(nodeEnv) && sslEnabled && !rejectUnauthorized) {
    console.warn(
      "WARNING: DB_SSL_REJECT_UNAUTHORIZED is false while DB SSL is enabled in production/staging. SSL certificate verification is disabled.",
    );
  }
}

warnIfInsecureProductionSsl(
  env.NODE_ENV,
  env.DB_SSL_ENABLED,
  env.DB_SSL_REJECT_UNAUTHORIZED,
);

const SENSITIVE_PARAM = /(password|secret|token|authorization|cookie|bearer)/i;
const SECRET_SHAPED = /^(sk_|whsec_|xox[baprs]-|eyJ[a-zA-Z0-9_-]+\.)/i;

/**
 * Redacts values that may contain credentials before they are logged.
 *
 * Masks email-like values (`@`), bulk payloads (> 100 chars), and secret-shaped
 * strings (provider keys, webhook tokens, JWTs). Short plain values (uuids,
 * names) are kept so dev logs stay readable.
 *
 * @param value - the raw query parameter value
 * @returns the redacted value, or the original when clearly not sensitive
 */
function redactParam(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (value.includes("@") || value.length > 100) return "[REDACTED]";
  if (value.length > 8 && SECRET_SHAPED.test(value)) return "[REDACTED]";
  if (SENSITIVE_PARAM.test(value)) return "[REDACTED]";
  return value;
}

export function createDb(connectionString?: string) {
  const url = connectionString ?? env.DATABASE_URL;
  const client = postgres(url, {
    max: 20,
    idle_timeout: 20,
    connect_timeout: 10,
    connection: {
      statement_timeout: 30_000,
    },
    ssl:
      isProductionLike(env.NODE_ENV) && env.DB_SSL_ENABLED
        ? { rejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED }
        : false,
    ...(env.NODE_ENV === "development" && {
      onquery: (query: { sql: string; params: unknown[] }) => {
        const redactedParams = query.params.map((p) => redactParam(p));
        console.log(`[DB] ${query.sql} | ${JSON.stringify(redactedParams)}`);
      },
    }),
  });
  return drizzle(client, { schema });
}

export const db = createDb();
