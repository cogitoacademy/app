import { describe, expect, test, beforeAll } from "bun:test";
import { eq, and } from "drizzle-orm";
import { db } from "@cogito-app/db";
import { wallet, ledgerEntry } from "@cogito-app/db/schema";

import { resetDatabase } from "../helpers/test-client";
import { createTestUser } from "../helpers/factories";
import { createWalletRepo } from "../../modules/wallet/wallet.repo";
import { createWalletService } from "../../modules/wallet/wallet.service";
import { InsufficientBalanceError } from "../../modules/wallet/wallet.errors";

const repo = createWalletRepo();
const service = createWalletService(repo, db);

async function seedWallet(balance: number) {
  const u = await createTestUser(
    `repo.wallet.${crypto.randomUUID()}@cogito.test`,
  );
  const w = await service.getOrCreate(u.id);
  if (balance > 0) {
    await service.credit(db, {
      walletId: w.id,
      amount: balance,
      eventKey: `seed.credit.${crypto.randomUUID()}`,
      sourceReference: `seed-${crypto.randomUUID()}`,
      actorType: "system",
    });
  }
  return w;
}

describe("wallet repo (real DB)", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  test("getOrCreate inserts a zeroed wallet for a new user", async () => {
    const u = await createTestUser(
      `repo.wallet.zero.${crypto.randomUUID()}@cogito.test`,
    );
    const w = await service.getOrCreate(u.id);
    expect(w.totalBalance).toBe(0);
    expect(w.heldBalance).toBe(0);
    expect(w.availableBalance).toBe(0);
  });

  test("getOrCreate returns the existing wallet without inserting a duplicate", async () => {
    const u = await createTestUser(
      `repo.wallet.existing.${crypto.randomUUID()}@cogito.test`,
    );
    const first = await service.getOrCreate(u.id);
    const second = await service.getOrCreate(u.id);
    expect(second.id).toBe(first.id);
    const rows = await db
      .select()
      .from(wallet)
      .where(eq(wallet.userId, u.id))
      .limit(5);
    expect(rows.length).toBe(1);
    expect(rows[0]!.id).toBe(first.id);
  });

  test("atomicHold moves available to held and writes a hold ledger entry", async () => {
    const w = await seedWallet(100);
    const updated = await service.hold(db, {
      walletId: w.id,
      amount: 30,
      eventKey: `hold.${crypto.randomUUID()}`,
      sourceReference: `hold-${crypto.randomUUID()}`,
      actorType: "system",
    });
    expect(updated.totalBalance).toBe(100);
    expect(updated.heldBalance).toBe(30);
    expect(updated.availableBalance).toBe(70);
    expect(updated.totalBalance).toBe(
      updated.heldBalance + updated.availableBalance,
    );

    const entries = await db
      .select()
      .from(ledgerEntry)
      .where(
        and(eq(ledgerEntry.walletId, w.id), eq(ledgerEntry.entryType, "hold")),
      );
    expect(entries.length).toBe(1);
    expect(entries[0]!.amount).toBe(30);
  });

  test("atomicRelease moves held back to available and writes a release ledger entry", async () => {
    const w = await seedWallet(100);
    await service.hold(db, {
      walletId: w.id,
      amount: 40,
      eventKey: `hold.${crypto.randomUUID()}`,
      sourceReference: `hold-${crypto.randomUUID()}`,
      actorType: "system",
    });
    const updated = await service.release(db, {
      walletId: w.id,
      amount: 25,
      eventKey: `release.${crypto.randomUUID()}`,
      sourceReference: `release-${crypto.randomUUID()}`,
      actorType: "system",
    });
    expect(updated.totalBalance).toBe(100);
    expect(updated.heldBalance).toBe(15);
    expect(updated.availableBalance).toBe(85);
    expect(updated.totalBalance).toBe(
      updated.heldBalance + updated.availableBalance,
    );

    const entries = await db
      .select()
      .from(ledgerEntry)
      .where(
        and(
          eq(ledgerEntry.walletId, w.id),
          eq(ledgerEntry.entryType, "release"),
        ),
      );
    expect(entries.length).toBe(1);
    expect(entries[0]!.amount).toBe(25);
  });

  test("atomicDeduct reduces total and held and writes a deduct ledger entry", async () => {
    const w = await seedWallet(100);
    await service.hold(db, {
      walletId: w.id,
      amount: 40,
      eventKey: `hold.${crypto.randomUUID()}`,
      sourceReference: `hold-${crypto.randomUUID()}`,
      actorType: "system",
    });
    const updated = await service.deduct(db, {
      walletId: w.id,
      amount: 30,
      eventKey: `deduct.${crypto.randomUUID()}`,
      sourceReference: `deduct-${crypto.randomUUID()}`,
      actorType: "system",
    });
    expect(updated.totalBalance).toBe(70);
    expect(updated.heldBalance).toBe(10);
    expect(updated.availableBalance).toBe(60);
    expect(updated.totalBalance).toBe(
      updated.heldBalance + updated.availableBalance,
    );

    const entries = await db
      .select()
      .from(ledgerEntry)
      .where(
        and(
          eq(ledgerEntry.walletId, w.id),
          eq(ledgerEntry.entryType, "deduct"),
        ),
      );
    expect(entries.length).toBe(1);
    expect(entries[0]!.amount).toBe(30);
  });

  test("atomicHold rejects hold larger than available and leaves balance unchanged", async () => {
    const w = await seedWallet(10);
    const res = await repo.atomicHold(db, w.id, 100);
    expect(res).toEqual({ success: false, reason: "insufficient_balance" });
    const [row] = await db
      .select()
      .from(wallet)
      .where(eq(wallet.id, w.id))
      .limit(1);
    expect(row!.availableBalance).toBe(10);
    expect(row!.heldBalance).toBe(0);
  });

  test("service.hold throws InsufficientBalanceError when available is exceeded", async () => {
    const w = await seedWallet(50);
    await expect(
      service.hold(db, {
        walletId: w.id,
        amount: 100,
        eventKey: `hold.${crypto.randomUUID()}`,
        sourceReference: `hold-${crypto.randomUUID()}`,
        actorType: "system",
      }),
    ).rejects.toThrow(InsufficientBalanceError);
  });

  test("deducting more than held is rejected", async () => {
    const w = await seedWallet(100);
    await expect(
      service.deduct(db, {
        walletId: w.id,
        amount: 50,
        eventKey: `deduct.${crypto.randomUUID()}`,
        sourceReference: `deduct-${crypto.randomUUID()}`,
        actorType: "system",
      }),
    ).rejects.toThrow(InsufficientBalanceError);
  });

  test("duplicate eventKey+sourceReference ledger insert raises a unique violation", async () => {
    const w = await seedWallet(0);
    const params = {
      walletId: w.id,
      entryType: "credit",
      actorType: "system",
      amount: 10,
      eventKey: `dup.${crypto.randomUUID()}`,
      sourceReference: "dup-src-1",
      beforeBalance: 0,
      afterBalance: 10,
      balanceAfterTotal: 10,
      balanceAfterHeld: 0,
    } as const;
    await repo.insertLedger(db, { ...params });
    let error: unknown = null;
    try {
      await repo.insertLedger(db, { ...params });
    } catch (err) {
      error = err;
    }
    expect(error).not.toBeNull();
  });
});
