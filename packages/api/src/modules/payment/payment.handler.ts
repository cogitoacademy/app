import type { Context } from "../../context";
import type { z } from "zod";
import type { createPurchaseInput, getPurchaseInput } from "./payment.types";
import type { PaymentService } from "./payment.service";
import type { WalletSnapshot } from "../wallet/wallet.service";

interface PaymentHandlerWalletPort {
  getOrCreate(userId: string): Promise<WalletSnapshot>;
}

type CreatePurchaseInput = z.infer<typeof createPurchaseInput>;
type GetPurchaseInput = z.infer<typeof getPurchaseInput>;

export type PaymentHandler = ReturnType<typeof createPaymentHandler>;

export function createPaymentHandler(
  payment: PaymentService,
  wallet: PaymentHandlerWalletPort,
) {
  return {
    createPurchase: async ({
      context,
      input,
    }: {
      context: Context;
      input: CreatePurchaseInput;
    }) => {
      const w = await wallet.getOrCreate(context.session!.user.id);
      return payment.createIntent(
        context.session!.user.id,
        w.id,
        input.packageCode,
      );
    },

    getPurchase: async ({
      context,
      input,
    }: {
      context: Context;
      input: GetPurchaseInput;
    }) => {
      return payment.getPurchase(input.paymentId, context.session!.user.id);
    },
  };
}
