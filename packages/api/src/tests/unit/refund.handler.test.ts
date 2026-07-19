import { describe, test, expect, mock } from "bun:test";
import { createRefundHandler } from "../../modules/refund/refund.handler";
import type { RefundService } from "../../modules/refund/refund.service";

function makeRefundService(): RefundService {
  return {
    createCorrection: mock(async () => ({
      walletId: "w1",
      type: "compensate_credit",
      amount: 50,
    })),
    listCorrections: mock(async () => ({
      items: [],
      nextCursor: null,
    })),
  };
}

describe("RefundHandler", () => {
  describe("createCorrection", () => {
    test("delegates to refundService.createCorrection with correct arguments", async () => {
      const refundService = makeRefundService();
      const handler = createRefundHandler({ refundService });

      const input = {
        walletId: "w1",
        amount: 50,
        type: "compensate_credit" as const,
        reason: "Test correction",
      };

      await handler.createCorrection("admin1", input);

      expect(refundService.createCorrection).toHaveBeenCalledWith(
        "admin1",
        input,
      );
    });

    test("returns result from refundService.createCorrection", async () => {
      const refundService = makeRefundService();
      const expected = {
        walletId: "w1",
        type: "compensate_credit",
        amount: 50,
      };
      refundService.createCorrection = mock(async () => expected);
      const handler = createRefundHandler({ refundService });

      const result = await handler.createCorrection("admin1", {
        walletId: "w1",
        amount: 50,
        type: "compensate_credit",
        reason: "Test",
      });

      expect(result).toEqual(expected);
    });

    test("passes bookingId through to refundService", async () => {
      const refundService = makeRefundService();
      const handler = createRefundHandler({ refundService });

      const input = {
        walletId: "w1",
        amount: 50,
        type: "compensate_deduct" as const,
        reason: "Test",
        bookingId: "b123",
      };

      await handler.createCorrection("admin1", input);

      expect(refundService.createCorrection).toHaveBeenCalledWith(
        "admin1",
        input,
      );
    });
  });

  describe("listCorrections", () => {
    test("delegates to refundService.listCorrections with correct arguments", async () => {
      const refundService = makeRefundService();
      const handler = createRefundHandler({ refundService });

      const input = { walletId: "w1", limit: 10, cursor: "abc" };
      await handler.listCorrections(input);

      expect(refundService.listCorrections).toHaveBeenCalledWith(input);
    });

    test("returns result from refundService.listCorrections", async () => {
      const refundService = makeRefundService();
      const expected = {
        items: [{ entryType: "compensate_credit", id: "1" }],
        nextCursor: "next",
      };
      refundService.listCorrections = mock(async () => expected);
      const handler = createRefundHandler({ refundService });

      const result = await handler.listCorrections({ walletId: "w1" });

      expect(result).toEqual(expected);
    });

    test("works without optional limit and cursor", async () => {
      const refundService = makeRefundService();
      const handler = createRefundHandler({ refundService });

      await handler.listCorrections({ walletId: "w1" });

      expect(refundService.listCorrections).toHaveBeenCalledWith({
        walletId: "w1",
      });
    });
  });
});
