import type { DbType } from "./db";
import type { TxClient } from "./tx";

function isDeadlock(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (!current || typeof current !== "object") return false;
    if ("code" in current && current.code === "40P01") return true;
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}

/** Retry only rolled-back PostgreSQL deadlocks; callbacks must contain DB work only. */
export async function settlementTransaction<T>(
  db: Pick<DbType, "transaction">,
  work: (tx: TxClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await db.transaction(work);
    } catch (error) {
      if (attempt >= 2 || !isDeadlock(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 10));
    }
  }
}
