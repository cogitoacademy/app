import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import { ledgerEntry, markPackage, paymentRecord } from "@cogito-app/db/schema";

import { services } from "../../services";
import { createTestUser } from "../helpers/factories";

async function seedPackages() {
  await db
    .insert(markPackage)
    .values([
      { code: "starter", name: "Starter Pack", marks: 50, priceIdr: 430000 },
      { code: "learner", name: "Learner Pack", marks: 120, priceIdr: 990000 },
      {
        code: "explorer",
        name: "Explorer Pack",
        marks: 200,
        priceIdr: 1570000,
      },
      { code: "pioneer", name: "Pioneer Pack", marks: 300, priceIdr: 2180000 },
    ])
    .onConflictDoNothing({ target: markPackage.code });
}

async function truncate(...tables: string[]) {
  await Promise.all(
    tables.map((t) => db.execute(`TRUNCATE TABLE "${t}" CASCADE`)),
  );
}

describe("PaymentService", () => {
  beforeEach(async () => {
    await truncate(
      "payment_record",
      "ledger_entry",
      "wallet",
      "mark_package",
      "refund_record",
      "user",
    );
    await seedPackages();
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
      status: "succeeded",
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
      status: "succeeded",
    });
    await services.payment.confirmFromWebhook({
      provider: "stub",
      providerReference: intent.providerReference,
      providerEventId: "evt_dup",
      status: "succeeded",
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
      status: "failed",
      failureReason: "declined",
    });

    const w = await services.wallet.getByUserId(db, user.id);
    expect(w!.totalBalance).toBe(0);

    const record = await db
      .select()
      .from(paymentRecord)
      .where(eq(paymentRecord.id, intent.paymentId))
      .limit(1);
    expect(record[0]!.status).toBe("failed");
    expect(record[0]!.failureReason).toBe("declined");
  });

  test("TC-35: no cashout/convert/withdraw methods exist", () => {
    const methods = Object.keys(services.payment);
    expect(methods).not.toContain("cashout");
    expect(methods).not.toContain("convertToRupiah");
    expect(methods).not.toContain("withdraw");
  });
});
