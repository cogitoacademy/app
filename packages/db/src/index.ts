import { env } from "@cogito-app/env/server";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

import * as schema from "./schema";

const poolConfig: PoolConfig = {
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  maxUses: 7500,
  allowExitOnIdle: false,
  connectionString: env.DATABASE_URL,
  ...(env.NODE_ENV === "production"
    ? { ssl: { rejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED } }
    : {}),
};

if (env.NODE_ENV === "production" && !env.DB_SSL_REJECT_UNAUTHORIZED) {
  console.warn(
    "WARNING: DB_SSL_REJECT_UNAUTHORIZED is false in production. SSL certificate verification is disabled.",
  );
}

const pool = new Pool(poolConfig);

pool.on("error", (err) => {
  console.error("Unexpected database pool error:", err);
});

export function createDb() {
  return drizzle(pool, { schema });
}

export const db = createDb();
