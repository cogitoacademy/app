import { describe, expect, mock, test } from "bun:test";
import { createPaymentService } from "../../modules/payment/payment.service";
import { DEFAULT_V3_ECONOMY_CONFIG } from "../../modules/pricing/v3-economy.config";

// Service boundary harness; database locking is covered separately in integration tests.
function setup() {
  let active: any = {
    version: 4,
    values: structuredClone(DEFAULT_V3_ECONOMY_CONFIG),
  };
  const quotes: any[] = [];
  const payments: any[] = [];
  const wallet = { credit: mock(async () => ({})) };
  const provider = {
    createIntent: mock(async (_input: any): Promise<any> => ({
      checkoutUrl: "https://checkout.test/v3",
    })),
  };
  const repo = {
    findTopUpQuoteByRequestKey: async (userId: string, key: string) =>
      quotes.find((q) => q.userId === userId && q.requestKey === key) ?? null,
    insertTopUpQuote: async (q: any) => {
      quotes.push(q);
      return q;
    },
    findTopUpQuoteById: async (userId: string, id: string) =>
      quotes.find((q) => q.userId === userId && q.id === id) ?? null,
    findPaymentByQuote: async (id: string) =>
      payments.find((p) => p.quoteId === id) ?? null,
    insertPayment: async (p: any) => {
      const row = { checkoutUrl: null, ...p };
      payments.push(row);
      return row;
    },
    findPaymentById: async (id: string) =>
      payments.find((p) => p.id === id) ?? null,
    findPaymentByProviderReference: async (reference: string) =>
      payments.find((p) => p.providerReference === reference) ?? null,
    findPaymentByProviderEventId: async () => null,
    updatePaymentIntent: async (id: string, patch: any) => {
      Object.assign(
        payments.find((p) => p.id === id),
        patch,
      );
    },
    updatePaymentStatus: async (id: string, patch: any) => {
      Object.assign(
        payments.find((p) => p.id === id),
        patch,
      );
    },
    findLatestPaymentByUserAndPackageCode: async () => null,
  };
  const service = createPaymentService({
    db: { transaction: async (fn: any) => fn({}) } as any,
    economy: { getActiveV3Config: async () => active },
    wallet: wallet as any,
    repo: repo as any,
    provider: provider as any,
    providerName: "midtrans",
  });
  return {
    service,
    provider,
    wallet,
    quotes,
    payments,
    setActive: (value: any) => {
      active = value;
    },
  };
}

