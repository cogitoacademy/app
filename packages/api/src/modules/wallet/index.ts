import type { DbType } from "../../lib/db";
import { createWalletRepo } from "./wallet.repo";
import { createWalletService } from "./wallet.service";
import { createWalletHandler } from "./wallet.handler";
import type { WalletPort } from "./wallet.service";
import type { WalletSnapshot } from "./wallet.service";
import type { WalletHandler } from "./wallet.handler";
import type { XenditMode } from "../payment/xendit-payment.provider";

export type WalletModule = ReturnType<typeof createWalletModule>;

export function createWalletModule(deps: {
  db: DbType;
  xenditMode?: XenditMode;
}) {
  const repo = createWalletRepo();
  const service = createWalletService(repo, deps.db);
  const handler = createWalletHandler({
    wallet: service,
    xenditMode: deps.xenditMode,
  });
  return { service, handler };
}

export type { WalletPort, WalletSnapshot, WalletHandler };
