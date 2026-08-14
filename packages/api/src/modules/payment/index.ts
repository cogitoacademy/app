import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import type { CreditParams, WalletSnapshot } from "../wallet/wallet.service";
import type {
  PaymentProvider,
  PaymentNotificationPort,
} from "./payment.service";
import { createPaymentService } from "./payment.service";
import { createPaymentHandler } from "./payment.handler";
import { createPaymentRepo } from "./payment.repo";
import { createStubPaymentProvider } from "./stub-payment.provider";
import { createXenditPaymentProvider } from "./xendit-payment.provider";
import type { PaymentService } from "./payment.service";
import type { PaymentHandler } from "./payment.handler";

export type PaymentModule = ReturnType<typeof createPaymentModule>;

export interface PaymentWalletPort {
  getOrCreate(userId: string): Promise<WalletSnapshot>;
  credit(db: DbOrTx, params: CreditParams): Promise<WalletSnapshot>;
}

export function createPaymentModule(deps: {
  db: DbType;
  wallet: PaymentWalletPort;
  xenditConfig?: {
    secretKey: string;
    webhookToken: string;
    successRedirectUrl: string;
    failureRedirectUrl: string;
    defaultPaymentMethod?: string;
  };
  webhookSecret: string;
  notification?: PaymentNotificationPort;
}) {
  const useXendit = !!deps.xenditConfig;
  const provider: PaymentProvider = useXendit
    ? createXenditPaymentProvider({
        secretKey: deps.xenditConfig!.secretKey,
        webhookToken: deps.xenditConfig!.webhookToken,
        successRedirectUrl: deps.xenditConfig!.successRedirectUrl,
        failureRedirectUrl: deps.xenditConfig!.failureRedirectUrl,
        defaultPaymentMethod: deps.xenditConfig!.defaultPaymentMethod as
          | "ewallet_ovo"
          | "qris"
          | "va_bca"
          | undefined,
      })
    : createStubPaymentProvider(deps.webhookSecret);
  const providerName = useXendit ? "xendit" : "stub";

  const repo = createPaymentRepo(deps.db);
  const service = createPaymentService({
    db: deps.db,
    wallet: deps.wallet,
    repo,
    provider,
    providerName,
    notification: deps.notification,
  });
  const handler = createPaymentHandler(service, deps.wallet);
  return { service, handler };
}

export type { PaymentService, PaymentHandler };
