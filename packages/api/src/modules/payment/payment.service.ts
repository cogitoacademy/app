import type { DbType } from "../../lib/db";
import { PAYMENT_STATUS } from "../../shared/constants";
import { NOTIFICATION_CATEGORY } from "../../shared/constants";
import { NOTIFICATION_SEVERITY } from "../../shared/constants";
import type { NotificationWriteParams } from "../notification/notification.service";
import {
  PackageNotFoundError,
  PaymentNotFoundError,
  PackageAlreadyPurchasedError,
  PaymentProviderError,
} from "./payment.errors";
import type { PaymentWalletPort } from "./index";
import type { PaymentRepo } from "./payment.repo";

export type PaymentStatus =
  | "PENDING"
  | "PAID"
  | "SETTLED"
  | "FAILED"
  | "EXPIRED"
  | "REFUNDED";

export interface WebhookPayload {
  providerReference: string;
  providerEventId: string;
  status: PaymentStatus;
  receiptUrl?: string | null;
  failureReason?: string | null;
}

export interface PaymentProvider {
  createIntent(params: {
    paymentId: string;
    amountIdr: number;
    providerReference: string;
  }): Promise<{ checkoutUrl: string }>;
  verifyWebhook(rawBody: string, signature: string): Promise<WebhookPayload>;
}

export type PaymentPort = PaymentProvider;

export interface CreateIntentResult {
  paymentId: string;
  providerReference: string;
  checkoutUrl: string;
}

export interface ConfirmInput {
  provider: string;
  providerReference: string;
  providerEventId: string;
  status: PaymentStatus;
  receiptUrl?: string | null;
  failureReason?: string | null;
}

export type PaymentService = ReturnType<typeof createPaymentService>;

export interface PaymentNotificationPort {
  writeBestEffort(params: NotificationWriteParams): Promise<void>;
}

const ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  PENDING: ["PAID", "FAILED", "EXPIRED", "SETTLED"],
  PAID: ["SETTLED", "REFUNDED"],
  SETTLED: ["REFUNDED"],
  FAILED: [],
  EXPIRED: [],
  REFUNDED: [],
};

/**
 * Creates the payment service for purchase intents, webhook confirmation, and purchase lookups.
 *
 * @param deps - the dependency ports (db, wallet, repo, provider, providerName)
 * @returns a PaymentPort with createIntent, confirmFromWebhook, getPurchase and the provider
 */
