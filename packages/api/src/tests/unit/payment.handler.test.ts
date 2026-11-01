import { describe, expect, mock, test } from "bun:test";
import type { Context } from "../../context";
import { createPaymentHandler } from "../../modules/payment/payment.handler";
import type { PaymentService } from "../../modules/payment/payment.service";

function makeContext(email = "student@example.test"): Context {
  return {
    session: { user: { id: "student-1", email, role: "student" } },
    services: {} as Context["services"],
    headers: new Headers(),
  } as Context;
}

function setup(overrides: Record<string, unknown> = {}) {
  const payment = {
    createIntent: mock(async () => ({
      paymentId: "payment-1",
      providerReference: "reference-1",
      checkoutUrl: null,
      status: "PENDING",
      recoveryRequired: false,
    })),
    getTopUpCatalog: mock(async () => ({ active: false, packages: [] })),
    createTopUpQuote: mock(async () => ({ quoteId: "quote-1" })),
    createPurchaseFromTopUpQuote: mock(async () => ({
      paymentId: "payment-2",
      checkoutUrl: "https://checkout.example.test",
      purchaseLabel: "Custom top-up",
      quoteId: "quote-1",
      choice: "custom",
    })),
    simulatePurchase: mock(async () => ({
      status: "PENDING",
      message: "Pending",
    })),
    reconcilePurchase: mock(async () => {}),
    getPurchase: mock(async () => ({
      id: "payment-1",
      status: "PENDING",
      provider: "midtrans",
      providerReference: "reference-1",
      amountIdr: 350_000,
      marks: 50,
      receiptUrl: null,
      checkoutUrl: "https://checkout.example.test",
      failureReason: null,
      purchaseLabel: "Starter package",
      quoteId: null,
      quoteChoice: null,
      providerIntentState: "READY",
      createdAt: new Date("2026-10-28T00:00:00.000Z"),
    })),
    ...overrides,
  };
  const wallet = { getOrCreate: mock(async () => ({ id: "wallet-1" })) };
  return {
    payment,
    wallet,
    handler: createPaymentHandler(
      payment as unknown as PaymentService,
      wallet as never,
    ),
  };
}

describe("payment handler service contracts", () => {
  test("reports provider mode and protects legacy purchases in Test Mode", async () => {
    const { payment, wallet, handler } = setup();
    expect(await handler.getConfig()).toEqual({ testMode: false });
    const ordinaryPurchase = await handler.createPurchase({
      context: makeContext(),
      input: { packageCode: "starter" },
    });
    expect(ordinaryPurchase.canSimulate).toBe(false);
    await handler.getPurchase({
      context: makeContext(),
      input: { paymentId: "payment-1" },
    });
    expect(payment.reconcilePurchase).not.toHaveBeenCalled();

    const testMode = createPaymentHandler(
      payment as unknown as PaymentService,
      wallet as never,
      {
        providerMode: "test",
        testAllowedEmails: ["uat@example.test"],
        simulationEnabled: true,
      },
    );
    expect(await testMode.getConfig()).toEqual({ testMode: true });
    await expect(
      testMode.createPurchase({
        context: makeContext(),
        input: { packageCode: "starter" },
      }),
    ).rejects.toThrow(
      "Payment Test Mode is restricted to approved UAT accounts",
    );
    const purchase = await testMode.createPurchase({
      context: makeContext("uat@example.test"),
      input: { packageCode: "starter" },
    });
    expect(purchase.canSimulate).toBe(true);
    expect(payment.createIntent).toHaveBeenCalledWith(
      "student-1",
      "wallet-1",
      "starter",
    );
  });

  test("passes catalog and quote requests through the signed-in student", async () => {
    const { payment, handler } = setup();
    const catalog = await handler.getTopUpCatalog();
    const input = { requestKey: crypto.randomUUID(), marks: 50 };
    const quote = await handler.createTopUpQuote({
      context: makeContext(),
      input,
    });
    expect(catalog).toMatchObject({ active: false });
    expect(quote).toMatchObject({ quoteId: "quote-1" });
    expect(payment.getTopUpCatalog).toHaveBeenCalledTimes(1);
    expect(payment.createTopUpQuote).toHaveBeenCalledWith("student-1", input);
  });

  test("approved test account can reconcile and read a payment DTO", async () => {
    const { payment } = setup();
    const approved = createPaymentHandler(
      payment as unknown as PaymentService,
      { getOrCreate: mock() } as never,
      {
        providerMode: "test",
        testAllowedEmails: ["uat@example.test"],
      },
    );
    const result = await approved.getPurchase({
      context: makeContext("  UAT@example.test "),
      input: { paymentId: "payment-1" },
    });
    expect(payment.reconcilePurchase).toHaveBeenCalledWith(
      "payment-1",
      "student-1",
    );
    expect(result).toMatchObject({
      id: "payment-1",
      providerIntentState: "READY",
      createdAt: "2026-10-28T00:00:00.000Z",
    });
    expect(payment.getPurchase).toHaveBeenCalledWith("payment-1", "student-1");
  });

  test("approved Test Mode checkout and simulation expose simulation capability", async () => {
    const { payment, wallet } = setup();
    const approved = createPaymentHandler(
      payment as unknown as PaymentService,
      wallet as never,
      {
        providerMode: "test",
        testAllowedEmails: ["uat@example.test"],
        simulationEnabled: true,
      },
    );
    const context = makeContext("uat@example.test");
    const purchase = await approved.createPurchaseFromQuote({
      context,
      input: { quoteId: "quote-1", choice: "custom" },
    });
    const simulated = await approved.simulatePurchase({
      context,
      input: { paymentId: "payment-2" },
    });
    expect(wallet.getOrCreate).toHaveBeenCalledWith("student-1");
    expect(payment.createPurchaseFromTopUpQuote).toHaveBeenCalledWith(
      "student-1",
      "wallet-1",
      "quote-1",
      "custom",
    );
    expect(purchase.canSimulate).toBe(true);
    expect(simulated.status).toBe("PENDING");
    expect(payment.simulatePurchase).toHaveBeenCalledWith(
      "payment-2",
      "student-1",
    );
  });

  test("unapproved Test Mode actors cannot buy or simulate", async () => {
    const { payment, wallet } = setup();
    const restricted = createPaymentHandler(
      payment as unknown as PaymentService,
      wallet as never,
      {
        providerMode: "test",
        testAllowedEmails: ["uat@example.test"],
        simulationEnabled: false,
      },
    );
    const context = makeContext("student@example.test");
    await expect(
      restricted.createPurchaseFromQuote({
        context,
        input: { quoteId: "quote-1", choice: "custom" },
      }),
    ).rejects.toThrow(
      "Payment Test Mode is restricted to approved UAT accounts",
    );
    await expect(
      restricted.simulatePurchase({
        context,
        input: { paymentId: "payment-2" },
      }),
    ).rejects.toThrow(
      "Payment simulation is only available to approved Test Mode accounts",
    );
    expect(wallet.getOrCreate).not.toHaveBeenCalled();
    expect(payment.simulatePurchase).not.toHaveBeenCalled();
  });
});
