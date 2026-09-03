import type { Context } from "../../context";
import { z } from "zod";
import { withDomainMap } from "../../lib/handler-utils";
import {
  mapPaymentError,
  PaymentSimulationUnavailableError,
  PaymentTestModeRestrictedError,
} from "./payment.errors";
import type {
  createPurchaseInput,
  getPurchaseInput,
  simulatePurchaseInput,
} from "./payment.types";
import type { PaymentService } from "./payment.service";
import type { WalletSnapshot } from "../wallet/wallet.service";
import type { XenditMode } from "./xendit-payment.provider";

interface PaymentHandlerWalletPort {
  getOrCreate(userId: string): Promise<WalletSnapshot>;
}

type CreatePurchaseInput = z.infer<typeof createPurchaseInput>;
type GetPurchaseInput = z.infer<typeof getPurchaseInput>;
type SimulatePurchaseInput = z.infer<typeof simulatePurchaseInput>;

export type PaymentHandler = ReturnType<typeof createPaymentHandler>;

export function createPaymentHandler(
  payment: PaymentService,
  wallet: PaymentHandlerWalletPort,
  config: {
    xenditMode?: XenditMode;
    testAllowedEmails?: readonly string[];
  } = {},
) {
  function isApprovedTestAccount(context: Context) {
    if (config.xenditMode !== "test") return false;
    const email = context.session!.user.email.trim().toLowerCase();
    return Boolean(
      config.testAllowedEmails?.length &&
      config.testAllowedEmails.includes(email),
    );
  }

  return {
    createPurchase: async ({
      context,
      input,
    }: {
      context: Context;
      input: CreatePurchaseInput;
    }) => {
      return withDomainMap(async () => {
        if (config.xenditMode === "test") {
          if (!isApprovedTestAccount(context)) {
            throw new PaymentTestModeRestrictedError();
          }
        }
        const w = await wallet.getOrCreate(context.session!.user.id);
        const purchase = await payment.createIntent(
          context.session!.user.id,
          w.id,
          input.packageCode,
        );
        return { ...purchase, canSimulate: isApprovedTestAccount(context) };
      }, mapPaymentError);
    },

    simulatePurchase: async ({
      context,
      input,
    }: {
      context: Context;
      input: SimulatePurchaseInput;
    }) => {
      return withDomainMap(async () => {
        if (!isApprovedTestAccount(context)) {
          throw new PaymentSimulationUnavailableError();
        }
        return payment.simulatePurchase(
          input.paymentId,
          context.session!.user.id,
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
      return withDomainMap(async () => {
        if (isApprovedTestAccount(context)) {
          await payment.reconcilePurchase(
            input.paymentId,
            context.session!.user.id,
          );
        }
        return payment.getPurchase(input.paymentId, context.session!.user.id);
      }, mapPaymentError);
    },
  };
}
