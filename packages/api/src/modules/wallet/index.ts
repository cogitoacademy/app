import type { DbType } from "../../lib/db";
import { createWalletRepo } from "./wallet.repo";
import { createWalletService } from "./wallet.service";
import { createWalletHandler } from "./wallet.handler";
import type { WalletPort } from "./wallet.service";
import type { WalletSnapshot } from "./wallet.service";
import type { WalletHandler } from "./wallet.handler";
import { env } from "@cogito-app/env/server";

export type WalletModule = ReturnType<typeof createWalletModule>;

export function createWalletModule(deps: { db: DbType }) {
  const repo = createWalletRepo(deps.db);
  const service = createWalletService(repo, deps.db);
  const handler = createWalletHandler({
    wallet: service,
    competitionCalendarUrl: env.COMPETITION_CALENDAR_URL,
  });
  return { service, handler };
}

export type { WalletPort, WalletSnapshot, WalletHandler };
