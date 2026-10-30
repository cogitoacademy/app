import { beforeAll, describe, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import { economyV3TopUpQuote, paymentRecord } from "@cogito-app/db/schema";
import { services } from "../../services";
import { createEconomyService } from "../../modules/economy/economy.service";
import { createPaymentRepo } from "../../modules/payment/payment.repo";
import { createPaymentService } from "../../modules/payment/payment.service";
import {
  createTestContext,
  resetDatabase,
  signUpAndSignIn,
} from "../helpers/test-client";

describe("V3 top-up PostgreSQL transaction boundaries", () => {
  let userId: string;
  let walletId: string;
  const provider = {
    createIntent: mock(async (_input: any) => ({
      checkoutUrl: "https://checkout.test/durable",
    })),
  };
  const economy = createEconomyService({ db });
  const service = createPaymentService({
    db,
    economy,
    repo: createPaymentRepo(db),
    wallet: services.wallet,
    provider: provider as any,
    providerName: "midtrans",
  });

  beforeAll(async () => {
    await resetDatabase();
    const account = await signUpAndSignIn(
      "v3.topup@cogito.test",
      "Test1234!",
      "V3 Top Up",
    );
    userId = (await createTestContext(account.cookie)).session!.user.id;
    walletId = (await services.wallet.getOrCreate(userId)).id;
    expect(await economy.getActiveV3Config()).not.toBeNull();
  });

  test("concurrent quote requests and purchases persist one offer and one provider POST", async () => {
    const input = { requestKey: crypto.randomUUID(), marks: 440 };
    const [first, second] = await Promise.all([
      service.createTopUpQuote(userId, input),
      service.createTopUpQuote(userId, input),
    ]);
    expect(first).toEqual(second);
    const outcomes = await Promise.all(
      Array.from({ length: 4 }, () =>
        service.createPurchaseFromTopUpQuote(
          userId,
          walletId,
          first.quoteId,
          "custom",
        ),
      ),
    );
    expect(new Set(outcomes.map((p) => p.paymentId)).size).toBe(1);
    expect(provider.createIntent).toHaveBeenCalledTimes(1);
    const rows = await db
      .select()
      .from(paymentRecord)
      .where(eq(paymentRecord.quoteId, first.quoteId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amountIdr).toBe(2_750_000);
    expect(rows[0]!.marks).toBe(440);
    await expect(
      service.createPurchaseFromTopUpQuote(
        userId,
        walletId,
        first.quoteId,
        "recommended",
      ),
    ).rejects.toThrow();
  });

  test("late confirmation credits stored Marks once after the offer expires", async () => {
    const quote = await service.createTopUpQuote(userId, {
      requestKey: crypto.randomUUID(),
      marks: 50,
    });
    const purchase = await service.createPurchaseFromTopUpQuote(
      userId,
      walletId,
      quote.quoteId,
      "package",
    );
    await db
      .update(economyV3TopUpQuote)
      .set({ expiresAt: new Date(0) })
      .where(eq(economyV3TopUpQuote.id, quote.quoteId));
    const before = await services.wallet.getByUserId(db, userId);
    const event = {
      provider: "midtrans",
      providerReference: purchase.providerReference,
      providerEventId: crypto.randomUUID(),
      status: "PAID" as const,
      amountIdr: 350_000,
    };
    await service.confirmFromWebhook(event);
    await service.confirmFromWebhook(event);
    const after = await services.wallet.getByUserId(db, userId);
    expect(after!.totalBalance - before!.totalBalance).toBe(50);
    expect(
      (
        await service.createPurchaseFromTopUpQuote(
          userId,
          walletId,
          quote.quoteId,
          "package",
        )
      ).status,
    ).toBe("PAID");
  });
});
