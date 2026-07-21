import { eq } from "drizzle-orm";
import { paymentRecord, markPackage } from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import type { CreditParams, WalletSnapshot } from "../wallet/wallet.service";
import { conflict, notFound } from "../../lib/errors";
import { PAYMENT_STATUS } from "../../shared/constants";

interface PaymentWalletPort {
  credit(db: DbOrTx, params: CreditParams): Promise<WalletSnapshot>;
}

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
  provider: PaymentProvider;
  providerName: string;
}) {
  const { db, wallet, provider, providerName } = deps;

  async function createIntent(
    userId: string,
    walletId: string,
    packageCode: string,
  ): Promise<CreateIntentResult> {
    const [pkg] = await db
      .select()
      .from(markPackage)
      .where(eq(markPackage.code, packageCode))
      .limit(1);
    if (!pkg || !pkg.isActive) throw notFound("Package not found");

    const idempotencyKey = `${providerName}:${userId}:${packageCode}`;
    const [existing] = await db
      .select()
      .from(paymentRecord)
      .where(eq(paymentRecord.providerReference, idempotencyKey))
      .limit(1);
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
      throw conflict(
        `Package already ${existing.status.toLowerCase()} for this user`,
      );
    }

    const paymentId = crypto.randomUUID();
    const providerReference = idempotencyKey;

    await db.insert(paymentRecord).values({
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
      await db
        .update(paymentRecord)
        .set({ status: PAYMENT_STATUS.EXPIRED })
        .where(eq(paymentRecord.id, paymentId));
      throw error;
    }
  }

  async function confirmFromWebhook(
    input: ConfirmInput,
  ): Promise<{ status: string }> {
    return db.transaction(async (tx) => {
      const [record] = await tx
        .select()
        .from(paymentRecord)
        .where(eq(paymentRecord.providerReference, input.providerReference))
        .limit(1);

      if (!record) throw notFound("Payment not found");
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
        const [existing] = await tx
          .select()
          .from(paymentRecord)
          .where(eq(paymentRecord.providerEventId, input.providerEventId))
          .limit(1);
        if (existing && existing.id !== record.id) {
          return { status: existing.status };
        }
      }

      if (
        input.status === PAYMENT_STATUS.PAID ||
        input.status === PAYMENT_STATUS.SETTLED
      ) {
        const shouldCredit = record.status === PAYMENT_STATUS.PENDING;
        await tx
          .update(paymentRecord)
          .set({
            status: input.status,
            providerEventId: input.providerEventId,
            receiptUrl: input.receiptUrl ?? null,
          })
          .where(eq(paymentRecord.id, record.id));

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
        await tx
          .update(paymentRecord)
          .set({
            status: input.status,
            providerEventId: input.providerEventId,
            failureReason: input.failureReason ?? null,
          })
          .where(eq(paymentRecord.id, record.id));
      }

      return { status: input.status };
    });
  }

  async function getPurchase(paymentId: string, userId: string) {
    const [record] = await db
      .select()
      .from(paymentRecord)
      .where(eq(paymentRecord.id, paymentId))
      .limit(1);
    if (!record || record.userId !== userId)
      throw notFound("Payment not found");
    return record;
  }

  return { createIntent, confirmFromWebhook, getPurchase, provider };
}
