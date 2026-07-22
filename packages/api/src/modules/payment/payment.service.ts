import { ORPCError } from "@orpc/server";
import type { DbType } from "../../lib/db";
import { PAYMENT_STATUS } from "../../shared/constants";
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

export function createPaymentService(deps: {
  db: DbType;
  wallet: PaymentWalletPort;
  repo: PaymentRepo;
  provider: PaymentProvider;
  providerName: string;
}) {
  const { db, wallet, repo, provider, providerName } = deps;

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
      if (error instanceof ORPCError) throw error;
      throw new PaymentProviderError(providerName, error);
    }
  }

  async function confirmFromWebhook(
    input: ConfirmInput,
  ): Promise<{ status: string }> {
    return db.transaction(async (tx) => {
      const record = await repo.findPaymentByProviderReference(
        input.providerReference,
        tx,
      );

      if (!record) throw new PaymentNotFoundError(input.providerReference);
      if (record.status === PAYMENT_STATUS.PAID)
        return { status: PAYMENT_STATUS.PAID };
      if (record.status === PAYMENT_STATUS.FAILED)
        return { status: PAYMENT_STATUS.FAILED };
      if (record.status === PAYMENT_STATUS.SETTLED)
        return { status: PAYMENT_STATUS.SETTLED };
      if (record.status === PAYMENT_STATUS.EXPIRED)
        return { status: PAYMENT_STATUS.EXPIRED };
      if (record.status === PAYMENT_STATUS.REFUNDED)
        return { status: PAYMENT_STATUS.REFUNDED };

      if (input.providerEventId) {
        const existing = await repo.findPaymentByProviderEventId(
          input.providerEventId,
          tx,
        );
        if (existing && existing.id !== record.id) {
          return { status: existing.status };
        }
      }

      if (
        input.status === PAYMENT_STATUS.PAID ||
        input.status === PAYMENT_STATUS.SETTLED
      ) {
        const shouldCredit = record.status === PAYMENT_STATUS.PENDING;
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
      }

      return { status: input.status };
    });
  }

  async function getPurchase(paymentId: string, userId: string) {
    const record = await repo.findPaymentById(paymentId);
    if (!record || record.userId !== userId)
      throw new PaymentNotFoundError(paymentId);
    return record;
  }

  return { createIntent, confirmFromWebhook, getPurchase, provider };
}
