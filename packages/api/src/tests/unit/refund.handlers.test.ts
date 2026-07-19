import { describe, test, expect, mock } from "bun:test";
import { refundHandlers } from "../../modules/refund/refund.handlers";

describe("refundHandlers", () => {
  describe("createCorrection", () => {
    test("calls refund.createCorrection with session user id and input", async () => {
      const createCorrection = mock(async () => ({ id: "c1" }));
      const context = {
        session: { user: { id: "u1" } },
        services: { refund: { createCorrection } },
      };
      const input = { bookingId: "b1", amount: 1000, reason: "overcharge" };

      const result = await refundHandlers.createCorrection({ context, input });

      expect(createCorrection).toHaveBeenCalledWith("u1", input);
      expect(result).toEqual({ id: "c1" });
    });
  });

  describe("listCorrections", () => {
    test("calls refund.listCorrections with input", async () => {
      const listCorrections = mock(async () => ({ items: [] }));
      const context = {
        session: { user: { id: "u1" } },
        services: { refund: { listCorrections } },
      };
      const input = { bookingId: "b1" };

      const result = await refundHandlers.listCorrections({ context, input });

      expect(listCorrections).toHaveBeenCalledWith(input);
      expect(result).toEqual({ items: [] });
    });
  });
});
