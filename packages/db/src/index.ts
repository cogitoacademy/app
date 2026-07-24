import { env } from "@cogito-app/env/server";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

if (env.NODE_ENV === "production" && !env.DB_SSL_REJECT_UNAUTHORIZED) {
  console.warn(
    "WARNING: DB_SSL_REJECT_UNAUTHORIZED is false in production. SSL certificate verification is disabled.",
  );
}

export function createDb(connectionString?: string) {
  const url = connectionString ?? env.DATABASE_URL;
  const client = postgres(url, {
    max: 20,
    idle_timeout: 20,
    connect_timeout: 10,
    ...(env.NODE_ENV === "production" && {
      ssl: { rejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED },
    }),
    ...(env.NODE_ENV === "development" && {
      onquery: (query: { sql: string; params: unknown[] }) => {
        const redactedParams = query.params.map((p) =>
          typeof p === "string" && (p.includes("@") || p.length > 100)
            ? "[REDACTED]"
            : p,
        );
        console.log(`[DB] ${query.sql} | ${JSON.stringify(redactedParams)}`);
      },
    }),
  });
  return drizzle(client, { schema });
}

export const db = createDb();
