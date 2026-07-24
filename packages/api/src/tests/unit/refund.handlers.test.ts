import { describe, test, expect, mock } from "bun:test";
import { createRefundHandler } from "../../modules/refund/refund.handler";

describe("refundHandler", () => {
  describe("createCorrection", () => {
    test("calls refundService.createCorrection with session user id and input", async () => {
      const createCorrection = mock(async () => ({ id: "c1" }));
      const handler = createRefundHandler({
        refundService: {
          createCorrection,
          listCorrections: mock(async () => ({})),
        } as any,
      });
      const context = {
        session: { user: { id: "u1" } },
      } as any;
      const input = { bookingId: "b1", amount: 1000, reason: "overcharge" };

      const result = await handler.createCorrection({ context, input });

      expect(createCorrection).toHaveBeenCalledWith("u1", input);
      expect(result).toEqual({ id: "c1" });
    });
  });

  describe("listCorrections", () => {
    test("calls refundService.listCorrections with input", async () => {
      const listCorrections = mock(async () => ({ items: [] }));
      const handler = createRefundHandler({
        refundService: {
          createCorrection: mock(async () => ({})),
          listCorrections,
        } as any,
      });
      const context = {
        session: { user: { id: "u1" } },
      } as any;
      const input = { bookingId: "b1" };

      const result = await handler.listCorrections({ context, input });

      expect(listCorrections).toHaveBeenCalledWith(input);
      expect(result).toEqual({ items: [] });
    });
  });
});
