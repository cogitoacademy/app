import type { Context } from "../../context";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { internalServerError } from "../../lib/errors";
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
      try {
        const w = await wallet.getOrCreate(context.session!.user.id);
        return payment.createIntent(
          context.session!.user.id,
          w.id,
          input.packageCode,
        );
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to create purchase", err);
      }
    },

    getPurchase: async ({
      context,
      input,
    }: {
      context: Context;
      input: GetPurchaseInput;
    }) => {
      try {
        return payment.getPurchase(input.paymentId, context.session!.user.id);
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to fetch purchase", err);
      }
    },
  };
}
