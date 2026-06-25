import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import { wallet, ledgerEntry } from "@cogito-app/db/schema";

import {
  createTestUser,
  createTestWallet,
  insertLedgerEntry,
  getWalletByUserId,
  cleanTestUser,
} from "../helpers/factories";

describe("Wallet ledger invariants", () => {
  const email = `ledger.${Date.now()}@cogito.test`;
  let userId: string;
  let walletId: string;

  beforeAll(async () => {
    const u = await createTestUser(email);
    userId = u.id;
    const w = await createTestWallet(userId, 100);
    walletId = w.id;
  });

  afterAll(async () => {
    await cleanTestUser(email);
  });

  test("wallet CHECK(total=held+available) holds for initial state", async () => {
    const w = await getWalletByUserId(userId);
    expect(w).not.toBeNull();
    expect(w!.totalBalance).toBe(100);
    expect(w!.heldBalance).toBe(0);
    expect(w!.availableBalance).toBe(100);
    expect(w!.totalBalance).toBe(w!.heldBalance + w!.availableBalance);
  });

  test("credit entry increases total and available", async () => {
    await insertLedgerEntry({
      walletId,
      entryType: "credit",
      actorType: "system",
      amount: 50,
      eventKey: `test.credit.${Date.now()}`,
      sourceReference: "test-credit-1",
      beforeBalance: 100,
      afterBalance: 150,
    });

    await db
      .update(wallet)
      .set({ totalBalance: 150, availableBalance: 150 })
      .where(eq(wallet.id, walletId));

    const w = await getWalletByUserId(userId);
    expect(w!.totalBalance).toBe(150);
    expect(w!.availableBalance).toBe(150);
    expect(w!.totalBalance).toBe(w!.heldBalance + w!.availableBalance);
  });

  test("hold entry moves marks from available to held", async () => {
    await insertLedgerEntry({
      walletId,
      entryType: "hold",
      actorType: "system",
      amount: 30,
      eventKey: `test.hold.${Date.now()}`,
      sourceReference: "test-hold-1",
      beforeBalance: 150,
      afterBalance: 150,
    });

    await db
      .update(wallet)
      .set({ heldBalance: 30, availableBalance: 120 })
      .where(eq(wallet.id, walletId));

    const w = await getWalletByUserId(userId);
    expect(w!.heldBalance).toBe(30);
    expect(w!.availableBalance).toBe(120);
    expect(w!.totalBalance).toBe(w!.heldBalance + w!.availableBalance);
  });

  test("duplicate ledger entry with same eventKey+sourceReference is rejected", async () => {
    const eventKey = `test.dup.${Date.now()}`;
    const sourceRef = "test-dup-1";

    await insertLedgerEntry({
      walletId,
      entryType: "credit",
      actorType: "system",
      amount: 10,
      eventKey,
      sourceReference: sourceRef,
      beforeBalance: 150,
      afterBalance: 160,
    });

    let duplicateError: unknown = null;
    try {
      await insertLedgerEntry({
        walletId,
        entryType: "credit",
        actorType: "system",
        amount: 10,
        eventKey,
        sourceReference: sourceRef,
        beforeBalance: 150,
        afterBalance: 160,
      });
    } catch (err) {
      duplicateError = err;
    }

    expect(duplicateError).not.toBeNull();
  });

  test("invalid entry type is rejected by CHECK constraint", async () => {
    let error: unknown = null;
    try {
      await db.insert(ledgerEntry).values({
        walletId,
        entryType: "invalid_type",
        actorType: "system",
        amount: 5,
        eventKey: `test.invalid.${Date.now()}`,
        beforeBalance: 150,
        afterBalance: 155,
      });
    } catch (err) {
      error = err;
    }
    expect(error).not.toBeNull();
  });

  test("negative amount is rejected by CHECK constraint", async () => {
    let error: unknown = null;
    try {
      await db.insert(ledgerEntry).values({
        walletId,
        entryType: "credit",
        actorType: "system",
        amount: -10,
        eventKey: `test.neg.${Date.now()}`,
        beforeBalance: 150,
        afterBalance: 140,
      });
    } catch (err) {
      error = err;
    }
    expect(error).not.toBeNull();
  });

  test("wallet balance invariant violation is rejected", async () => {
    let error: unknown = null;
    try {
      await db
        .update(wallet)
        .set({ totalBalance: 200, heldBalance: 30, availableBalance: 120 })
        .where(eq(wallet.id, walletId));
    } catch (err) {
      error = err;
    }
    expect(error).not.toBeNull();
  });
});
