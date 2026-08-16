import { describe, test, expect, beforeAll } from "bun:test";
import { eq, and } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  wallet,
  ledgerEntry,
  refundRecord,
  paymentRecord,
  auditLog,
} from "@cogito-app/db/schema";
import type { DbOrTx } from "../../lib/tx";

import {
  createTestContext,
  createTestClient,
  signUpAndSignIn,
  setUserRole,
  resetDatabase,
  type TestClient,
} from "../helpers/test-client";

async function creditWallet(userId: string, amount: number) {
  const { services } = await import("@cogito-app/api/services");
  const w = await services.wallet.getOrCreate(userId);
  await db
    .update(wallet)
    .set({ totalBalance: amount, availableBalance: amount })
    .where(eq(wallet.id, w.id));
  return w;
}

describe("Refund flow", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();
  const adminEmail = `admin.refund.${ts}@cogito.test`;
  const studentEmail = `student.refund.${ts}@cogito.test`;
  const payerEmail = `payer.refund.${ts}@cogito.test`;

  let adminClient: TestClient;
  let adminId: string;
  let walletId: string;
  let payerWalletId: string;
  let payerUserId: string;

  beforeAll(async () => {
    const adminRes = await signUpAndSignIn(
      adminEmail,
      "Test1234!",
      "Admin Refund",
    );
    const adminCtx = await createTestContext(adminRes.cookie);
    if (!adminCtx.session?.user) throw new Error("Admin session missing");
    adminId = adminCtx.session.user.id;
    await setUserRole(adminId, "admin");
    adminClient = createTestClient(await createTestContext(adminRes.cookie));

    const studentRes = await signUpAndSignIn(
      studentEmail,
      "Test1234!",
      "Student Refund",
    );
    const studentCtx = await createTestContext(studentRes.cookie);
    if (!studentCtx.session?.user) throw new Error("Student session missing");
    const w = await creditWallet(studentCtx.session.user.id, 200);
    walletId = w.id;

    const payerRes = await signUpAndSignIn(
      payerEmail,
      "Test1234!",
      "Payer Refund",
    );
    const payerCtx = await createTestContext(payerRes.cookie);
    if (!payerCtx.session?.user) throw new Error("Payer session missing");
    payerUserId = payerCtx.session.user.id;
    const pw = await creditWallet(payerUserId, 0);
    payerWalletId = pw.id;
  });

  test("admin creates a compensate_credit correction → ledger + refundRecord + audit", async () => {
    const result = await adminClient.refund.createCorrection({
      walletId,
      amount: 25,
      type: "compensate_credit",
      reason: "Sesi offline dibatalkan oleh tutor",
    });
    expect(result.walletId).toBe(walletId);
    expect(result.type).toBe("compensate_credit");
    expect(result.amount).toBe(25);

    const entries = await db
      .select()
      .from(ledgerEntry)
      .where(eq(ledgerEntry.walletId, walletId));
    const correction = entries.find((e) => e.entryType === "compensate_credit");
    expect(correction).toBeDefined();
    expect(correction!.amount).toBe(25);
    expect(correction!.actorType).toBe("admin");
    expect(correction!.eventKey).toContain("correction.compensate_credit");
    expect(correction!.beforeBalance).toBe(200);
    expect(correction!.afterBalance).toBe(225);

    const [w] = await db.select().from(wallet).where(eq(wallet.id, walletId));
    expect(w!.totalBalance).toBe(225);
    expect(w!.availableBalance).toBe(225);

    const records = await db
      .select()
      .from(refundRecord)
      .where(eq(refundRecord.walletId, walletId));
    const record = records.find((r) => r.marks === 25);
    expect(record).toBeDefined();
    expect(record!.paymentId).toBeNull();
    expect(record!.reason).toBe("Sesi offline dibatalkan oleh tutor");
    expect(record!.actorId).toBe(adminId);

    const logs = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, "correction_compensate_credit"),
          eq(auditLog.targetId, walletId),
        ),
      );
    expect(logs.length).toBe(1);
    expect(logs[0]!.actorId).toBe(adminId);
    expect(logs[0]!.actorType).toBe("admin");
    expect(logs[0]!.beforeState).toEqual({
      totalBalance: 200,
      heldBalance: 0,
      availableBalance: 200,
    });
    expect(logs[0]!.afterState).toEqual({
      totalBalance: 225,
      heldBalance: 0,
      availableBalance: 225,
    });
  });

  test("listCorrections returns only compensating entries", async () => {
    const result = await adminClient.refund.listCorrections({
      walletId,
    });
    expect(result.items.length).toBe(1);
    expect(result.items[0]!.entryType).toBe("compensate_credit");
    expect(result.items[0]!.amount).toBe(25);
  });

  test("admin refunds a paid payment → payment REFUNDED + wallet credit + refundRecord", async () => {
    const { services } = await import("@cogito-app/api/services");
    const intent = await services.payment.createIntent(
      payerUserId,
      payerWalletId,
      "starter",
    );
    await services.payment.confirmFromWebhook({
      provider: "stub",
      providerReference: intent.providerReference,
      providerEventId: `evt_refund_${ts}`,
      status: "PAID",
    });

    const [paid] = await db
      .select()
      .from(paymentRecord)
      .where(eq(paymentRecord.id, intent.paymentId))
      .limit(1);
    expect(paid!.status).toBe("PAID");
    expect(paid!.marks).toBe(50);

    const result = await adminClient.adminBooking.adminRefund({
      paymentId: intent.paymentId,
      reason: "Pembayaran ganda",
    });
    expect(result.paymentId).toBe(intent.paymentId);
    expect(result.status).toBe("refunded");

    const [after] = await db
      .select()
      .from(paymentRecord)
      .where(eq(paymentRecord.id, intent.paymentId))
      .limit(1);
    expect(after!.status).toBe("REFUNDED");

    const entries = await db
      .select()
      .from(ledgerEntry)
      .where(eq(ledgerEntry.walletId, payerWalletId));
    const refundEntry = entries.find(
      (e) => e.entryType === "compensate_credit",
    );
    expect(refundEntry).toBeDefined();
    expect(refundEntry!.amount).toBe(50);
    expect(refundEntry!.actorType).toBe("admin");
    expect(refundEntry!.sourceReference).toBe(intent.paymentId);
    expect(refundEntry!.reason).toContain("Pembayaran ganda");

    const [w] = await db
      .select()
      .from(wallet)
      .where(eq(wallet.id, payerWalletId));
    expect(w!.totalBalance).toBe(100);
    expect(w!.availableBalance).toBe(100);

    const records = await db
      .select()
      .from(refundRecord)
      .where(eq(refundRecord.paymentId, intent.paymentId));
    expect(records.length).toBe(1);
    expect(records[0]!.marks).toBe(50);
    expect(records[0]!.walletId).toBe(payerWalletId);
    expect(records[0]!.actorId).toBe(adminId);

    const logs = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, "admin_refund"),
          eq(auditLog.targetId, intent.paymentId),
        ),
      );
    expect(logs.length).toBe(1);
    expect(logs[0]!.actorId).toBe(adminId);
    expect(logs[0]!.beforeState).toEqual({ status: "PAID" });
    expect(logs[0]!.afterState).toEqual({
      status: "REFUNDED",
      reason: "Pembayaran ganda",
    });
  });

  test("B2: a REFUNDED webhook holding a stale PAID snapshot must not reverse marks after an admin refund", async () => {
    const { services } = await import("@cogito-app/api/services");
    const intent = await services.payment.createIntent(
      payerUserId,
      payerWalletId,
      "learner",
    );
    await services.payment.confirmFromWebhook({
      provider: "stub",
      providerReference: intent.providerReference,
      providerEventId: `evt_b2_paid_${ts}`,
      status: "PAID",
    });

    // Admin refund wins the race: payment → REFUNDED, wallet credited (+50).
    await adminClient.adminBooking.adminRefund({
      paymentId: intent.paymentId,
      reason: "B2 race",
    });

    const [before] = await db
      .select()
      .from(wallet)
      .where(eq(wallet.id, payerWalletId));
    expect(before!.totalBalance).toBe(340);

    // Replay the webhook as it would run after reading the row while it was
    // still PAID (stale snapshot): the repo read returns PAID, but the real
    // row is already REFUNDED when the status update executes.
    const { createPaymentService } =
      await import("../../modules/payment/payment.service");
    const { createPaymentRepo } =
      await import("../../modules/payment/payment.repo");
    const { createStubPaymentProvider } =
      await import("../../modules/payment/stub-payment.provider");
    const realRepo = createPaymentRepo(db);
    const staleRepo = {
      ...realRepo,
      findPaymentByProviderReference: async (
        providerReference: string,
        conn?: DbOrTx,
      ) => {
        const row = await realRepo.findPaymentByProviderReference(
          providerReference,
          conn,
        );
        if (!row) return null;
        return { ...row, status: "PAID" };
      },
    };
    const staleService = createPaymentService({
      db,
      wallet: services.wallet,
      repo: staleRepo,
      provider: createStubPaymentProvider("test-secret"),
      providerName: "stub",
      notification: services.notification,
    });

    const result = await staleService.confirmFromWebhook({
      provider: "stub",
      providerReference: intent.providerReference,
      providerEventId: `evt_b2_refunded_${ts}`,
      status: "REFUNDED",
    });
    expect(result.status).toBe("REFUNDED");

    // The reversal must NOT run: marks were already returned by the admin
    // refund, so a second compensate_deduct would double-apply the refund.
    const [after] = await db
      .select()
      .from(wallet)
      .where(eq(wallet.id, payerWalletId));
    expect(after!.totalBalance).toBe(340);
    expect(after!.availableBalance).toBe(340);

    const reversals = await db
      .select()
      .from(ledgerEntry)
      .where(
        and(
          eq(ledgerEntry.walletId, payerWalletId),
          eq(ledgerEntry.entryType, "compensate_deduct"),
        ),
      );
    expect(reversals.length).toBe(0);
  });
});
