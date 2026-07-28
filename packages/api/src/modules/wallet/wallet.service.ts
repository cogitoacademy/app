import { eq, and, inArray, sum } from "drizzle-orm";
import { wallet, ledgerEntry } from "@cogito-app/db/schema";
import { KNOWLEDGE_BANK_THRESHOLD } from "../../shared/constants";
import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import type { WalletRepo, AtomicResult } from "./wallet.repo";
import { WalletNotFoundError, InsufficientBalanceError } from "./wallet.errors";

export type EntryType =
  | "credit"
  | "hold"
  | "release"
  | "deduct"
  | "compensate_credit"
  | "compensate_deduct";
export type ActorType = "admin" | "tutor" | "student" | "system";

export interface HoldParams {
  walletId: string;
  amount: number;
  eventKey: string;
  sourceReference?: string;
  actorType: ActorType;
  reason?: string;
  bookingId?: string;
}

export interface ReleaseParams {
  walletId: string;
  amount: number;
  eventKey: string;
  sourceReference?: string;
  actorType: ActorType;
  reason?: string;
  bookingId?: string;
}

export interface DeductParams {
  walletId: string;
  amount: number;
  eventKey: string;
  sourceReference?: string;
  actorType: ActorType;
  reason?: string;
  bookingId?: string;
}

export interface CreditParams {
  walletId: string;
  amount: number;
  eventKey: string;
  sourceReference?: string;
  actorType: ActorType;
  reason?: string;
  bookingId?: string;
}

export interface CompensateParams {
  walletId: string;
  amount: number;
  eventKey: string;
  sourceReference?: string;
  actorType: ActorType;
  reason?: string;
  type: "compensate_credit" | "compensate_deduct";
  bookingId?: string;
}

export interface WalletSnapshot {
  id: string;
  totalBalance: number;
  heldBalance: number;
  availableBalance: number;
}

export interface LedgerQueryOptions {
  cursor?: string;
  limit?: number;
  bookingId?: string;
  eventKey?: string;
}

export interface WalletPort {
  hold(db: DbOrTx, params: HoldParams): Promise<WalletSnapshot>;
  release(db: DbOrTx, params: ReleaseParams): Promise<WalletSnapshot>;
  deduct(db: DbOrTx, params: DeductParams): Promise<WalletSnapshot>;
  credit(db: DbOrTx, params: CreditParams): Promise<WalletSnapshot>;
  compensate(db: DbOrTx, params: CompensateParams): Promise<WalletSnapshot>;
  getById(db: DbOrTx, walletId: string): Promise<WalletSnapshot | null>;
  getByUserId(db: DbOrTx, userId: string): Promise<WalletSnapshot | null>;
  getOrCreate(userId: string): Promise<WalletSnapshot>;
  listLedger(
    walletId: string,
    opts?: LedgerQueryOptions,
  ): Promise<{ items: unknown[]; nextCursor: string | null }>;
  knowledgeBankEligible(userId: string): Promise<{
    eligible: boolean;
    balance: number;
    threshold: number;
  }>;
  listActivePackages(): Promise<
    {
      id: string;
      code: string;
      name: string;
      marks: number;
      priceIdr: number;
      isActive: boolean;
      createdAt: Date;
      updatedAt: Date;
    }[]
  >;
  reconcile(query?: {
    walletId?: string;
  }): Promise<{ expected: number; actual: number; drift: number }>;
}

export type WalletService = ReturnType<typeof createWalletService>;

