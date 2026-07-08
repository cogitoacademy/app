import { db } from "./db";
import type { DbType } from "./db";

export type TxClient = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbOrTx = DbType | TxClient;
