import type { Context } from "../../context";

export const refundHandlers = {
  createCorrection: async ({
    context,
    input,
  }: {
    context: Context;
    input: any;
  }) => {
    return context.services.refund.createCorrection(
      context.session!.user.id,
      input,
    );
  },

  listCorrections: async ({
    context,
    input,
  }: {
    context: Context;
    input: any;
  }) => {
    return context.services.refund.listCorrections(input);
  },
};
