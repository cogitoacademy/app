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
  createTopUpQuoteInput,
  createPurchaseFromQuoteInput,
  getPurchaseInput,
  simulatePurchaseInput,
} from "./payment.types";
import type { PaymentService } from "./payment.service";
import type { WalletSnapshot } from "../wallet/wallet.service";

interface PaymentHandlerWalletPort {
  getOrCreate(userId: string): Promise<WalletSnapshot>;
}

type CreatePurchaseInput = z.infer<typeof createPurchaseInput>;
type CreateTopUpQuoteInput = z.infer<typeof createTopUpQuoteInput>;
type CreatePurchaseFromQuoteInput = z.infer<
  typeof createPurchaseFromQuoteInput
>;
type GetPurchaseInput = z.infer<typeof getPurchaseInput>;
type SimulatePurchaseInput = z.infer<typeof simulatePurchaseInput>;

export type PaymentHandler = ReturnType<typeof createPaymentHandler>;

export function createPaymentHandler(
  payment: PaymentService,
  wallet: PaymentHandlerWalletPort,
  config: {
    /**
     * The active provider's environment mode ("test" for a sandbox,
     * "live" for the real environment). Drives the Test Mode purchase
     * restriction and the `canSimulate` flag.
     */
    providerMode?: "test" | "live";
    testAllowedEmails?: readonly string[];
    /**
     * Whether the active provider exposes a Test Mode simulation endpoint.
     * Midtrans Sandbox has no simulation endpoint; test payments use sandbox
     * test cards on the Snap page.
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
    getConfig: async () => ({
      testMode: config.providerMode === "test",
    }),

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

    getTopUpCatalog: async () => {
      return withDomainMap(
        async () => payment.getTopUpCatalog(),
        mapPaymentError,
      );
    },

    createTopUpQuote: async ({
      context,
      input,
    }: {
      context: Context;
      input: CreateTopUpQuoteInput;
    }) => {
      return withDomainMap(
        async () => payment.createTopUpQuote(context.session!.user.id, input),
        mapPaymentError,
      );
    },

    createPurchaseFromQuote: async ({
      context,
      input,
    }: {
      context: Context;
      input: CreatePurchaseFromQuoteInput;
    }) => {
      return withDomainMap(async () => {
        if (config.providerMode === "test" && !isApprovedTestAccount(context)) {
          throw new PaymentTestModeRestrictedError();
        }
        const w = await wallet.getOrCreate(context.session!.user.id);
        const purchase = await payment.createPurchaseFromTopUpQuote(
          context.session!.user.id,
          w.id,
          input.quoteId,
          input.choice,
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
        const record = await payment.getPurchase(
          input.paymentId,
          context.session!.user.id,
        );
        return {
          id: record.id,
          status: record.status,
          provider: record.provider,
          providerReference: record.providerReference,
          amountIdr: record.amountIdr,
          marks: record.marks,
          receiptUrl: record.receiptUrl,
          checkoutUrl: record.checkoutUrl,
          failureReason: record.failureReason,
          purchaseLabel: record.purchaseLabel,
          quoteId: record.quoteId,
          quoteChoice: record.quoteChoice as
            | "package"
            | "custom"
            | "recommended"
            | null,
          providerIntentState: record.providerIntentState as
            | "CREATING"
            | "READY"
            | "UNCERTAIN"
            | null,
          createdAt: record.createdAt.toISOString(),
        };
      }, mapPaymentError);
    },
  };
}
