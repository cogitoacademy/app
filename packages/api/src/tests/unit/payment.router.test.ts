import { describe, test, expect, mock } from "bun:test";

mock.module("../../procedures", () => {
  const mockProc = {
    route: () => mockProc,
    input: () => mockProc,
    handler: (fn: any) => fn,
  };
  return {
    protectedProcedure: mockProc,
    adminProcedure: mockProc,
  };
});

const { paymentRouter } = await import("../../modules/payment/payment.router");
import {
  createPurchaseInput,
  getPurchaseInput,
} from "../../modules/payment/payment.types";

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

  describe("createPurchase handler", () => {
    test("calls wallet.getOrCreate then payment.createIntent with correct args", async () => {
      const createIntent = mock(async () => ({
        paymentId: "p1",
        providerReference: "ref1",
        checkoutUrl: "https://checkout",
      }));
      const getOrCreate = mock(async () => ({ id: "w1" }));
      const context = {
        session: { user: { id: "u1" } },
        services: { wallet: { getOrCreate }, payment: { createIntent } },
      };

      await paymentRouter.createPurchase({
        context,
        input: { packageCode: "basic" },
      });

      expect(getOrCreate).toHaveBeenCalledWith("u1");
      expect(createIntent).toHaveBeenCalledWith("u1", "w1", "basic");
    });

    test("returns result from payment.createIntent", async () => {
      const expected = {
        paymentId: "p1",
        providerReference: "ref1",
        checkoutUrl: "https://checkout",
      };
      const createIntent = mock(async () => expected);
      const getOrCreate = mock(async () => ({ id: "w1" }));
      const context = {
        session: { user: { id: "u1" } },
        services: { wallet: { getOrCreate }, payment: { createIntent } },
      };

      const result = await paymentRouter.createPurchase({
        context,
        input: { packageCode: "basic" },
      });

      expect(result).toEqual(expected);
    });
  });

  describe("getPurchase handler", () => {
    test("calls payment.getPurchase with paymentId and userId", async () => {
      const getPurchase = mock(async () => ({ id: "p1", status: "paid" }));
      const context = {
        session: { user: { id: "u1" } },
        services: { payment: { getPurchase } },
      };

      await paymentRouter.getPurchase({
        context,
        input: { paymentId: "pay_123" },
      });

      expect(getPurchase).toHaveBeenCalledWith("pay_123", "u1");
    });

    test("returns result from payment.getPurchase", async () => {
      const expected = { id: "p1", status: "paid" };
      const getPurchase = mock(async () => expected);
      const context = {
        session: { user: { id: "u1" } },
        services: { payment: { getPurchase } },
      };

      const result = await paymentRouter.getPurchase({
        context,
        input: { paymentId: "pay_123" },
      });

      expect(result).toEqual(expected);
    });
  });
});
