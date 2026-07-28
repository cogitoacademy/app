import { eq, desc, sql, and, gte } from "drizzle-orm";
import { wallet, ledgerEntry, markPackage } from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import type { WalletSnapshot } from "./wallet.service";

export type AtomicResult =
  | { success: true; wallet: WalletSnapshot }
  | { success: false; reason: "insufficient_balance" | "insufficient_held" };

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
): Promise<AtomicResult> {
  const rows = await conn
    .update(wallet)
    .set({
      heldBalance: sql`${wallet.heldBalance} + ${amount}`,
      availableBalance: sql`${wallet.availableBalance} - ${amount}`,
    })
    .where(and(eq(wallet.id, walletId), gte(wallet.availableBalance, amount)))
    .returning();
  if (!rows.length) return { success: false, reason: "insufficient_balance" };
  return { success: true, wallet: rows[0] as WalletSnapshot };
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
): Promise<AtomicResult> {
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
  if (!rows.length) return { success: false, reason: "insufficient_held" };
  return { success: true, wallet: rows[0] as WalletSnapshot };
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

export async function findLedgerEntries(
  conn: DbOrTx,
  walletId: string,
  opts: {
    limit: number;
    cursor?: string;
    bookingId?: string;
    eventKey?: string;
  },
) {
  const conditions = [eq(ledgerEntry.walletId, walletId)];
  if (opts.bookingId) {
    conditions.push(eq(ledgerEntry.bookingId, opts.bookingId));
  }
  if (opts.eventKey) {
    conditions.push(eq(ledgerEntry.eventKey, opts.eventKey));
  }
  return conn
    .select()
    .from(ledgerEntry)
    .where(and(...conditions))
    .orderBy(desc(ledgerEntry.createdAt))
    .limit(opts.limit + 1);
}

export async function listActivePackages(conn: DbOrTx) {
  return conn.select().from(markPackage).where(eq(markPackage.isActive, true));
}

export async function upsert(
  db: DbType,
  values: {
    userId: string;
    totalBalance: number;
    heldBalance: number;
    availableBalance: number;
  },
): Promise<WalletSnapshot | null> {
  const [created] = await db
    .insert(wallet)
    .values(values)
    .onConflictDoNothing()
    .returning();
  return created ? (created as WalletSnapshot) : null;
}

export function createWalletRepo() {
  return {
    getById,
    getByUserId,
    upsert,
    insert,
    updateBalances,
    atomicHold,
    atomicRelease,
    atomicDeduct,
    atomicCredit,
    atomicCompensateCredit,
    atomicCompensateDeduct,
    insertLedger,
    findLedgerEntries,
    listActivePackages,
  };
}