describe("V3 durable top-up offers", () => {
  test("rejects calculated amounts outside PostgreSQL integer capacity before persistence", async () => {
    const h = setup();
    await expect(
      h.service.createTopUpQuote("student", {
        requestKey: crypto.randomUUID(),
        marks: 1_000_000,
      }),
    ).rejects.toThrow("smaller top-up");
    expect(h.quotes).toHaveLength(0);
  });
  test("inactive pricing exposes no offers and rejects new quotes", async () => {
    const h = setup();
    h.setActive(null);
    expect((await h.service.getTopUpCatalog()).active).toBe(false);
    await expect(
      h.service.createTopUpQuote("student", {
        requestKey: crypto.randomUUID(),
        marks: 440,
      }),
    ).rejects.toThrow();
  });

  test("request replay preserves immutable terms after active config changes", async () => {
    const h = setup();
    const input = { requestKey: crypto.randomUUID(), marks: 440 };
    const quote = await h.service.createTopUpQuote("student", input);
    expect(quote.customAmountIdr).toBe(2_750_000);
    expect(quote.recommendedPackage?.marks).toBe(500);
    h.setActive(null);
    expect(await h.service.createTopUpQuote("student", input)).toEqual(quote);
    await expect(
      h.service.createTopUpQuote("student", { ...input, marks: 441 }),
    ).rejects.toThrow();
    expect(h.quotes).toHaveLength(1);
  });

  test.each(["custom", "recommended"] as const)(
    "honors explicit %s choice and locks it on retries",
    async (choice) => {
      const h = setup();
      const q = await h.service.createTopUpQuote("student", {
        requestKey: crypto.randomUUID(),
        marks: 440,
      });
      const first = await h.service.createPurchaseFromTopUpQuote(
        "student",
        "wallet",
        q.quoteId,
        choice,
      );
      h.quotes[0].expiresAt = new Date(0);
      expect(
        await h.service.createPurchaseFromTopUpQuote(
          "student",
          "wallet",
          q.quoteId,
          choice,
        ),
      ).toEqual(first);
      expect(h.provider.createIntent).toHaveBeenCalledTimes(1);
      expect(h.payments[0].marks).toBe(choice === "custom" ? 440 : 500);
      expect(h.payments[0].amountIdr).toBe(2_750_000);
      await expect(
        h.service.createPurchaseFromTopUpQuote(
          "student",
          "wallet",
          q.quoteId,
          choice === "custom" ? "recommended" : "custom",
        ),
      ).rejects.toThrow();
    },
  );

  test("expired and foreign offers never create a payment", async () => {
    const h = setup();
    const q = await h.service.createTopUpQuote("student", {
      requestKey: crypto.randomUUID(),
      marks: 50,
    });
    await expect(
      h.service.createPurchaseFromTopUpQuote(
        "other",
        "wallet",
        q.quoteId,
        "package",
      ),
    ).rejects.toThrow();
    h.quotes[0].expiresAt = new Date(0);
    await expect(
      h.service.createPurchaseFromTopUpQuote(
        "student",
        "wallet",
        q.quoteId,
        "package",
      ),
    ).rejects.toThrow();
    expect(h.provider.createIntent).not.toHaveBeenCalled();
    expect(h.payments).toHaveLength(0);
  });

  test("uncertain provider outcome retains one durable identity without a second POST", async () => {
    const h = setup();
    h.provider.createIntent.mockImplementation(async () => {
      throw new Error("connection lost");
    });
    const q = await h.service.createTopUpQuote("student", {
      requestKey: crypto.randomUUID(),
      marks: 50,
    });
    const first = await h.service.createPurchaseFromTopUpQuote(
      "student",
      "wallet",
      q.quoteId,
      "package",
    );
    expect(first.recoveryRequired).toBe(true);
    expect(h.payments[0].providerIntentState).toBe("UNCERTAIN");
    expect(
      (
        await h.service.createPurchaseFromTopUpQuote(
          "student",
          "wallet",
          q.quoteId,
          "package",
        )
      ).paymentId,
    ).toBe(first.paymentId);
    expect(h.provider.createIntent).toHaveBeenCalledTimes(1);
  });

  test.each([false, true])(
    "early webhook remains PAID when provider subsequently throws=%s",
    async (throws) => {
      const h = setup();
      h.provider.createIntent.mockImplementation(async (input) => {
        expect(h.payments[0].id).toBe(input.paymentId);
        await h.service.confirmFromWebhook({
          provider: "midtrans",
          providerReference: input.providerReference,
          providerEventId: "early",
          status: "PAID",
          amountIdr: input.amountIdr,
        });
        if (throws) throw new Error("response lost after success");
        return { checkoutUrl: "https://checkout.test/paid" };
      });
      const q = await h.service.createTopUpQuote("student", {
        requestKey: crypto.randomUUID(),
        marks: 50,
      });
      const result = await h.service.createPurchaseFromTopUpQuote(
        "student",
        "wallet",
        q.quoteId,
        "package",
      );
      expect(result.status).toBe("PAID");
      expect(result.recoveryRequired).toBe(false);
      await h.service.confirmFromWebhook({
        provider: "midtrans",
        providerReference: result.providerReference,
        providerEventId: "again",
        status: "PAID",
        amountIdr: 350_000,
      });
      expect(h.wallet.credit).toHaveBeenCalledTimes(1);
    },
  );

  test("active V3 rejects legacy package sales", async () => {
    const h = setup();
    await expect(
      h.service.createIntent("student", "wallet", "starter"),
    ).rejects.toThrow();
    expect(h.provider.createIntent).not.toHaveBeenCalled();
  });
});
