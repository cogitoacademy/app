import { db } from "./db";
import type { DbType } from "./db";

export type TxClient = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbOrTx = DbType | TxClient;

export async function withTx<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
  return db.transaction(fn);
}