export function createPaymentService(deps: {
  db: DbType;
  wallet: PaymentWalletPort;
  repo: PaymentRepo;
  provider: PaymentProvider;
  providerName: string;
  notification?: PaymentNotificationPort;
}) {
  const { db, wallet, repo, provider, providerName, notification } = deps;

  /**
   * Creates a payment intent for a mark package purchase, reusing pending intents.
   *
   * @param userId - the purchasing student
   * @param walletId - the student's wallet to credit on confirmation
   * @param packageCode - the mark package code to purchase
   * @returns the payment id, provider reference, and checkout URL
   * @throws {PackageNotFoundError} if the package is missing or inactive
   * @throws {PackageAlreadyPurchasedError} if the user already has a non-pending purchase
   * @throws {PaymentProviderError} if the provider rejects intent creation
   */
  async function createIntent(
    userId: string,
    walletId: string,
    packageCode: string,
  ): Promise<CreateIntentResult> {
    const pkg = await repo.findPackageByCode(packageCode);
    if (!pkg || !pkg.isActive) throw new PackageNotFoundError(packageCode);

    const idempotencyKey = `${providerName}:${userId}:${packageCode}`;
    const existing = await repo.findPaymentByProviderReference(idempotencyKey);
    if (existing) {
      if (existing.status === PAYMENT_STATUS.PENDING) {
        // TODO(H14): Store checkoutUrl in paymentRecord to avoid re-calling provider
        const existingIntent = await provider.createIntent({
          paymentId: existing.id,
          amountIdr: pkg.priceIdr,
          providerReference: existing.providerReference,
        });
        return {
          paymentId: existing.id,
          providerReference: existing.providerReference,
          checkoutUrl: existingIntent.checkoutUrl,
        };
      }
      if (
        existing.status === PAYMENT_STATUS.FAILED ||
        existing.status === PAYMENT_STATUS.EXPIRED
      ) {
        // Reset to PENDING so the webhook can credit, then re-create the intent.
        // Xendit allows reusing the reference_id for a fresh payment request.
        await repo.updatePaymentStatus(existing.id, {
          status: PAYMENT_STATUS.PENDING,
        });
        const freshIntent = await provider.createIntent({
          paymentId: existing.id,
          amountIdr: pkg.priceIdr,
          providerReference: existing.providerReference,
        });
        return {
          paymentId: existing.id,
          providerReference: existing.providerReference,
          checkoutUrl: freshIntent.checkoutUrl,
        };
      }
      throw new PackageAlreadyPurchasedError(packageCode, userId);
    }

    const paymentId = crypto.randomUUID();
    const providerReference = idempotencyKey;

    await repo.insertPayment({
      id: paymentId,
      userId,
      walletId,
      packageId: pkg.id,
      provider: providerName,
      providerReference,
      amountIdr: pkg.priceIdr,
      marks: pkg.marks,
      status: PAYMENT_STATUS.PENDING,
    });

    try {
      const intent = await provider.createIntent({
        paymentId,
        amountIdr: pkg.priceIdr,
        providerReference,
      });
      return { paymentId, providerReference, checkoutUrl: intent.checkoutUrl };
    } catch (error) {
      await repo.updatePaymentStatus(paymentId, {
        status: PAYMENT_STATUS.EXPIRED,
      });
      throw new PaymentProviderError(providerName, error);
    }
  }

  /**
   * Confirms a provider webhook, crediting the wallet on PAID/SETTLED and enforcing idempotency.
   *
   * @param input - the webhook confirmation details (provider, references, status, receipt)
   * @returns the resulting payment status
   * @throws {PaymentNotFoundError} if no payment matches the provider reference
   */
  async function confirmFromWebhook(
    input: ConfirmInput,
  ): Promise<{ status: string }> {
    return db.transaction(async (tx) => {
      const record = await repo.findPaymentByProviderReference(
        input.providerReference,
        tx,
      );

      if (!record) throw new PaymentNotFoundError(input.providerReference);
      // PAID/SETTLED are terminal for idempotency purposes, EXCEPT a REFUNDED
      // webhook (per ALLOWED_TRANSITIONS PAID/SETTLED -> REFUNDED) which must be
      // processed so the payment is marked REFUNDED and the payer is notified.
      if (
        record.status === PAYMENT_STATUS.PAID &&
        input.status !== PAYMENT_STATUS.REFUNDED
      )
        return { status: PAYMENT_STATUS.PAID };
      if (record.status === PAYMENT_STATUS.FAILED)
        return { status: PAYMENT_STATUS.FAILED };
      if (
        record.status === PAYMENT_STATUS.SETTLED &&
        input.status !== PAYMENT_STATUS.REFUNDED
      )
        return { status: PAYMENT_STATUS.SETTLED };
      if (record.status === PAYMENT_STATUS.EXPIRED)
        return { status: PAYMENT_STATUS.EXPIRED };
      if (record.status === PAYMENT_STATUS.REFUNDED)
        return { status: PAYMENT_STATUS.REFUNDED };

      const allowed = ALLOWED_TRANSITIONS[record.status] ?? [];
      if (!allowed.includes(input.status)) {
        return { status: record.status };
      }

      if (input.providerEventId) {
        const existing = await repo.findPaymentByProviderEventId(
          input.providerEventId,
          tx,
        );
        if (existing && existing.id !== record.id) {
          return { status: existing.status };
        }
      }

      const shouldCredit =
        record.status === PAYMENT_STATUS.PENDING &&
        (input.status === PAYMENT_STATUS.PAID ||
          input.status === PAYMENT_STATUS.SETTLED);

      if (
        input.status === PAYMENT_STATUS.PAID ||
        input.status === PAYMENT_STATUS.SETTLED
      ) {
        await repo.updatePaymentStatus(
          record.id,
          {
            status: input.status,
            providerEventId: input.providerEventId,
            receiptUrl: input.receiptUrl ?? null,
          },
          tx,
        );

        if (shouldCredit) {
          await wallet.credit(tx, {
            walletId: record.walletId,
            actorType: "student",
            amount: record.marks,
            eventKey: `purchase.${record.id}`,
            sourceReference: record.id,
            reason: `Purchase: ${record.marks} Marks`,
          });
        }

        if (notification && shouldCredit) {
          await notification.writeBestEffort({
            db: tx,
            userId: record.userId,
            category: NOTIFICATION_CATEGORY.PAYMENT,
            severity: NOTIFICATION_SEVERITY.ACTION,
            title: "Payment received",
            body: `Your payment of ${record.amountIdr} IDR was received and ${record.marks} Marks were added to your balance.`,
            eventKey: `payment.${record.id}.credited`,
            emailRequired: true,
          });
        }
      } else {
        await repo.updatePaymentStatus(
          record.id,
          {
            status: input.status,
            providerEventId: input.providerEventId,
            failureReason: input.failureReason ?? null,
          },
          tx,
        );

        // R5: a REFUNDED webhook reverses the marks credited on PAID/SETTLED
        // (only if the record actually went through a credit). Uses the
        // compensate_deduct primitive — it removes the marks from the
        // available balance, unlike `deduct` which only releases holds.
        if (
          input.status === PAYMENT_STATUS.REFUNDED &&
          (record.status === PAYMENT_STATUS.PAID ||
            record.status === PAYMENT_STATUS.SETTLED)
        ) {
          await wallet.compensate(tx, {
            walletId: record.walletId,
            amount: record.marks,
            eventKey: `refund.${record.id}.reverse`,
            sourceReference: record.id,
            actorType: "system",
            reason: "Refund: reversed credited marks",
            type: "compensate_deduct",
          });
        }

        if (notification && input.status === PAYMENT_STATUS.REFUNDED) {
          await notification.writeBestEffort({
            db: tx,
            userId: record.userId,
            category: NOTIFICATION_CATEGORY.REFUND,
            severity: NOTIFICATION_SEVERITY.ACTION,
            title: "Refund processed",
            body: "Your payment has been refunded to your account.",
            eventKey: `payment.${record.id}.refunded`,
            emailRequired: true,
          });
        }
      }

      return { status: input.status };
    });
  }

  /**
   * Fetches a payment record, verifying the requesting user owns it.
   *
   * @param paymentId - the payment to fetch
   * @param userId - the requesting user
   * @returns the payment record
   * @throws {PaymentNotFoundError} if the payment does not exist or belongs to another user
   */
  async function getPurchase(paymentId: string, userId: string) {
    const record = await repo.findPaymentById(paymentId);
    if (!record || record.userId !== userId)
      throw new PaymentNotFoundError(paymentId);
    return record;
  }

  return { createIntent, confirmFromWebhook, getPurchase, provider };
}
