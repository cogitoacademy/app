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
import {
  ledgerEntry,
  paymentRecord,
  notification,
  notificationDispatch,
} from "@cogito-app/db/schema";

import { services } from "../../services";
import { createTestUser } from "../helpers/factories";
import { resetDatabase } from "../helpers/test-client";
import { createXenditPaymentProvider } from "../../modules/payment/xendit-payment.provider";
import { createMidtransPaymentProvider } from "../../modules/payment/midtrans-payment.provider";
import { createPaymentService } from "../../modules/payment/payment.service";
import { createPaymentRepo } from "../../modules/payment/payment.repo";
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
    expect(intent.providerReference).toContain("stub:");

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

  test("B6: inserting a duplicate provider_reference is a no-op (unique index + onConflictDoNothing)", async () => {
    const user = await createTestUser(`b6.${Date.now()}@cogito.test`);
    const walletRow = await services.wallet.getOrCreate(user.id);

    const intent = await services.payment.createIntent(
      user.id,
      walletRow.id,
      "starter",
    );

    // Simulate the check-then-insert race: a second writer inserts the same
    // provider reference while the row already exists. Must NOT create a
    // zombie PENDING row.
    const repo = createPaymentRepo(db);
    await repo.insertPayment({
      id: crypto.randomUUID(),
      userId: user.id,
      walletId: walletRow.id,
      provider: "stub",
      providerReference: intent.providerReference,
      amountIdr: 430000,
      marks: 50,
      status: "PENDING",
    });

    const rows = await db
      .select()
      .from(paymentRecord)
      .where(eq(paymentRecord.providerReference, intent.providerReference));
    expect(rows.length).toBe(1);
  });

  test("TC-re: FAILED payment can be re-purchased with a fresh intent", async () => {
    const user = await createTestUser("rerepurchase@cogito.test");
    const walletRow = await services.wallet.getOrCreate(user.id);

    const first = await services.payment.createIntent(
      user.id,
      walletRow.id,
      "starter",
    );

    await services.payment.confirmFromWebhook({
      provider: "stub",
      providerReference: first.providerReference,
      providerEventId: "evt_rep1",
      status: "FAILED",
      failureReason: "declined",
    });

    const retry = await services.payment.createIntent(
      user.id,
      walletRow.id,
      "starter",
    );

    expect(retry.paymentId).not.toBe(first.paymentId);
    expect(retry.providerReference).not.toBe(first.providerReference);
    expect(retry.providerReference).toContain(first.providerReference);
    expect(retry.checkoutUrl).toBeDefined();

    const [firstRecord] = await db
      .select()
      .from(paymentRecord)
      .where(eq(paymentRecord.id, first.paymentId))
      .limit(1);
    expect(firstRecord!.status).toBe("FAILED");

    const [retryRecord] = await db
      .select()
      .from(paymentRecord)
      .where(eq(paymentRecord.id, retry.paymentId))
      .limit(1);
    expect(retryRecord!.status).toBe("PENDING");

    await services.payment.confirmFromWebhook({
      provider: "stub",
      providerReference: retry.providerReference,
      providerEventId: "evt_rep2",
      status: "PAID",
    });

    const w = await services.wallet.getByUserId(db, user.id);
    expect(w!.totalBalance).toBe(50);
  });

  test("TC-re-success: PAID payment can be purchased again without reusing its row", async () => {
    const user = await createTestUser("rerepurchase-paid@cogito.test");
    const walletRow = await services.wallet.getOrCreate(user.id);

    const first = await services.payment.createIntent(
      user.id,
      walletRow.id,
      "starter",
    );
    await services.payment.confirmFromWebhook({
      provider: "stub",
      providerReference: first.providerReference,
      providerEventId: "evt_rep_paid1",
      status: "PAID",
    });

    const retry = await services.payment.createIntent(
      user.id,
      walletRow.id,
      "starter",
    );

    expect(retry.paymentId).not.toBe(first.paymentId);
    expect(retry.providerReference).not.toBe(first.providerReference);
    expect(retry.checkoutUrl).toBeDefined();

    const [firstRecord] = await db
      .select()
      .from(paymentRecord)
      .where(eq(paymentRecord.id, first.paymentId))
      .limit(1);
    expect(firstRecord!.status).toBe("PAID");

    await services.payment.confirmFromWebhook({
      provider: "stub",
      providerReference: retry.providerReference,
      providerEventId: "evt_rep_paid2",
      status: "PAID",
    });

    const w = await services.wallet.getByUserId(db, user.id);
    expect(w!.totalBalance).toBe(100);
  });

  test("TC-notif: webhook credit writes a payment notification (in-app + email) for the payer", async () => {
    const user = await createTestUser("paynotif@cogito.test");
    const walletRow = await services.wallet.getOrCreate(user.id);

    const intent = await services.payment.createIntent(
      user.id,
      walletRow.id,
      "starter",
    );

    await services.payment.confirmFromWebhook({
      provider: "stub",
      providerReference: intent.providerReference,
      providerEventId: "evt_paynotif",
      status: "PAID",
    });

    const [notif] = await db
      .select()
      .from(notification)
      .where(eq(notification.eventKey, `payment.${intent.paymentId}.credited`));
    expect(notif).toBeDefined();
    expect(notif!.category).toBe("payment");
    expect(notif!.userId).toBe(user.id);

    const [dispatch] = await db
      .select()
      .from(notificationDispatch)
      .where(eq(notificationDispatch.notificationId, notif!.id));
    expect(dispatch).toBeDefined();
    expect(dispatch!.status).toBe("queued");
    expect(dispatch!.recipientEmail).toBe(user.email);
  });

  test("TC-notif: REFUNDED transition writes a refund notification for the payer", async () => {
    const user = await createTestUser("refundnotif@cogito.test");
    const walletRow = await services.wallet.getOrCreate(user.id);

    const intent = await services.payment.createIntent(
      user.id,
      walletRow.id,
      "starter",
    );

    await services.payment.confirmFromWebhook({
      provider: "stub",
      providerReference: intent.providerReference,
      providerEventId: "evt_refundnotif1",
      status: "PAID",
    });
    await services.payment.confirmFromWebhook({
      provider: "stub",
      providerReference: intent.providerReference,
      providerEventId: "evt_refundnotif2",
      status: "REFUNDED",
    });

    const [notif] = await db
      .select()
      .from(notification)
      .where(eq(notification.eventKey, `payment.${intent.paymentId}.refunded`));
    expect(notif).toBeDefined();
    expect(notif!.category).toBe("refund");
    expect(notif!.userId).toBe(user.id);

    const [dispatch] = await db
      .select()
      .from(notificationDispatch)
      .where(eq(notificationDispatch.notificationId, notif!.id));
    expect(dispatch).toBeDefined();
    expect(dispatch!.status).toBe("queued");
  });

  const xenditProvider = createXenditPaymentProvider({
    secretKey: "xnd_development_test",
    webhookToken: "wh_token_test",
    mode: "test",
    successRedirectUrl: "http://localhost:3000/balance?status=success",
    failureRedirectUrl: "http://localhost:3000/balance?status=failed",
  });

  const xenditWallet = createWalletService(createWalletRepo(), db);
  const xenditPayment = createPaymentService({
    db,
    wallet: xenditWallet,
    repo: createPaymentRepo(db),
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
              id: "pr_test",
              payment_request_id: "pr_test",
              reference_id: "xendit-test",
              status: "REQUIRES_ACTION",
              actions: [
                {
                  type: "REDIRECT_CUSTOMER",
                  value: "https://checkout.xendit.co/test",
                  descriptor: "WEB_URL",
                },
              ],
            }),
            { status: 201, headers: { "content-type": "application/json" } },
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

  const midtransProvider = createMidtransPaymentProvider({
    serverKey: "SB-Mid-server-test",
    merchantId: "G123456789",
    mode: "test",
    resolvePayment: async (paymentId) => {
      const [record] = await db
        .select()
        .from(paymentRecord)
        .where(eq(paymentRecord.id, paymentId))
        .limit(1);
      return record ? { providerReference: record.providerReference } : null;
    },
  });

  const midtransWallet = createWalletService(createWalletRepo(), db);
  const midtransPayment = createPaymentService({
    db,
    wallet: midtransWallet,
    repo: createPaymentRepo(db),
    provider: midtransProvider,
    providerName: "midtrans",
  });

  describe("PaymentService (Midtrans provider)", () => {
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
              token: "66e4fa55-fdac-4ef9-91b5-733b97d1b862",
              redirect_url:
                "https://app.sandbox.midtrans.com/snap/v2/vtweb/66e4fa55-fdac-4ef9-91b5-733b97d1b862",
            }),
            { status: 201, headers: { "content-type": "application/json" } },
          ),
        ),
      ) as never;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    test("createIntent creates PENDING record with midtrans provider reference and Snap redirect URL", async () => {
      const user = await createTestUser("mc01@cogito.test");
      const walletRow = await midtransWallet.getOrCreate(user.id);

      const intent = await midtransPayment.createIntent(
        user.id,
        walletRow.id,
        "starter",
      );
      expect(intent.providerReference).toContain("midtrans:");
      expect(intent.checkoutUrl).toContain("app.sandbox.midtrans.com");

      const [record] = await db
        .select()
        .from(paymentRecord)
        .where(eq(paymentRecord.id, intent.paymentId))
        .limit(1);
      expect(record!.provider).toBe("midtrans");
      expect(record!.status).toBe("PENDING");
      // The provider request id is the payment UUID (Snap order_id).
      expect(record!.providerRequestId).toBe(intent.paymentId);
    });

    test("SETTLED webhook credits wallet once (idempotent)", async () => {
      const user = await createTestUser("mc02@cogito.test");
      const walletRow = await midtransWallet.getOrCreate(user.id);

      const intent = await midtransPayment.createIntent(
        user.id,
        walletRow.id,
        "starter",
      );

      await midtransPayment.confirmFromWebhook({
        provider: "midtrans",
        providerReference: intent.providerReference,
        providerEventId: "evt_mc02",
        status: "SETTLED",
      });
      await midtransPayment.confirmFromWebhook({
        provider: "midtrans",
        providerReference: intent.providerReference,
        providerEventId: "evt_mc02",
        status: "SETTLED",
      });

      const w = await midtransWallet.getByUserId(db, user.id);
      expect(w!.totalBalance).toBe(50);

      const entries = await db
        .select()
        .from(ledgerEntry)
        .where(eq(ledgerEntry.walletId, walletRow.id));
      expect(entries.length).toBe(1);
    });

    test("EXPIRED webhook does not credit", async () => {
      const user = await createTestUser("mc03@cogito.test");
      const walletRow = await midtransWallet.getOrCreate(user.id);

      const intent = await midtransPayment.createIntent(
        user.id,
        walletRow.id,
        "starter",
      );

      await midtransPayment.confirmFromWebhook({
        provider: "midtrans",
        providerReference: intent.providerReference,
        providerEventId: "evt_mc03",
        status: "EXPIRED",
      });

      const w = await midtransWallet.getByUserId(db, user.id);
      expect(w!.totalBalance).toBe(0);

      const [record] = await db
        .select()
        .from(paymentRecord)
        .where(eq(paymentRecord.id, intent.paymentId))
        .limit(1);
      expect(record!.status).toBe("EXPIRED");
    });

    test("reconcilePurchase resolves the stored provider reference from the order_id", async () => {
      const user = await createTestUser("mc04@cogito.test");
      const walletRow = await midtransWallet.getOrCreate(user.id);

      const intent = await midtransPayment.createIntent(
        user.id,
        walletRow.id,
        "starter",
      );

      globalThis.fetch = mock(() =>
        Promise.resolve(
          Response.json({
            transaction_status: "settlement",
            transaction_id: "txn_mc04",
            order_id: intent.paymentId,
            fraud_status: "accept",
          }),
        ),
      ) as never;

      const reconciled = await midtransPayment.reconcilePurchase(
        intent.paymentId,
        user.id,
      );
      expect(reconciled.status).toBe("SETTLED");

      const w = await midtransWallet.getByUserId(db, user.id);
      expect(w!.totalBalance).toBe(50);
    });
  });
});
