import type { DbType } from "../../lib/db";
import { createAuthRepo } from "./auth.repo";
import { createAuthService } from "./auth.service";
import { createAuthHandler } from "./auth.handler";
import type { AuthService } from "./auth.service";
import type { AuthHandler } from "./auth.handler";
import type { WalletSnapshot } from "../wallet/wallet.service";

export type AuthModule = ReturnType<typeof createAuthModule>;

interface AuthWalletPort {
  getOrCreate(userId: string): Promise<WalletSnapshot>;
}

export function createAuthModule(deps: { db: DbType; wallet: AuthWalletPort }) {
  const repo = createAuthRepo();
  const service = createAuthService({
    authRepo: repo,
    walletPort: deps.wallet,
    db: deps.db,
  });
  const handler = createAuthHandler(service);
  return { service, handler };
}

export type { AuthService, AuthHandler };
