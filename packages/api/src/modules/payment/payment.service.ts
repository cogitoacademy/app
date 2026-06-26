import { eq } from "drizzle-orm";
import { paymentRecord, markPackage } from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { WalletPort } from "../../shared/ports/wallet.port";
import type { PaymentProvider } from "../../shared/ports/payment.port";
import { notFound } from "../../lib/errors";

export interface CreateIntentResult {
  paymentId: string;
  providerReference: string;
  checkoutUrl: string;
}

export interface ConfirmInput {
  provider: string;
  providerReference: string;
  providerEventId: string;
  status: "succeeded" | "failed";
  receiptUrl?: string | null;
  failureReason?: string | null;
}

export type PaymentService = ReturnType<typeof createPaymentService>;

export function createPaymentService(deps: {
  db: DbType;
  wallet: WalletPort;
  provider: PaymentProvider;
}) {
  const { db, wallet, provider } = deps;

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

    const paymentId = crypto.randomUUID();
    const providerReference = `stub-${paymentId}`;

    await db.insert(paymentRecord).values({
      id: paymentId,
      userId,
      walletId,
      packageId: pkg.id,
      provider: "stub",
      providerReference,
      amountIdr: pkg.priceIdr,
      marks: pkg.marks,
      status: "pending",
    });

    const intent = await provider.createIntent({
      paymentId,
      amountIdr: pkg.priceIdr,
      providerReference,
    });
    return { paymentId, providerReference, checkoutUrl: intent.checkoutUrl };
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
      if (record.status === "succeeded") return { status: "succeeded" };
      if (record.status === "failed") return { status: "failed" };

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

      if (input.status === "succeeded") {
        await tx
          .update(paymentRecord)
          .set({
            status: "succeeded",
            providerEventId: input.providerEventId,
            receiptUrl: input.receiptUrl ?? null,
          })
          .where(eq(paymentRecord.id, record.id));

        await wallet.credit(tx, {
          walletId: record.walletId,
          actorType: "student",
          amount: record.marks,
          eventKey: `purchase.${record.id}`,
          sourceReference: record.id,
          reason: `Purchase: ${record.marks} Marks`,
        });
      } else {
        await tx
          .update(paymentRecord)
          .set({
            status: "failed",
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
