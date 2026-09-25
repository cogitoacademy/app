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
import { createMidtransPaymentProvider } from "./midtrans-payment.provider";
import type { MidtransMode } from "./midtrans-payment.provider";
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

export type PaymentProviderName = "midtrans" | "stub";

export function createPaymentModule(deps: {
  db: DbType;
  wallet: PaymentWalletPort;
  provider: PaymentProviderName;
  midtransConfig?: {
    serverKey: string;
    merchantId: string;
    mode: MidtransMode;
    webhookSignatureKey?: string;
    // Shared test-mode UAT list, normalized to trim + lowercase. Gates
    // Midtrans Sandbox purchases.
    testAllowedEmails?: readonly string[];
  };
  webhookSecret: string;
  notification?: PaymentNotificationPort;
  audit?: PaymentAuditPort;
  refundRecord?: PaymentRefundRecordPort;
  redis?: RedisClient;
}) {
  const useMidtrans = deps.provider === "midtrans";
  if (useMidtrans && !deps.midtransConfig) {
    throw new Error(
      "PAYMENT_PROVIDER=midtrans but Midtrans credentials are missing — refusing to silently fall back to the stub provider",
    );
  }
  if (!useMidtrans && deps.provider !== "stub") {
    throw new Error(`Unknown payment provider: ${deps.provider}`);
  }

  let provider: PaymentProvider;
  let providerName: PaymentProviderName;
  let providerMode: "test" | "live" | undefined;
  let testAllowedEmails: readonly string[] | undefined;
  let simulationEnabled = false;

  const repo = createPaymentRepo(deps.db);

  if (useMidtrans) {
    provider = createMidtransPaymentProvider({
      serverKey: deps.midtransConfig!.serverKey,
      merchantId: deps.midtransConfig!.merchantId,
      mode: deps.midtransConfig!.mode,
      webhookSignatureKey: deps.midtransConfig!.webhookSignatureKey,
      redis: deps.redis,
      // Midtrans order_id is the payment UUID; resolve it back to the stored
      // provider reference so webhook/status payloads match the payment row.
      resolvePayment: async (paymentId) => {
        const record = await repo.findPaymentById(paymentId);
        return record ? { providerReference: record.providerReference } : null;
      },
    });
    providerName = "midtrans";
    providerMode = deps.midtransConfig!.mode;
    // Midtrans Sandbox enforces the shared test-mode UAT allowlist (same
    // trim + lowercase normalization as the resolve step) so approved UAT
    // accounts can purchase while everyone else gets
    // PAYMENT_TEST_MODE_RESTRICTED. A missing list stays undefined and the
    // handler fails closed in test mode.
    testAllowedEmails = deps
      .midtransConfig!.testAllowedEmails?.map((email) =>
        email.trim().toLowerCase(),
      )
      .filter(Boolean);
    // Midtrans sandbox has no simulation endpoint; test payments use the
    // sandbox test cards on the Snap page. simulationEnabled stays false.
  } else {
    provider = createStubPaymentProvider(deps.webhookSecret);
    providerName = "stub";
  }

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
    providerMode,
    testAllowedEmails,
    simulationEnabled,
  });
  return { service, handler };
}

export type { PaymentService, PaymentHandler };
