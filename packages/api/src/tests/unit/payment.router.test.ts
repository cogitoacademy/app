import { describe, test, expect, mock } from "bun:test";

const { paymentRouter } = await import("../../modules/payment/payment.router");
import {
  createPurchaseInput,
  getPurchaseInput,
} from "../../modules/payment/payment.types";
import { paymentHandlers } from "../../modules/payment/payment.handlers";

describe("paymentRouter", () => {
  test("exports expected route keys", () => {
    expect(Object.keys(paymentRouter).toSorted()).toEqual([
      "createPurchase",
      "getPurchase",
    ]);
  });

  describe("input validation", () => {
    test("createPurchaseInput accepts valid packageCode", () => {
      const result = createPurchaseInput.safeParse({ packageCode: "basic" });
      expect(result.success).toBe(true);
    });

    test("createPurchaseInput rejects empty packageCode", () => {
      const result = createPurchaseInput.safeParse({ packageCode: "" });
      expect(result.success).toBe(false);
    });

    test("createPurchaseInput rejects missing packageCode", () => {
      const result = createPurchaseInput.safeParse({});
      expect(result.success).toBe(false);
    });

    test("getPurchaseInput accepts valid paymentId", () => {
      const result = getPurchaseInput.safeParse({ paymentId: "pay_123" });
      expect(result.success).toBe(true);
    });

    test("getPurchaseInput rejects missing paymentId", () => {
      const result = getPurchaseInput.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});

describe("paymentHandlers", () => {
  describe("createPurchase", () => {
    test("calls wallet.getOrCreate then payment.createIntent", async () => {
      const wallet = { id: "w1", totalBalance: 0 };
      const getOrCreate = mock(async () => wallet);
      const createIntent = mock(async () => ({
        id: "pay1",
        status: "pending",
      }));
      const context = {
        session: { user: { id: "u1" } },
        services: {
          wallet: { getOrCreate },
          payment: { createIntent },
        },
      };
      const input = { packageCode: "basic" };

      const result = await paymentHandlers.createPurchase({ context, input });

      expect(getOrCreate).toHaveBeenCalledWith("u1");
      expect(createIntent).toHaveBeenCalledWith("u1", "w1", "basic");
      expect(result).toEqual({ id: "pay1", status: "pending" });
    });
  });

  describe("getPurchase", () => {
    test("calls payment.getPurchase with paymentId and userId", async () => {
      const getPurchase = mock(async () => ({ id: "pay1", status: "paid" }));
      const context = {
        session: { user: { id: "u1" } },
        services: { payment: { getPurchase } },
      };
      const input = { paymentId: "pay1" };

      const result = await paymentHandlers.getPurchase({ context, input });

      expect(getPurchase).toHaveBeenCalledWith("pay1", "u1");
      expect(result).toEqual({ id: "pay1", status: "paid" });
    });
  });
});
