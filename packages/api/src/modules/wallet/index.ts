import type { DbType } from "../../lib/db";
import { createWalletRepo } from "./wallet.repo";
import { createWalletService } from "./wallet.service";
import { createWalletHandler } from "./wallet.handler";
import type { WalletPort } from "./wallet.service";
import type { WalletSnapshot } from "./wallet.service";
import type { WalletHandler } from "./wallet.handler";

export type WalletModule = ReturnType<typeof createWalletModule>;

export function createWalletModule(deps: { db: DbType }) {
  const repo = createWalletRepo();
  const service = createWalletService(repo, deps.db);
  const handler = createWalletHandler({ wallet: service });
  return { service, handler };
}

export type { WalletPort, WalletSnapshot, WalletHandler };
