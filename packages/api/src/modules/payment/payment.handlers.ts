import type { Context } from "../../context";

export const paymentHandlers = {
  createPurchase: async ({
    context,
    input,
  }: {
    context: Context;
    input: any;
  }) => {
    const w = await context.services.wallet.getOrCreate(
      context.session!.user.id,
    );
    return context.services.payment.createIntent(
      context.session!.user.id,
      w.id,
      input.packageCode,
    );
  },

  getPurchase: async ({ context, input }: { context: Context; input: any }) => {
    return context.services.payment.getPurchase(
      input.paymentId,
      context.session!.user.id,
    );
  },
};
