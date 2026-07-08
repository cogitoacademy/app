import { eq, desc } from "drizzle-orm";
import { wallet, ledgerEntry } from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import type { WalletSnapshot } from "../../shared/ports/wallet.port";

export type WalletRepo = ReturnType<typeof createWalletRepo>;

export function createWalletRepo(db: DbType) {
  async function getById(
    conn: DbOrTx,
    walletId: string,
  ): Promise<WalletSnapshot | null> {
    const [w] = await conn
      .select()
      .from(wallet)
      .where(eq(wallet.id, walletId))
      .limit(1);
    return (w as WalletSnapshot | undefined) ?? null;
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
    return (w as WalletSnapshot | undefined) ?? null;
  }

  async function getOrCreate(userId: string): Promise<WalletSnapshot> {
    const existing = await db
      .select()
      .from(wallet)
      .where(eq(wallet.userId, userId))
      .limit(1);
    if (existing[0]) return existing[0] as WalletSnapshot;

    const [created] = await db
      .insert(wallet)
      .values({
        userId,
        totalBalance: 0,
        heldBalance: 0,
        availableBalance: 0,
      })
      .returning();
    return created as WalletSnapshot;
  }

  async function insert(
    conn: DbOrTx,
    params: {
      userId: string;
      totalBalance: number;
      heldBalance: number;
      availableBalance: number;
    },
  ): Promise<WalletSnapshot> {
    const [created] = await conn
      .insert(wallet)
      .values({
        userId: params.userId,
        totalBalance: params.totalBalance,
        heldBalance: params.heldBalance,
        availableBalance: params.availableBalance,
      })
      .returning();
    return created as WalletSnapshot;
  }

  async function updateBalances(
    conn: DbOrTx,
    walletId: string,
    balances: {
      totalBalance: number;
      heldBalance: number;
      availableBalance: number;
    },
  ): Promise<WalletSnapshot> {
    const [updated] = await conn
      .update(wallet)
      .set({
        totalBalance: balances.totalBalance,
        heldBalance: balances.heldBalance,
        availableBalance: balances.availableBalance,
      })
      .where(eq(wallet.id, walletId))
      .returning();
    return updated as WalletSnapshot;
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
      beforeBalance: number;
      afterBalance: number;
      balanceAfterTotal: number;
      balanceAfterHeld: number;
    },
  ): Promise<void> {
    await conn.insert(ledgerEntry).values({
      walletId: params.walletId,
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

  async function listLedger(
    conn: DbOrTx,
    walletId: string,
    opts?: {
      cursor?: string;
      limit?: number;
      bookingId?: string;
      eventKey?: string;
    },
  ) {
    const limit = Math.min(opts?.limit ?? 20, 100);
    const rows = await conn
      .select()
      .from(ledgerEntry)
      .where(eq(ledgerEntry.walletId, walletId))
      .orderBy(desc(ledgerEntry.createdAt))
      .limit(limit + 1);
    const items = rows.slice(0, limit);
    const nextCursor = rows.length > limit ? items[items.length - 1]!.id : null;
    return { items, nextCursor };
  }

  return {
    getById,
    getByUserId,
    getOrCreate,
    insert,
    updateBalances,
    insertLedger,
    listLedger,
  };
}
