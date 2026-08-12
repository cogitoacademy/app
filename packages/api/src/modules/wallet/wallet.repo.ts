import { eq, desc, sql, and, gte, lte } from "drizzle-orm";
import { wallet, ledgerEntry, markPackage } from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import type { WalletSnapshot } from "./wallet.service";

export const WALLET_COLUMNS = {
  id: wallet.id,
  userId: wallet.userId,
  totalBalance: wallet.totalBalance,
  heldBalance: wallet.heldBalance,
  availableBalance: wallet.availableBalance,
  createdAt: wallet.createdAt,
  updatedAt: wallet.updatedAt,
};

export type AtomicResult =
  | { success: true; wallet: WalletSnapshot }
  | { success: false; reason: "insufficient_balance" | "insufficient_held" };

export type WalletRepo = ReturnType<typeof createWalletRepo>;

/**
 * Fetches a wallet by id.
 *
 * @param conn - the database connection or active transaction
 * @param walletId - the wallet id
 * @returns the wallet snapshot, or null
 */
export async function getById(
  conn: DbOrTx,
  walletId: string,
): Promise<WalletSnapshot | null> {
  const [w] = await conn
    .select(WALLET_COLUMNS)
    .from(wallet)
    .where(eq(wallet.id, walletId))
    .limit(1);
  return (w as WalletSnapshot | undefined) ?? null;
}

/**
 * Fetches a wallet by user id.
 *
 * @param conn - the database connection or active transaction
 * @param userId - the user id
 * @returns the wallet snapshot, or null
 */
export async function getByUserId(
  conn: DbOrTx,
  userId: string,
): Promise<WalletSnapshot | null> {
  const [w] = await conn
    .select(WALLET_COLUMNS)
    .from(wallet)
    .where(eq(wallet.userId, userId))
    .limit(1);
  return (w as WalletSnapshot | undefined) ?? null;
}

/**
 * Inserts a new wallet row.
 *
 * @param conn - the database connection or active transaction
 * @param params - the initial balance values
 * @returns the created wallet snapshot
 */
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

/**
 * Directly sets a wallet's balances.
 *
 * @param conn - the database connection or active transaction
 * @param walletId - the wallet id
 * @param balances - the new balance values
 * @returns the updated wallet snapshot
 */
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

/**
 * Atomically moves Marks from available to held, guarded by sufficient available balance.
 *
 * @param conn - the database connection or active transaction
 * @param walletId - the wallet id
 * @param amount - the amount to hold
 * @returns success with the updated wallet, or failure with a reason
 */
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

/**
 * Atomically moves Marks from held back to available, guarded by sufficient held balance.
 *
 * @param conn - the database connection or active transaction
 * @param walletId - the wallet id
 * @param amount - the amount to release
 * @returns success with the updated wallet, or failure with a reason
 */
export async function atomicRelease(
  conn: DbOrTx,
  walletId: string,
  amount: number,
): Promise<AtomicResult> {
  const rows = await conn
    .update(wallet)
    .set({
      heldBalance: sql`GREATEST(${wallet.heldBalance} - ${amount}, 0)`,
      availableBalance: sql`${wallet.availableBalance} + ${amount}`,
    })
    .where(and(eq(wallet.id, walletId), gte(wallet.heldBalance, amount)))
    .returning();
  if (!rows.length) return { success: false, reason: "insufficient_held" };
  return { success: true, wallet: rows[0] as WalletSnapshot };
}

/**
 * Atomically consumes held Marks, reducing total and held balance.
 *
 * @param conn - the database connection or active transaction
 * @param walletId - the wallet id
 * @param amount - the amount to deduct
 * @returns success with the updated wallet, or failure with a reason
 */
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

/**
 * Atomically credits Marks to total and available balance.
 *
 * @param conn - the database connection or active transaction
 * @param walletId - the wallet id
 * @param amount - the amount to credit
 * @returns the updated wallet snapshot
 */
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

/**
 * Atomically credits total and available balance for a compensation credit.
 *
 * @param conn - the database connection or active transaction
 * @param walletId - the wallet id
 * @param amount - the amount to credit
 * @returns the updated wallet snapshot
 */
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

/**
 * Atomically reduces total and available balance for a compensation deduct.
 *
 * @param conn - the database connection or active transaction
 * @param walletId - the wallet id
 * @param amount - the amount to deduct
 * @returns success with the updated wallet, or failure with a reason
 */
export async function atomicCompensateDeduct(
  conn: DbOrTx,
  walletId: string,
  amount: number,
): Promise<AtomicResult> {
  const rows = await conn
    .update(wallet)
    .set({
      totalBalance: sql`${wallet.totalBalance} - ${amount}`,
      availableBalance: sql`${wallet.availableBalance} - ${amount}`,
    })
    .where(and(eq(wallet.id, walletId), gte(wallet.availableBalance, amount)))
    .returning();
  if (!rows.length) return { success: false, reason: "insufficient_balance" };
  return { success: true, wallet: rows[0] as WalletSnapshot };
}

/**
 * Inserts a ledger entry recording a wallet balance mutation.
 *
 * @param conn - the database connection or active transaction
 * @param params - the ledger entry fields
 */
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

/**
 * Lists ledger entries for a wallet with optional filters, newest first (fetches limit+1).
 *
 * @param conn - the database connection or active transaction
 * @param walletId - the wallet id
 * @param opts - list options (limit, cursor, bookingId, eventKey)
 * @returns the matching ledger rows
 */
export async function findLedgerEntries(
  conn: DbOrTx,
  walletId: string,
  opts: {
    limit: number;
    cursor?: string;
    bookingId?: string;
    eventKey?: string;
    entryType?: string;
    dateFrom?: string;
    dateTo?: string;
  },
) {
  const conditions = [eq(ledgerEntry.walletId, walletId)];
  if (opts.cursor) {
    conditions.push(
      sql`(${ledgerEntry.createdAt}, ${ledgerEntry.id}) < (
        SELECT created_at, id FROM ledger_entry WHERE id = ${opts.cursor}
      )`,
    );
  }
  if (opts.bookingId) {
    conditions.push(eq(ledgerEntry.bookingId, opts.bookingId));
  }
  if (opts.eventKey) {
    conditions.push(eq(ledgerEntry.eventKey, opts.eventKey));
  }
  if (opts.entryType) {
    conditions.push(eq(ledgerEntry.entryType, opts.entryType));
  }
  if (opts.dateFrom) {
    conditions.push(gte(ledgerEntry.createdAt, new Date(opts.dateFrom)));
  }
  if (opts.dateTo) {
    conditions.push(lte(ledgerEntry.createdAt, new Date(opts.dateTo)));
  }
  return conn
    .select()
    .from(ledgerEntry)
    .where(and(...conditions))
    .orderBy(desc(ledgerEntry.createdAt), desc(ledgerEntry.id))
    .limit(opts.limit + 1);
}

/**
 * Lists all active mark packages.
 *
 * @param conn - the database connection or active transaction
 * @returns the active package rows
 */
export async function listActivePackages(conn: DbOrTx) {
  return conn.select().from(markPackage).where(eq(markPackage.isActive, true));
}

/**
 * Inserts a wallet only if one does not already exist for the user.
 *
 * @param db - the database connection
 * @param values - the initial balance values
 * @returns the created wallet, or null when the user already has a wallet
 */
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
