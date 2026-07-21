import { eq, desc, sql, and, gte } from "drizzle-orm";
import { wallet, ledgerEntry, markPackage } from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import type { WalletSnapshot } from "./wallet.service";
import { badRequest } from "../../lib/errors";

export type WalletRepo = ReturnType<typeof createWalletRepo>;

export async function getById(
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

export async function getByUserId(
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

export async function insert(
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

export async function updateBalances(
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

export async function atomicHold(
  conn: DbOrTx,
  walletId: string,
  amount: number,
): Promise<WalletSnapshot> {
  const rows = await conn
    .update(wallet)
    .set({
      heldBalance: sql`${wallet.heldBalance} + ${amount}`,
      availableBalance: sql`${wallet.availableBalance} - ${amount}`,
    })
    .where(and(eq(wallet.id, walletId), gte(wallet.availableBalance, amount)))
    .returning();
  if (!rows.length) throw badRequest("Insufficient available balance");
  return rows[0] as WalletSnapshot;
}

export async function atomicRelease(
  conn: DbOrTx,
  walletId: string,
  amount: number,
): Promise<WalletSnapshot> {
  const [updated] = await conn
    .update(wallet)
    .set({
      heldBalance: sql`GREATEST(${wallet.heldBalance} - ${amount}, 0)`,
      availableBalance: sql`${wallet.availableBalance} + ${amount}`,
    })
    .where(eq(wallet.id, walletId))
    .returning();
  return updated as WalletSnapshot;
}

export async function atomicDeduct(
  conn: DbOrTx,
  walletId: string,
  amount: number,
): Promise<WalletSnapshot> {
  const rows = await conn
    .update(wallet)
    .set({
      heldBalance: sql`GREATEST(${wallet.heldBalance} - ${amount}, 0)`,
      totalBalance: sql`${wallet.totalBalance} - ${amount}`,
    })
    .where(
      and(eq(wallet.id, walletId), sql`${wallet.heldBalance} >= ${amount}`),
    )
    .returning();
  if (!rows.length) throw badRequest("Insufficient held balance");
  return rows[0] as WalletSnapshot;
}

export async function atomicCredit(
  conn: DbOrTx,
  walletId: string,
  amount: number,
): Promise<WalletSnapshot> {
  const [updated] = await conn
    .update(wallet)
    .set({
      totalBalance: sql`${wallet.totalBalance} + ${amount}`,
      availableBalance: sql`${wallet.availableBalance} + ${amount}`,
    })
    .where(eq(wallet.id, walletId))
    .returning();
  return updated as WalletSnapshot;
}

export async function atomicCompensateCredit(
  conn: DbOrTx,
  walletId: string,
  amount: number,
): Promise<WalletSnapshot> {
  const [updated] = await conn
    .update(wallet)
    .set({
      totalBalance: sql`${wallet.totalBalance} + ${amount}`,
      availableBalance: sql`${wallet.availableBalance} + ${amount}`,
    })
    .where(eq(wallet.id, walletId))
    .returning();
  return updated as WalletSnapshot;
}

export async function atomicCompensateDeduct(
  conn: DbOrTx,
  walletId: string,
  amount: number,
): Promise<WalletSnapshot> {
  const [updated] = await conn
    .update(wallet)
    .set({
      totalBalance: sql`${wallet.totalBalance} - ${amount}`,
      availableBalance: sql`${wallet.availableBalance} - ${amount}`,
    })
    .where(eq(wallet.id, walletId))
    .returning();
  return updated as WalletSnapshot;
}

export async function insertLedger(
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
    bookingId?: string;
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
    bookingId: params.bookingId ?? null,
  });
}

export async function listLedger(
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

export async function listActivePackages(conn: DbOrTx) {
  return conn.select().from(markPackage).where(eq(markPackage.isActive, true));
}

export function createWalletRepo(db: DbType) {
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
      .onConflictDoNothing()
      .returning();

    if (!created) {
      const [existingAfter] = await db
        .select()
        .from(wallet)
        .where(eq(wallet.userId, userId))
        .limit(1);
      return existingAfter as WalletSnapshot;
    }

    return created as WalletSnapshot;
  }

  return {
    getById,
    getByUserId,
    getOrCreate,
    insert,
    updateBalances,
    atomicHold,
    atomicRelease,
    atomicDeduct,
    atomicCredit,
    atomicCompensateCredit,
    atomicCompensateDeduct,
    insertLedger,
    listLedger,
    listActivePackages,
  };
}
