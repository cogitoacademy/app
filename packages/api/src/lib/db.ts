import { db, createDb } from "@cogito-app/db";

export { db };

export type DbType = ReturnType<typeof createDb>;
