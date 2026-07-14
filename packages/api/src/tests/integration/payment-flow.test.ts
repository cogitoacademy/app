import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import { ledgerEntry, paymentRecord } from "@cogito-app/db/schema";

import { services } from "../../services";
import { createTestUser } from "../helpers/factories";
import { resetDatabase } from "../helpers/test-client";
import { createXenditPaymentProvider } from "../../modules/payment/xendit-payment.provider";
import { createPaymentService } from "../../modules/payment/payment.service";
import { createWalletRepo } from "../../modules/wallet/wallet.repo";
import { createWalletService } from "../../modules/wallet/wallet.service";

describe("PaymentService", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  test("TC-03: createPurchase then webhook confirm credits wallet", async () => {
    const user = await createTestUser("tc03@cogito.test");
    const walletRow = await services.wallet.getOrCreate(user.id);

    const intent = await services.payment.createIntent(
      user.id,
      walletRow.id,
      "starter",
    );
    expect(intent.providerReference).toContain("stub-");

    await services.payment.confirmFromWebhook({
      provider: "stub",
      providerReference: intent.providerReference,
      providerEventId: "evt_tc03",
      status: "PAID",
    });

    const w = await services.wallet.getByUserId(db, user.id);
    expect(w).not.toBeNull();
    expect(w!.totalBalance).toBe(50);

    const entries = await db
      .select()
      .from(ledgerEntry)
      .where(eq(ledgerEntry.walletId, walletRow.id));
    expect(entries.length).toBe(1);
    expect(entries[0]!.entryType).toBe("credit");
    expect(entries[0]!.amount).toBe(50);
    expect(entries[0]!.eventKey).toContain("purchase.");
  });

  test("TC-04: duplicate webhook is idempotent", async () => {
    const user = await createTestUser("tc04@cogito.test");
    const walletRow = await services.wallet.getOrCreate(user.id);
    const intent = await services.payment.createIntent(
      user.id,
      walletRow.id,
      "learner",
    );

    await services.payment.confirmFromWebhook({
      provider: "stub",
      providerReference: intent.providerReference,
      providerEventId: "evt_dup",
      status: "PAID",
    });
    await services.payment.confirmFromWebhook({
      provider: "stub",
      providerReference: intent.providerReference,
      providerEventId: "evt_dup",
      status: "PAID",
    });

    const w = await services.wallet.getByUserId(db, user.id);
    expect(w!.totalBalance).toBe(120);

    const entries = await db
      .select()
      .from(ledgerEntry)
      .where(eq(ledgerEntry.walletId, walletRow.id));
    expect(entries.length).toBe(1);
  });

  test("TC-04 negative: failed payment does not credit", async () => {
    const user = await createTestUser("tc04f@cogito.test");
    const walletRow = await services.wallet.getOrCreate(user.id);
    const intent = await services.payment.createIntent(
      user.id,
      walletRow.id,
      "starter",
    );

    await services.payment.confirmFromWebhook({
      provider: "stub",
      providerReference: intent.providerReference,
      providerEventId: "evt_fail",
      status: "FAILED",
      failureReason: "declined",
    });

    const w = await services.wallet.getByUserId(db, user.id);
    expect(w!.totalBalance).toBe(0);

    const record = await db
      .select()
      .from(paymentRecord)
      .where(eq(paymentRecord.id, intent.paymentId))
      .limit(1);
    expect(record[0]!.status).toBe("FAILED");
    expect(record[0]!.failureReason).toBe("declined");
  });

  test("TC-35: no cashout/convert/withdraw methods exist", () => {
    const methods = Object.keys(services.payment);
    expect(methods).not.toContain("cashout");
    expect(methods).not.toContain("convertToRupiah");
    expect(methods).not.toContain("withdraw");
  });

  const xenditProvider = createXenditPaymentProvider({
    secretKey: "xnd_development_test",
    webhookToken: "wh_token_test",
    successRedirectUrl: "http://localhost:3000/balance?status=success",
    failureRedirectUrl: "http://localhost:3000/balance?status=failed",
  });

  const xenditWallet = createWalletService(createWalletRepo(db), db);
  const xenditPayment = createPaymentService({
    db,
    wallet: xenditWallet,
    provider: xenditProvider,
    providerName: "xendit",
  });

  describe("PaymentService (Xendit provider)", () => {
    let originalFetch: typeof globalThis.fetch;

    beforeAll(async () => {
      await resetDatabase();
    });

    beforeEach(() => {
      originalFetch = globalThis.fetch;
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                id: "pr_test",
                reference_id: "xendit-test",
                status: "PENDING",
                actions: [{ url: "https://checkout.xendit.co/test" }],
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        ),
      ) as never;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    test("createIntent creates PENDING record with xendit provider reference", async () => {
      const user = await createTestUser("xc01@cogito.test");
      const walletRow = await xenditWallet.getOrCreate(user.id);

      const intent = await xenditPayment.createIntent(
        user.id,
        walletRow.id,
        "starter",
      );
      expect(intent.providerReference).toContain("xendit:");

      const [record] = await db
        .select()
        .from(paymentRecord)
        .where(eq(paymentRecord.id, intent.paymentId))
        .limit(1);
      expect(record!.provider).toBe("xendit");
      expect(record!.status).toBe("PENDING");
    });

    test("PAID webhook credits wallet", async () => {
      const user = await createTestUser("xc02@cogito.test");
      const walletRow = await xenditWallet.getOrCreate(user.id);

      const intent = await xenditPayment.createIntent(
        user.id,
        walletRow.id,
        "starter",
      );

      await xenditPayment.confirmFromWebhook({
        provider: "xendit",
        providerReference: intent.providerReference,
        providerEventId: "evt_xc02",
        status: "PAID",
      });

      const w = await xenditWallet.getByUserId(db, user.id);
      expect(w!.totalBalance).toBe(50);

      const [record] = await db
        .select()
        .from(paymentRecord)
        .where(eq(paymentRecord.id, intent.paymentId))
        .limit(1);
      expect(record!.status).toBe("PAID");
    });

    test("SETTLED after PAID is idempotent — no double credit", async () => {
      const user = await createTestUser("xc03@cogito.test");
      const walletRow = await xenditWallet.getOrCreate(user.id);

      const intent = await xenditPayment.createIntent(
        user.id,
        walletRow.id,
        "learner",
      );

      await xenditPayment.confirmFromWebhook({
        provider: "xendit",
        providerReference: intent.providerReference,
        providerEventId: "evt_xc03a",
        status: "PAID",
      });
      await xenditPayment.confirmFromWebhook({
        provider: "xendit",
        providerReference: intent.providerReference,
        providerEventId: "evt_xc03b",
        status: "SETTLED",
      });

      const w = await xenditWallet.getByUserId(db, user.id);
      expect(w!.totalBalance).toBe(120);

      const [record] = await db
        .select()
        .from(paymentRecord)
        .where(eq(paymentRecord.id, intent.paymentId))
        .limit(1);
      expect(record!.status).toBe("PAID");
    });

    test("EXPIRED webhook does not credit", async () => {
      const user = await createTestUser("xc04@cogito.test");
      const walletRow = await xenditWallet.getOrCreate(user.id);

      const intent = await xenditPayment.createIntent(
        user.id,
        walletRow.id,
        "starter",
      );

      await xenditPayment.confirmFromWebhook({
        provider: "xendit",
        providerReference: intent.providerReference,
        providerEventId: "evt_xc04",
        status: "EXPIRED",
      });

      const w = await xenditWallet.getByUserId(db, user.id);
      expect(w!.totalBalance).toBe(0);

      const [record] = await db
        .select()
        .from(paymentRecord)
        .where(eq(paymentRecord.id, intent.paymentId))
        .limit(1);
      expect(record!.status).toBe("EXPIRED");
    });

    test("FAILED webhook records failure reason", async () => {
      const user = await createTestUser("xc05@cogito.test");
      const walletRow = await xenditWallet.getOrCreate(user.id);

      const intent = await xenditPayment.createIntent(
        user.id,
        walletRow.id,
        "starter",
      );

      await xenditPayment.confirmFromWebhook({
        provider: "xendit",
        providerReference: intent.providerReference,
        providerEventId: "evt_xc05",
        status: "FAILED",
        failureReason: "DECLINED",
      });

      const [record] = await db
        .select()
        .from(paymentRecord)
        .where(eq(paymentRecord.id, intent.paymentId))
        .limit(1);
      expect(record!.status).toBe("FAILED");
      expect(record!.failureReason).toBe("DECLINED");
    });

    test("duplicate PAID webhook is idempotent", async () => {
      const user = await createTestUser("xc06@cogito.test");
      const walletRow = await xenditWallet.getOrCreate(user.id);

      const intent = await xenditPayment.createIntent(
        user.id,
        walletRow.id,
        "starter",
      );

      await xenditPayment.confirmFromWebhook({
        provider: "xendit",
        providerReference: intent.providerReference,
        providerEventId: "evt_xc06",
        status: "PAID",
      });
      await xenditPayment.confirmFromWebhook({
        provider: "xendit",
        providerReference: intent.providerReference,
        providerEventId: "evt_xc06",
        status: "PAID",
      });

      const w = await xenditWallet.getByUserId(db, user.id);
      expect(w!.totalBalance).toBe(50);

      const entries = await db
        .select()
        .from(ledgerEntry)
        .where(eq(ledgerEntry.walletId, walletRow.id));
      expect(entries.length).toBe(1);
    });
  });
});
