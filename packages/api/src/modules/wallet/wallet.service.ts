import { eq } from "drizzle-orm";
import { wallet, ledgerEntry } from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import type {
  WalletPort,
  WalletSnapshot,
  HoldParams,
  ReleaseParams,
  DeductParams,
  CreditParams,
  CompensateParams,
} from "../../shared/ports/wallet.port";

export type WalletService = ReturnType<typeof createWalletService>;

export function createWalletService(db: DbType): WalletPort {
  async function getById(
    conn: DbOrTx,
    walletId: string,
  ): Promise<WalletSnapshot | null> {
    const [w] = await conn
      .select()
      .from(wallet)
      .where(eq(wallet.id, walletId))
      .limit(1);
    return w ?? null;
  }

  async function getByUserId(
    conn: DbOrTx,
    userId: string,
  ): Promise<WalletSnapshot | null> {
    const [w] = await conn
      .select()
      .from(wallet)
      .where(eq(wallet.userId, userId))
      .limit(1);
    return w ?? null;
  }

  async function getOrCreate(userId: string): Promise<WalletSnapshot> {
    const existing = await db
      .select()
      .from(wallet)
      .where(eq(wallet.userId, userId))
      .limit(1);
    if (existing[0]) return existing[0];

    const [created] = await db
      .insert(wallet)
      .values({
        userId,
        totalBalance: 0,
        heldBalance: 0,
        availableBalance: 0,
      })
      .returning();
    return created!;
  }

  async function insertLedger(
    conn: DbOrTx,
    params: {
      walletId: string;
      entryType: string;
      actorType: string;
      amount: number;
      eventKey: string;
      sourceReference?: string;
      reason?: string;
      bookingId?: string;
      beforeBalance: number;
      afterBalance: number;
      balanceAfterTotal: number;
      balanceAfterHeld: number;
    },
  ): Promise<void> {
    await conn.insert(ledgerEntry).values({
      walletId: params.walletId,
      bookingId: params.bookingId ?? null,
      entryType: params.entryType,
      actorType: params.actorType,
      amount: params.amount,
      eventKey: params.eventKey,
      sourceReference: params.sourceReference ?? null,
      reason: params.reason,
      beforeBalance: params.beforeBalance,
      afterBalance: params.afterBalance,
      balanceAfterWalletTotal: params.balanceAfterTotal,
      balanceAfterWalletHeld: params.balanceAfterHeld,
    });
  }

  async function hold(
    conn: DbOrTx,
    params: HoldParams,
  ): Promise<WalletSnapshot> {
    const w = await getById(conn, params.walletId);
    if (!w) throw new Error("Wallet not found");
    if (w.availableBalance < params.amount) {
      throw new Error("Insufficient available balance");
    }

    const newHeld = w.heldBalance + params.amount;
    const newAvailable = w.availableBalance - params.amount;

    const [updated] = await conn
      .update(wallet)
      .set({ heldBalance: newHeld, availableBalance: newAvailable })
      .where(eq(wallet.id, params.walletId))
      .returning();

    await insertLedger(conn, {
      walletId: params.walletId,
      entryType: "hold",
      actorType: params.actorType,
      amount: params.amount,
      eventKey: params.eventKey,
      sourceReference: params.sourceReference,
      reason: params.reason,
      bookingId: params.bookingId,
      beforeBalance: w.totalBalance,
      afterBalance: w.totalBalance,
      balanceAfterTotal: newHeld + newAvailable,
      balanceAfterHeld: newHeld,
    });

    return updated!;
  }

  async function release(
    conn: DbOrTx,
    params: ReleaseParams,
  ): Promise<WalletSnapshot> {
    const w = await getById(conn, params.walletId);
    if (!w) throw new Error("Wallet not found");

    const newHeld = Math.max(0, w.heldBalance - params.amount);
    const newAvailable = w.availableBalance + params.amount;

    const [updated] = await conn
      .update(wallet)
      .set({ heldBalance: newHeld, availableBalance: newAvailable })
      .where(eq(wallet.id, params.walletId))
      .returning();

    await insertLedger(conn, {
      walletId: params.walletId,
      entryType: "release",
      actorType: params.actorType,
      amount: params.amount,
      eventKey: params.eventKey,
      sourceReference: params.sourceReference,
      reason: params.reason,
      bookingId: params.bookingId,
      beforeBalance: w.totalBalance,
      afterBalance: w.totalBalance,
      balanceAfterTotal: newHeld + newAvailable,
      balanceAfterHeld: newHeld,
    });

    return updated!;
  }

  async function deduct(
    conn: DbOrTx,
    params: DeductParams,
  ): Promise<WalletSnapshot> {
    const w = await getById(conn, params.walletId);
    if (!w) throw new Error("Wallet not found");

    const newHeld = Math.max(0, w.heldBalance - params.amount);
    const newTotal = w.totalBalance - params.amount;
    const newAvailable = newTotal - newHeld;

    const [updated] = await conn
      .update(wallet)
      .set({
        totalBalance: newTotal,
        heldBalance: newHeld,
        availableBalance: newAvailable,
      })
      .where(eq(wallet.id, params.walletId))
      .returning();

    await insertLedger(conn, {
      walletId: params.walletId,
      entryType: "deduct",
      actorType: params.actorType,
      amount: params.amount,
      eventKey: params.eventKey,
      sourceReference: params.sourceReference,
      reason: params.reason,
      bookingId: params.bookingId,
      beforeBalance: w.totalBalance,
      afterBalance: newTotal,
      balanceAfterTotal: newTotal,
      balanceAfterHeld: newHeld,
    });

    return updated!;
  }

  async function credit(
    conn: DbOrTx,
    params: CreditParams,
  ): Promise<WalletSnapshot> {
    const w = await getById(conn, params.walletId);
    if (!w) throw new Error("Wallet not found");

    const newTotal = w.totalBalance + params.amount;
    const newAvailable = w.availableBalance + params.amount;

    const [updated] = await conn
      .update(wallet)
      .set({ totalBalance: newTotal, availableBalance: newAvailable })
      .where(eq(wallet.id, params.walletId))
      .returning();

    await insertLedger(conn, {
      walletId: params.walletId,
      entryType: "credit",
      actorType: params.actorType,
      amount: params.amount,
      eventKey: params.eventKey,
      sourceReference: params.sourceReference,
      reason: params.reason,
      bookingId: params.bookingId,
      beforeBalance: w.totalBalance,
      afterBalance: newTotal,
      balanceAfterTotal: newTotal,
      balanceAfterHeld: w.heldBalance,
    });

    return updated!;
  }

  async function compensate(
    conn: DbOrTx,
    params: CompensateParams,
  ): Promise<WalletSnapshot> {
    const w = await getById(conn, params.walletId);
    if (!w) throw new Error("Wallet not found");

    let newTotal = w.totalBalance;
    const newHeld = w.heldBalance;
    let newAvailable = w.availableBalance;

    if (params.type === "compensate_credit") {
      newTotal += params.amount;
      newAvailable += params.amount;
    } else {
      newTotal -= params.amount;
      newAvailable -= params.amount;
    }

    const [updated] = await conn
      .update(wallet)
      .set({
        totalBalance: newTotal,
        heldBalance: newHeld,
        availableBalance: newAvailable,
      })
      .where(eq(wallet.id, params.walletId))
      .returning();

    await insertLedger(conn, {
      walletId: params.walletId,
      entryType: params.type,
      actorType: params.actorType,
      amount: params.amount,
      eventKey: params.eventKey,
      sourceReference: params.sourceReference,
      reason: params.reason,
      bookingId: params.bookingId,
      beforeBalance: w.totalBalance,
      afterBalance: newTotal,
      balanceAfterTotal: newTotal,
      balanceAfterHeld: newHeld,
    });

    return updated!;
  }

  async function listLedger(
    walletId: string,
    opts: {
      cursor?: string;
      limit?: number;
      bookingId?: string;
      eventKey?: string;
    } = {},
  ) {
    const limit = Math.min(opts.limit ?? 20, 100);
    const rows = await db
      .select()
      .from(ledgerEntry)
      .where(eq(ledgerEntry.walletId, walletId))
      .limit(limit + 1);

    const items = rows.slice(0, limit);
    const nextCursor =
      rows.length > limit ? rows[limit - 1]!.createdAt.toISOString() : null;
    return { items, nextCursor };
  }

  async function knowledgeBankEligible(userId: string) {
    const w = await getOrCreate(userId);
    return {
      eligible: w.totalBalance >= 35,
      balance: w.totalBalance,
      threshold: 35,
    };
  }

  return {
    hold,
    release,
    deduct,
    credit,
    compensate,
    getById,
    getByUserId,
    getOrCreate,
    listLedger,
    knowledgeBankEligible,
  };
}
