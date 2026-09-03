import { describe, test, expect, mock } from "bun:test";

import { createPaymentHandler } from "../../modules/payment/payment.handler";
import {
  createPurchaseInput,
  getPurchaseInput,
  simulatePurchaseInput,
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

  test("simulatePurchaseInput requires a payment UUID", () => {
    expect(
      simulatePurchaseInput.safeParse({
        paymentId: "550e8400-e29b-41d4-a716-446655440000",
      }).success,
    ).toBe(true);
    expect(
      simulatePurchaseInput.safeParse({ paymentId: "pay_123" }).success,
    ).toBe(false);
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
      expect(result).toEqual({
        id: "pay1",
        status: "pending",
        canSimulate: false,
      });
    });

    test("restricts production Test Mode purchases to the configured UAT emails", async () => {
      const payment = {
        createIntent: mock(async () => ({
          id: "pay1",
          status: "pending",
        })),
      };
      const wallet = { getOrCreate: mock(async () => ({ id: "w1" })) };
      const handler = createPaymentHandler(payment as any, wallet as any, {
        xenditMode: "test",
        testAllowedEmails: ["qa@cogitoacademy.id"],
      });

      await expect(
        handler.createPurchase({
          context: {
            session: { user: { id: "u1", email: "student@example.com" } },
          } as any,
          input: { packageCode: "basic" } as any,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(wallet.getOrCreate).not.toHaveBeenCalled();
      expect(payment.createIntent).not.toHaveBeenCalled();

      await expect(
        handler.createPurchase({
          context: {
            session: { user: { id: "u1", email: "QA@cogitoacademy.id" } },
          } as any,
          input: { packageCode: "basic" } as any,
        }),
      ).resolves.toEqual({
        id: "pay1",
        status: "pending",
        canSimulate: true,
      });
    });
  });

  describe("simulatePurchase", () => {
    test("allows only the owning approved Test Mode account", async () => {
      const payment = {
        simulatePurchase: mock(async () => ({
          status: "PENDING",
          message: "processing",
        })),
      };
      const handler = createPaymentHandler(payment as any, {} as any, {
        xenditMode: "test",
        testAllowedEmails: ["qa@cogitoacademy.id"],
      });

      const result = await handler.simulatePurchase({
        context: {
          session: { user: { id: "u1", email: "QA@cogitoacademy.id" } },
        } as any,
        input: {
          paymentId: "550e8400-e29b-41d4-a716-446655440000",
        },
      });

      expect(payment.simulatePurchase).toHaveBeenCalledWith(
        "550e8400-e29b-41d4-a716-446655440000",
        "u1",
      );
      expect(result.status).toBe("PENDING");
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
