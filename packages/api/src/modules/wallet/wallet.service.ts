import { notFound, badRequest } from "../../lib/errors";
import { KNOWLEDGE_BANK_THRESHOLD } from "../../shared/constants";
import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import type { WalletRepo } from "./wallet.repo";

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
}

export type WalletService = ReturnType<typeof createWalletService>;

export function createWalletService(repo: WalletRepo, db: DbType): WalletPort {
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
    return repo.getOrCreate(userId);
  }

  async function hold(
    conn: DbOrTx,
    params: HoldParams,
  ): Promise<WalletSnapshot> {
    const w = await repo.getById(conn, params.walletId);
    if (!w) throw notFound("Wallet not found");
    if (w.availableBalance < params.amount) {
      throw badRequest("Insufficient available balance");
    }
    const updated = await repo.atomicHold(conn, params.walletId, params.amount);
    await repo.insertLedger(conn, {
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
  }

  async function release(
    conn: DbOrTx,
    params: ReleaseParams,
  ): Promise<WalletSnapshot> {
    const w = await repo.getById(conn, params.walletId);
    if (!w) throw notFound("Wallet not found");
    const updated = await repo.atomicRelease(
      conn,
      params.walletId,
      params.amount,
    );
    await repo.insertLedger(conn, {
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
  }

  async function deduct(
    conn: DbOrTx,
    params: DeductParams,
  ): Promise<WalletSnapshot> {
    const w = await repo.getById(conn, params.walletId);
    if (!w) throw notFound("Wallet not found");
    const updated = await repo.atomicDeduct(
      conn,
      params.walletId,
      params.amount,
    );
    await repo.insertLedger(conn, {
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
  }

  async function credit(
    conn: DbOrTx,
    params: CreditParams,
  ): Promise<WalletSnapshot> {
    const w = await repo.getById(conn, params.walletId);
    if (!w) throw notFound("Wallet not found");
    const updated = await repo.atomicCredit(
      conn,
      params.walletId,
      params.amount,
    );
    await repo.insertLedger(conn, {
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
  }

  async function compensate(
    conn: DbOrTx,
    params: CompensateParams,
  ): Promise<WalletSnapshot> {
    const w = await repo.getById(conn, params.walletId);
    if (!w) throw notFound("Wallet not found");
    const updated =
      params.type === "compensate_credit"
        ? await repo.atomicCompensateCredit(
            conn,
            params.walletId,
            params.amount,
          )
        : await repo.atomicCompensateDeduct(
            conn,
            params.walletId,
            params.amount,
          );
    await repo.insertLedger(conn, {
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
  }

  async function listLedger(walletId: string, opts?: LedgerQueryOptions) {
    return repo.listLedger(db, walletId, opts);
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
