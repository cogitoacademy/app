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
  let quoteInsertRace: "insert" | "same" | "conflict" | "missing" = "insert";
  let paymentInsertRace: "insert" | "same" | "conflict" | "missing" = "insert";
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
      if (quoteInsertRace !== "insert") {
        if (quoteInsertRace !== "missing") {
          quotes.push({
            ...q,
            ...(quoteInsertRace === "conflict"
              ? { requestedMarks: q.requestedMarks + 1 }
              : {}),
          });
        }
        return null;
      }
      quotes.push(q);
      return q;
    },
    findTopUpQuoteById: async (userId: string, id: string) =>
      quotes.find((q) => q.userId === userId && q.id === id) ?? null,
    findPaymentByQuote: async (id: string) =>
      payments.find((p) => p.quoteId === id) ?? null,
    insertPayment: async (p: any) => {
      if (paymentInsertRace !== "insert") {
        if (paymentInsertRace !== "missing") {
          payments.push({
            checkoutUrl: "https://checkout.test/raced",
            ...p,
            ...(paymentInsertRace === "conflict"
              ? {
                  quoteChoice:
                    p.quoteChoice === "custom" ? "package" : "custom",
                }
              : {}),
          });
        }
        return null;
      }
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
    setQuoteInsertRace: (value: typeof quoteInsertRace) => {
      quoteInsertRace = value;
    },
    setPaymentInsertRace: (value: typeof paymentInsertRace) => {
      paymentInsertRace = value;
    },
  };
}

describe("V3 durable top-up offers", () => {
  test("creates a purchase through an explicit quote choice", async () => {
    const h = setup();
    const quote = await h.service.createTopUpQuote("student", {
      requestKey: crypto.randomUUID(),
      marks: 440,
    });

    const purchase = await h.service.createPurchaseFromTopUpQuote(
      "student",
      "wallet",
      quote.quoteId,
      "custom",
    );

    expect(purchase).toMatchObject({
      paymentId: expect.any(String),
      status: "PENDING",
      quoteId: quote.quoteId,
      choice: "custom",
    });
    expect(h.provider.createIntent).toHaveBeenCalledTimes(1);
  });

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

  test("package checkout is available only for an exact package quote", async () => {
    const h = setup();
    const quote = await h.service.createTopUpQuote("student", {
      requestKey: crypto.randomUUID(),
      marks: 50,
    });
    expect(quote.exactPackage).toMatchObject({
      code: "starter",
      marks: 50,
      priceIdr: 350_000,
    });

    const purchase = await h.service.createPurchaseFromTopUpQuote(
      "student",
      "wallet",
      quote.quoteId,
      "package",
    );
    expect(purchase.choice).toBe("package");
    expect(h.payments[0]).toMatchObject({ marks: 50, amountIdr: 350_000 });
    await expect(
      h.service.createPurchaseFromTopUpQuote(
        "student",
        "wallet",
        quote.quoteId,
        "custom",
      ),
    ).rejects.toThrow();
  });

  test("package checkout rejects a quote without an exact package", async () => {
    const h = setup();
    const quote = await h.service.createTopUpQuote("student", {
      requestKey: crypto.randomUUID(),
      marks: 51,
    });
    expect(quote.exactPackage).toBeNull();
    await expect(
      h.service.createPurchaseFromTopUpQuote(
        "student",
        "wallet",
        quote.quoteId,
        "package",
      ),
    ).rejects.toThrow();
    expect(h.payments).toHaveLength(0);
  });

  test.each([
    null,
    { packages: "invalid" },
    { packages: [], exactSurchargeIdr: "invalid" },
    { packages: [], exactSurchargeIdr: 0, customAmountIdr: "invalid" },
    {
      packages: [],
      exactSurchargeIdr: 0,
      customAmountIdr: 1,
      exactPackageCode: 1,
    },
    {
      packages: [],
      exactSurchargeIdr: 0,
      customAmountIdr: 1,
      exactPackageCode: null,
      recommendation: "invalid",
    },
  ])("rejects malformed immutable quote terms: %j", async (termsSnapshot) => {
    const h = setup();
    const quote = await h.service.createTopUpQuote("student", {
      requestKey: crypto.randomUUID(),
      marks: 60,
    });
    h.quotes[0].termsSnapshot = termsSnapshot;

    await expect(
      h.service.createPurchaseFromTopUpQuote(
        "student",
        "wallet",
        quote.quoteId,
        "custom",
      ),
    ).rejects.toThrow("Stored V3 top-up quote terms are invalid");
    expect(h.payments).toHaveLength(0);
  });

  test.each([
    ["same", "same"],
    ["conflict", "conflicting"],
  ] as const)(
    "top-up quote insertion race returns a %s immutable winner",
    async (race, outcome) => {
      const h = setup();
      h.setQuoteInsertRace(race);

      const request = {
        requestKey: crypto.randomUUID(),
        marks: 60,
      };
      if (outcome === "conflicting") {
        await expect(
          h.service.createTopUpQuote("student", request),
        ).rejects.toThrow();
        return;
      }

      const winner = await h.service.createTopUpQuote("student", request);
      expect(winner.marks).toBe(request.marks);
      expect(h.quotes).toHaveLength(1);
    },
  );

  test("fails closed when quote or payment insert races have no winner", async () => {
    const quoteRace = setup();
    quoteRace.setQuoteInsertRace("missing");
    await expect(
      quoteRace.service.createTopUpQuote("student", {
        requestKey: crypto.randomUUID(),
        marks: 60,
      }),
    ).rejects.toThrow("Top-up quote could not be saved");

    const paymentRace = setup();
    paymentRace.setPaymentInsertRace("missing");
    const quote = await paymentRace.service.createTopUpQuote("student", {
      requestKey: crypto.randomUUID(),
      marks: 50,
    });
    await expect(
      paymentRace.service.createPurchaseFromTopUpQuote(
        "student",
        "wallet",
        quote.quoteId,
        "package",
      ),
    ).rejects.toThrow("Top-up payment could not be saved");
  });

  test("payment insertion races reuse the same choice and reject a different one", async () => {
    const same = setup();
    same.setPaymentInsertRace("same");
    const sameQuote = await same.service.createTopUpQuote("student", {
      requestKey: crypto.randomUUID(),
      marks: 50,
    });
    const reused = await same.service.createPurchaseFromTopUpQuote(
      "student",
      "wallet",
      sameQuote.quoteId,
      "package",
    );
    expect(reused.checkoutUrl).toBe("https://checkout.test/raced");
    expect(same.provider.createIntent).not.toHaveBeenCalled();

    const conflict = setup();
    conflict.setPaymentInsertRace("conflict");
    const conflictQuote = await conflict.service.createTopUpQuote("student", {
      requestKey: crypto.randomUUID(),
      marks: 50,
    });
    await expect(
      conflict.service.createPurchaseFromTopUpQuote(
        "student",
        "wallet",
        conflictQuote.quoteId,
        "package",
      ),
    ).rejects.toThrow();
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

  test("inactive V3 also rejects legacy package sales", async () => {
    const h = setup();
    h.setActive(null);
    await expect(
      h.service.createIntent("student", "wallet", "starter"),
    ).rejects.toThrow();
    expect(h.provider.createIntent).not.toHaveBeenCalled();
  });

  test("active V3 rejects legacy package sales", async () => {
    const h = setup();
    await expect(
      h.service.createIntent("student", "wallet", "starter"),
    ).rejects.toThrow();
    expect(h.provider.createIntent).not.toHaveBeenCalled();
  });
});
