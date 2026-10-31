import type { PaymentService } from "../../modules/payment/payment.service";

export async function createV3PackagePurchase(
  payment: PaymentService,
  userId: string,
  walletId: string,
  marks = 50,
) {
  const quote = await payment.createTopUpQuote(userId, {
    requestKey: crypto.randomUUID(),
    marks,
  });
  return payment.createPurchaseFromTopUpQuote(
    userId,
    walletId,
    quote.quoteId,
    "package",
  );
}
