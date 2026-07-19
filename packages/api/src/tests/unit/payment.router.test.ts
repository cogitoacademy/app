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
});
