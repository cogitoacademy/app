import { KNOWLEDGE_BANK_THRESHOLD } from "../../shared/constants";
import { ledgerEntry } from "@cogito-app/db/schema";
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

export type LedgerEntryRow = typeof ledgerEntry.$inferSelect;

export interface LedgerQueryOptions {
  cursor?: string;
  limit?: number;
  bookingId?: string;
  eventKey?: string;
  entryType?: string;
  dateFrom?: string;
  dateTo?: string;
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
  ): Promise<{ items: LedgerEntryRow[]; nextCursor: string | null }>;
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
}

export type WalletService = ReturnType<typeof createWalletService>;

/**
 * Creates the wallet service providing atomic balance operations with ledger tracking.
 *
 * @param repo - the wallet repository providing atomic balance mutations
 * @param db - the database connection used for standalone (non-transaction) operations
 * @returns a WalletPort with hold/release/deduct/credit/compensate and read operations
 */
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

  /**
   * Gets or creates the wallet for a user.
   *
   * @param userId - the user to look up (and create a wallet for if absent)
   * @returns the user's wallet snapshot with zeroed balances when newly created
   * @throws {WalletNotFoundError} if the wallet cannot be created or found after an upsert race
   */
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

  /**
   * Moves Marks from available to held balance atomically, with a ledger entry.
   *
   * @param conn - the database connection or active transaction
   * @param params - hold details (wallet, amount, eventKey, actor, reason)
   * @returns the updated wallet snapshot
   * @throws {WalletNotFoundError} if the wallet does not exist
   * @throws {InsufficientBalanceError} if the available balance is too low
   */
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

  /**
   * Moves Marks from held back to available balance atomically, with a ledger entry.
   *
   * @param conn - the database connection or active transaction
   * @param params - release details (wallet, amount, eventKey, actor, reason)
   * @returns the updated wallet snapshot
   * @throws {WalletNotFoundError} if the wallet does not exist
   * @throws {InsufficientBalanceError} if the held balance is too low
   */
  async function release(
    conn: DbOrTx,
    params: ReleaseParams,
  ): Promise<WalletSnapshot> {
    return runInTx(conn, async (tx) => {
      const w = await repo.getById(tx, params.walletId);
      if (!w) throw new WalletNotFoundError(params.walletId);
      const result: AtomicResult = await repo.atomicRelease(
        tx,
        params.walletId,
        params.amount,
      );
      if (!result.success) {
        throw new InsufficientBalanceError(w.heldBalance, params.amount);
      }
      const updated = result.wallet;
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

  /**
   * Consumes held Marks as payment, reducing total and held balance atomically.
   *
   * @param conn - the database connection or active transaction
   * @param params - deduct details (wallet, amount, eventKey, actor, reason)
   * @returns the updated wallet snapshot
   * @throws {WalletNotFoundError} if the wallet does not exist
   * @throws {InsufficientBalanceError} if the held balance is too low
   */
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

  /**
   * Credits Marks to the wallet (e.g. package purchase), atomically.
   *
   * @param conn - the database connection or active transaction
   * @param params - credit details (wallet, amount, eventKey, actor, reason)
   * @returns the updated wallet snapshot
   * @throws {WalletNotFoundError} if the wallet does not exist
   */
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

  /**
   * Applies an admin/refund compensation credit or deduct atomically.
   *
   * @param conn - the database connection or active transaction
   * @param params - compensate details including the compensation type
   * @returns the updated wallet snapshot
   * @throws {WalletNotFoundError} if the wallet does not exist
   * @throws {InsufficientBalanceError} if compensating a deduct and the available balance is too low
   */
  async function compensate(
    conn: DbOrTx,
    params: CompensateParams,
  ): Promise<WalletSnapshot> {
    return runInTx(conn, async (tx) => {
      const w = await repo.getById(tx, params.walletId);
      if (!w) throw new WalletNotFoundError(params.walletId);
      const result =
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
      const updated =
        "success" in result
          ? result.success
            ? result.wallet
            : (() => {
                throw new InsufficientBalanceError(
                  w.availableBalance,
                  params.amount,
                );
              })()
          : result;
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

  /**
   * Lists ledger entries for a wallet with pagination.
   *
   * @param walletId - the wallet to query
   * @param opts - pagination/filter options (cursor, limit, bookingId, eventKey)
   * @returns the ledger items and a nextCursor when more pages exist
   */
  async function listLedger(walletId: string, opts?: LedgerQueryOptions) {
    const limit = Math.min(opts?.limit ?? 20, 100);
    const rows = await repo.findLedgerEntries(db, walletId, {
      limit,
      cursor: opts?.cursor,
      bookingId: opts?.bookingId,
      eventKey: opts?.eventKey,
      entryType: opts?.entryType,
      dateFrom: opts?.dateFrom,
      dateTo: opts?.dateTo,
    });
    const items = rows.slice(0, limit) as LedgerEntryRow[];
    const nextCursor = rows.length > limit ? items[items.length - 1]!.id : null;
    return { items, nextCursor };
  }

  /**
   * Checks whether a user's available balance meets the Knowledge Bank threshold.
   *
   * @param userId - the user to check
   * @returns eligibility, the available balance, and the threshold
   */
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

  /**
   * Lists all active mark packages available for purchase.
   *
   * @returns the active mark packages
   */
  async function listActivePackages() {
    return repo.listActivePackages(db);
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
  };
}