/** Wallet service providing atomic balance operations with ledger tracking. */
export function createWalletService(repo: WalletRepo, db: DbType): WalletPort {
  async function runInTx<T>(conn: DbOrTx, fn: (tx: DbOrTx) => Promise<T>) {
    if (conn === db) return db.transaction(fn);
    return fn(conn);
  }

  async function getById(
    conn: DbOrTx,
    walletId: string,
  ): Promise<WalletSnapshot | null> {
    return repo.getById(conn, walletId);
  }

  async function getByUserId(
    conn: DbOrTx,
    userId: string,
  ): Promise<WalletSnapshot | null> {
    return repo.getByUserId(conn, userId);
  }

  async function getOrCreate(userId: string): Promise<WalletSnapshot> {
    const existing = await repo.getByUserId(db, userId);
    if (existing) return existing;
    const created = await repo.upsert(db, {
      userId,
      totalBalance: 0,
      heldBalance: 0,
      availableBalance: 0,
    });
    if (created) return created;
    const afterConflict = await repo.getByUserId(db, userId);
    if (!afterConflict) throw new WalletNotFoundError(userId);
    return afterConflict;
  }

  async function hold(
    conn: DbOrTx,
    params: HoldParams,
  ): Promise<WalletSnapshot> {
    return runInTx(conn, async (tx) => {
      const w = await repo.getById(tx, params.walletId);
      if (!w) throw new WalletNotFoundError(params.walletId);
      const result: AtomicResult = await repo.atomicHold(
        tx,
        params.walletId,
        params.amount,
      );
      if (!result.success)
        throw new InsufficientBalanceError(w.availableBalance, params.amount);
      const updated = result.wallet;
      await repo.insertLedger(tx, {
        walletId: params.walletId,
        entryType: "hold",
        actorType: params.actorType,
        amount: params.amount,
        eventKey: params.eventKey,
        sourceReference: params.sourceReference,
        reason: params.reason,
        beforeBalance: w.totalBalance,
        afterBalance: updated.totalBalance,
        balanceAfterTotal: updated.totalBalance,
        balanceAfterHeld: updated.heldBalance,
        bookingId: params.bookingId,
      });
      return updated;
    });
  }

  async function release(
    conn: DbOrTx,
    params: ReleaseParams,
  ): Promise<WalletSnapshot> {
    return runInTx(conn, async (tx) => {
      const w = await repo.getById(tx, params.walletId);
      if (!w) throw new WalletNotFoundError(params.walletId);
      const updated = await repo.atomicRelease(
        tx,
        params.walletId,
        params.amount,
      );
      await repo.insertLedger(tx, {
        walletId: params.walletId,
        entryType: "release",
        actorType: params.actorType,
        amount: params.amount,
        eventKey: params.eventKey,
        sourceReference: params.sourceReference,
        reason: params.reason,
        beforeBalance: w.totalBalance,
        afterBalance: updated.totalBalance,
        balanceAfterTotal: updated.totalBalance,
        balanceAfterHeld: updated.heldBalance,
        bookingId: params.bookingId,
      });
      return updated;
    });
  }

  async function deduct(
    conn: DbOrTx,
    params: DeductParams,
  ): Promise<WalletSnapshot> {
    return runInTx(conn, async (tx) => {
      const w = await repo.getById(tx, params.walletId);
      if (!w) throw new WalletNotFoundError(params.walletId);
      const result: AtomicResult = await repo.atomicDeduct(
        tx,
        params.walletId,
        params.amount,
      );
      if (!result.success)
        throw new InsufficientBalanceError(w.availableBalance, params.amount);
      const updated = result.wallet;
      await repo.insertLedger(tx, {
        walletId: params.walletId,
        entryType: "deduct",
        actorType: params.actorType,
        amount: params.amount,
        eventKey: params.eventKey,
        sourceReference: params.sourceReference,
        reason: params.reason,
        beforeBalance: w.totalBalance,
        afterBalance: updated.totalBalance,
        balanceAfterTotal: updated.totalBalance,
        balanceAfterHeld: updated.heldBalance,
        bookingId: params.bookingId,
      });
      return updated;
    });
  }

  async function credit(
    conn: DbOrTx,
    params: CreditParams,
  ): Promise<WalletSnapshot> {
    return runInTx(conn, async (tx) => {
      const w = await repo.getById(tx, params.walletId);
      if (!w) throw new WalletNotFoundError(params.walletId);
      const updated = await repo.atomicCredit(
        tx,
        params.walletId,
        params.amount,
      );
      await repo.insertLedger(tx, {
        walletId: params.walletId,
        entryType: "credit",
        actorType: params.actorType,
        amount: params.amount,
        eventKey: params.eventKey,
        sourceReference: params.sourceReference,
        reason: params.reason,
        beforeBalance: w.totalBalance,
        afterBalance: updated.totalBalance,
        balanceAfterTotal: updated.totalBalance,
        balanceAfterHeld: updated.heldBalance,
        bookingId: params.bookingId,
      });
      return updated;
    });
  }

  async function compensate(
    conn: DbOrTx,
    params: CompensateParams,
  ): Promise<WalletSnapshot> {
    return runInTx(conn, async (tx) => {
      const w = await repo.getById(tx, params.walletId);
      if (!w) throw new WalletNotFoundError(params.walletId);
      const updated =
        params.type === "compensate_credit"
          ? await repo.atomicCompensateCredit(
              tx,
              params.walletId,
              params.amount,
            )
          : await repo.atomicCompensateDeduct(
              tx,
              params.walletId,
              params.amount,
            );
      await repo.insertLedger(tx, {
        walletId: params.walletId,
        entryType: params.type,
        actorType: params.actorType,
        amount: params.amount,
        eventKey: params.eventKey,
        sourceReference: params.sourceReference,
        reason: params.reason,
        beforeBalance: w.totalBalance,
        afterBalance: updated.totalBalance,
        balanceAfterTotal: updated.totalBalance,
        balanceAfterHeld: updated.heldBalance,
        bookingId: params.bookingId,
      });
      return updated;
    });
  }

  async function listLedger(walletId: string, opts?: LedgerQueryOptions) {
    const limit = Math.min(opts?.limit ?? 20, 100);
    const rows = await repo.findLedgerEntries(db, walletId, {
      limit,
      cursor: opts?.cursor,
      bookingId: opts?.bookingId,
      eventKey: opts?.eventKey,
    });
    const items = rows.slice(0, limit);
    const nextCursor = rows.length > limit ? items[items.length - 1]!.id : null;
    return { items, nextCursor };
  }

  async function knowledgeBankEligible(userId: string) {
    const w = await repo.getByUserId(db, userId);
    if (!w) {
      return {
        eligible: false,
        balance: 0,
        threshold: KNOWLEDGE_BANK_THRESHOLD,
      };
    }
    return {
      eligible: w.availableBalance >= KNOWLEDGE_BANK_THRESHOLD,
      balance: w.availableBalance,
      threshold: KNOWLEDGE_BANK_THRESHOLD,
    };
  }

  async function listActivePackages() {
    return repo.listActivePackages(db);
  }

  async function reconcile(query?: { walletId?: string }) {
    const ADD_TYPES = ["credit", "compensate_credit"];
    const SUB_TYPES = ["deduct", "compensate_deduct"];

    const walletCondition = query?.walletId
      ? eq(ledgerEntry.walletId, query.walletId)
      : undefined;

    const [addRow] = await db
      .select({ total: sum(ledgerEntry.amount) })
      .from(ledgerEntry)
      .where(and(walletCondition, inArray(ledgerEntry.entryType, ADD_TYPES)));
    const [subRow] = await db
      .select({ total: sum(ledgerEntry.amount) })
      .from(ledgerEntry)
      .where(and(walletCondition, inArray(ledgerEntry.entryType, SUB_TYPES)));

    const expected = Number(addRow?.total ?? 0) - Number(subRow?.total ?? 0);

    const walletRows = query?.walletId
      ? await db.select().from(wallet).where(eq(wallet.id, query.walletId))
      : await db.select().from(wallet);
    const actual = walletRows.reduce(
      (acc, w) => acc + (w.totalBalance ?? 0),
      0,
    );

    return { expected, actual, drift: actual - expected };
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
    listActivePackages,
    reconcile,
  };
}
