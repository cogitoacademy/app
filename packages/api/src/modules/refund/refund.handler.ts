import type { RefundService } from "./refund.service";

export type RefundHandler = ReturnType<typeof createRefundHandler>;

export function createRefundHandler(deps: { refundService: RefundService }) {
  const { refundService } = deps;

  async function createCorrection(
    adminId: string,
    input: {
      walletId: string;
      amount: number;
      type: "compensate_credit" | "compensate_deduct";
      reason: string;
      bookingId?: string;
    },
  ) {
    return refundService.createCorrection(adminId, input);
  }

  async function listCorrections(input: {
    walletId: string;
    limit?: number;
    cursor?: string;
  }) {
    return refundService.listCorrections(input);
  }

  return { createCorrection, listCorrections };
}
