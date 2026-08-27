import type { Context } from "../../context";
import { z } from "zod";
import { withDomainMap } from "../../lib/handler-utils";
import {
  mapPaymentError,
  PaymentTestModeRestrictedError,
} from "./payment.errors";
import type { createPurchaseInput, getPurchaseInput } from "./payment.types";
import type { PaymentService } from "./payment.service";
import type { WalletSnapshot } from "../wallet/wallet.service";
import type { XenditMode } from "./xendit-payment.provider";

interface PaymentHandlerWalletPort {
  getOrCreate(userId: string): Promise<WalletSnapshot>;
}

type CreatePurchaseInput = z.infer<typeof createPurchaseInput>;
type GetPurchaseInput = z.infer<typeof getPurchaseInput>;

export type PaymentHandler = ReturnType<typeof createPaymentHandler>;

export function createPaymentHandler(
  payment: PaymentService,
  wallet: PaymentHandlerWalletPort,
  config: {
    xenditMode?: XenditMode;
    testAllowedEmails?: readonly string[];
  } = {},
) {
  return {
    createPurchase: async ({
      context,
      input,
    }: {
      context: Context;
      input: CreatePurchaseInput;
    }) => {
      return withDomainMap(async () => {
        if (
          config.xenditMode === "test" &&
          config.testAllowedEmails &&
          config.testAllowedEmails.length > 0
        ) {
          const email = context.session!.user.email.trim().toLowerCase();
          if (!config.testAllowedEmails.includes(email)) {
            throw new PaymentTestModeRestrictedError();
          }
        }
        const w = await wallet.getOrCreate(context.session!.user.id);
        return payment.createIntent(
          context.session!.user.id,
          w.id,
          input.packageCode,
        );
      }, mapPaymentError);
    },

    getPurchase: async ({
      context,
      input,
    }: {
      context: Context;
      input: GetPurchaseInput;
    }) => {
      return withDomainMap(
        () => payment.getPurchase(input.paymentId, context.session!.user.id),
        mapPaymentError,
      );
    },
  };
}
