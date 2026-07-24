import { describe, test, expect, mock } from "bun:test";

import { createPaymentHandler } from "../../modules/payment/payment.handler";
import {
  createPurchaseInput,
  getPurchaseInput,
} from "../../modules/payment/payment.types";

describe("paymentRouter input validation", () => {
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

describe("paymentHandler", () => {
  describe("createPurchase", () => {
    test("calls wallet.getOrCreate then payment.createIntent", async () => {
      const walletData = {
        id: "w1",
        totalBalance: 0,
        heldBalance: 0,
        availableBalance: 0,
      };
      const wallet = {
        getOrCreate: mock(async () => walletData),
      };
      const payment = {
        createIntent: mock(async () => ({
          id: "pay1",
          status: "pending",
        })),
      };
      const handler = createPaymentHandler(payment as any, wallet as any);
      const context = { session: { user: { id: "u1" } } };
      const input = { packageCode: "basic" };

      const result = await handler.createPurchase({
        context: context as any,
        input: input as any,
      });

      expect(wallet.getOrCreate).toHaveBeenCalledWith("u1");
      expect(payment.createIntent).toHaveBeenCalledWith("u1", "w1", "basic");
      expect(result).toEqual({ id: "pay1", status: "pending" });
    });
  });

  describe("getPurchase", () => {
    test("calls payment.getPurchase with paymentId and userId", async () => {
      const payment = {
        getPurchase: mock(async () => ({ id: "pay1", status: "paid" })),
      };
      const wallet = {} as any;
      const handler = createPaymentHandler(payment as any, wallet);
      const context = { session: { user: { id: "u1" } } };
      const input = { paymentId: "pay1" };

      const result = await handler.getPurchase({
        context: context as any,
        input: input as any,
      });

      expect(payment.getPurchase).toHaveBeenCalledWith("pay1", "u1");
      expect(result).toEqual({ id: "pay1", status: "paid" });
    });
  });
});
