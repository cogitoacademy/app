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
    /**
     * The active provider's environment mode ("test" for Xendit Test Mode /
     * Midtrans Sandbox, "live" for the real environment). Drives the Test Mode
     * purchase restriction and the `canSimulate` flag.
     */
    providerMode?: "test" | "live";
    testAllowedEmails?: readonly string[];
    /**
     * Whether the active provider exposes a Test Mode simulation endpoint
     * (Xendit does; Midtrans sandbox does not — test payments use the sandbox
     * test cards on the Snap page).
     */
    simulationEnabled?: boolean;
  } = {},
) {
  function isApprovedTestAccount(context: Context) {
    if (config.providerMode !== "test") return false;
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
        if (config.providerMode === "test") {
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
        return {
          ...purchase,
          canSimulate:
            config.simulationEnabled === true && isApprovedTestAccount(context),
        };
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
        if (
          config.simulationEnabled !== true ||
          !isApprovedTestAccount(context)
        ) {
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
