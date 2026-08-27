import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import type { RedisClient } from "../../lib/redis";
import type {
  CompensateParams,
  CreditParams,
  ReleaseParams,
  WalletSnapshot,
} from "../wallet/wallet.service";
import type { AuditRecordParams } from "../audit/audit.service";
import type {
  PaymentProvider,
  PaymentNotificationPort,
} from "./payment.service";
import { createPaymentService } from "./payment.service";
import { createPaymentHandler } from "./payment.handler";
import { createPaymentRepo } from "./payment.repo";
import { createStubPaymentProvider } from "./stub-payment.provider";
import { createXenditPaymentProvider } from "./xendit-payment.provider";
import type { XenditMode } from "./xendit-payment.provider";
import type { PaymentService } from "./payment.service";
import type { PaymentHandler } from "./payment.handler";

export type PaymentModule = ReturnType<typeof createPaymentModule>;

export interface PaymentWalletPort {
  getOrCreate(userId: string): Promise<WalletSnapshot>;
  // N4: transactional read used inside confirmFromWebhook's REFUNDED branch so
  // the reversal-vs-reconciliation money decision reads the active transaction's
  // view, not the global db.
  getByUserId(db: DbOrTx, userId: string): Promise<WalletSnapshot | null>;
  credit(db: DbOrTx, params: CreditParams): Promise<WalletSnapshot>;
  // M1: REFUNDED reversal consumes held marks first (release) then deducts the
  // remainder from available via compensate_deduct, so the reversal basis is
  // total (held + available), not just available.
  release(db: DbOrTx, params: ReleaseParams): Promise<WalletSnapshot>;
  compensate(db: DbOrTx, params: CompensateParams): Promise<WalletSnapshot>;
}

export interface PaymentAuditPort {
  record(params: AuditRecordParams): Promise<void>;
}

export interface PaymentRefundRecordPort {
  insertRefundRecord(
    db: DbOrTx,
    params: {
      paymentId: string | null;
      walletId: string;
      amountIdr: number;
      marks: number;
      reason: string;
      actorId?: string;
      providerEventId?: string;
    },
  ): Promise<unknown>;
}

export function createPaymentModule(deps: {
  db: DbType;
  wallet: PaymentWalletPort;
  provider: "xendit" | "stub";
  xenditConfig?: {
    secretKey: string;
    webhookToken: string;
    mode: XenditMode;
    testAllowedEmails?: readonly string[];
    successRedirectUrl: string;
    failureRedirectUrl: string;
    defaultPaymentMethod?: string;
  };
  webhookSecret: string;
  notification?: PaymentNotificationPort;
  audit?: PaymentAuditPort;
  refundRecord?: PaymentRefundRecordPort;
  redis?: RedisClient;
}) {
  const useXendit = deps.provider === "xendit";
  if (useXendit && !deps.xenditConfig) {
    throw new Error(
      "PAYMENT_PROVIDER=xendit but Xendit credentials are missing — refusing to silently fall back to the stub provider",
    );
  }
  if (!useXendit && deps.provider !== "stub") {
    throw new Error(`Unknown payment provider: ${deps.provider}`);
  }

  const provider: PaymentProvider = useXendit
    ? createXenditPaymentProvider({
        secretKey: deps.xenditConfig!.secretKey,
        webhookToken: deps.xenditConfig!.webhookToken,
        mode: deps.xenditConfig!.mode,
        successRedirectUrl: deps.xenditConfig!.successRedirectUrl,
        failureRedirectUrl: deps.xenditConfig!.failureRedirectUrl,
        defaultPaymentMethod: deps.xenditConfig!.defaultPaymentMethod as
          | "ewallet_ovo"
          | "qris"
          | "va_bca"
          | undefined,
        redis: deps.redis,
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
    audit: deps.audit,
    refundRecord: deps.refundRecord,
  });
  const handler = createPaymentHandler(service, deps.wallet, {
    xenditMode: useXendit ? deps.xenditConfig!.mode : undefined,
    testAllowedEmails: useXendit
      ? deps.xenditConfig!.testAllowedEmails
      : undefined,
  });
  return { service, handler };
}

export type { PaymentService, PaymentHandler };
