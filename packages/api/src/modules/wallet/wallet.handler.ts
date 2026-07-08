import { notFound, badRequest } from "../../lib/errors";
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
import type { WalletRepo } from "./wallet.repo";

export type WalletHandler = ReturnType<typeof createWalletHandler>;

export function createWalletHandler(repo: WalletRepo, db: DbType): WalletPort {
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

    const newHeld = w.heldBalance + params.amount;
    const newAvailable = w.availableBalance - params.amount;

    const updated = await repo.updateBalances(conn, params.walletId, {
      totalBalance: w.totalBalance,
      heldBalance: newHeld,
      availableBalance: newAvailable,
    });

    await repo.insertLedger(conn, {
      walletId: params.walletId,
      entryType: "hold",
      actorType: params.actorType,
      amount: params.amount,
      eventKey: params.eventKey,
      sourceReference: params.sourceReference,
      reason: params.reason,
      beforeBalance: w.totalBalance,
      afterBalance: w.totalBalance,
      balanceAfterTotal: newHeld + newAvailable,
      balanceAfterHeld: newHeld,
    });

    return updated;
  }

  async function release(
    conn: DbOrTx,
    params: ReleaseParams,
  ): Promise<WalletSnapshot> {
    const w = await repo.getById(conn, params.walletId);
    if (!w) throw notFound("Wallet not found");

    const newHeld = Math.max(0, w.heldBalance - params.amount);
    const newAvailable = w.availableBalance + params.amount;

    const updated = await repo.updateBalances(conn, params.walletId, {
      totalBalance: w.totalBalance,
      heldBalance: newHeld,
      availableBalance: newAvailable,
    });

    await repo.insertLedger(conn, {
      walletId: params.walletId,
      entryType: "release",
      actorType: params.actorType,
      amount: params.amount,
      eventKey: params.eventKey,
      sourceReference: params.sourceReference,
      reason: params.reason,
      beforeBalance: w.totalBalance,
      afterBalance: w.totalBalance,
      balanceAfterTotal: newHeld + newAvailable,
      balanceAfterHeld: newHeld,
    });

    return updated;
  }

  async function deduct(
    conn: DbOrTx,
    params: DeductParams,
  ): Promise<WalletSnapshot> {
    const w = await repo.getById(conn, params.walletId);
    if (!w) throw notFound("Wallet not found");

    const newHeld = Math.max(0, w.heldBalance - params.amount);
    const newTotal = w.totalBalance - params.amount;
    const newAvailable = newTotal - newHeld;

    const updated = await repo.updateBalances(conn, params.walletId, {
      totalBalance: newTotal,
      heldBalance: newHeld,
      availableBalance: newAvailable,
    });

    await repo.insertLedger(conn, {
      walletId: params.walletId,
      entryType: "deduct",
      actorType: params.actorType,
      amount: params.amount,
      eventKey: params.eventKey,
      sourceReference: params.sourceReference,
      reason: params.reason,
      beforeBalance: w.totalBalance,
      afterBalance: newTotal,
      balanceAfterTotal: newTotal,
      balanceAfterHeld: newHeld,
    });

    return updated;
  }

  async function credit(
    conn: DbOrTx,
    params: CreditParams,
  ): Promise<WalletSnapshot> {
    const w = await repo.getById(conn, params.walletId);
    if (!w) throw notFound("Wallet not found");

    const newTotal = w.totalBalance + params.amount;
    const newAvailable = w.availableBalance + params.amount;

    const updated = await repo.updateBalances(conn, params.walletId, {
      totalBalance: newTotal,
      heldBalance: w.heldBalance,
      availableBalance: newAvailable,
    });

    await repo.insertLedger(conn, {
      walletId: params.walletId,
      entryType: "credit",
      actorType: params.actorType,
      amount: params.amount,
      eventKey: params.eventKey,
      sourceReference: params.sourceReference,
      reason: params.reason,
      beforeBalance: w.totalBalance,
      afterBalance: newTotal,
      balanceAfterTotal: newTotal,
      balanceAfterHeld: w.heldBalance,
    });

    return updated;
  }

  async function compensate(
    conn: DbOrTx,
    params: CompensateParams,
  ): Promise<WalletSnapshot> {
    const w = await repo.getById(conn, params.walletId);
    if (!w) throw notFound("Wallet not found");

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

    const updated = await repo.updateBalances(conn, params.walletId, {
      totalBalance: newTotal,
      heldBalance: newHeld,
      availableBalance: newAvailable,
    });

    await repo.insertLedger(conn, {
      walletId: params.walletId,
      entryType: params.type,
      actorType: params.actorType,
      amount: params.amount,
      eventKey: params.eventKey,
      sourceReference: params.sourceReference,
      reason: params.reason,
      beforeBalance: w.totalBalance,
      afterBalance: newTotal,
      balanceAfterTotal: newTotal,
      balanceAfterHeld: newHeld,
    });

    return updated;
  }

  async function listLedger(
    walletId: string,
    opts?: {
      cursor?: string;
      limit?: number;
      bookingId?: string;
      eventKey?: string;
    },
  ) {
    return repo.listLedger(db, walletId, opts);
  }

  async function knowledgeBankEligible(userId: string) {
    const w = await repo.getByUserId(db, userId);
    const threshold = 500;
    if (!w) {
      return { eligible: false, balance: 0, threshold };
    }
    return {
      eligible: w.availableBalance >= threshold,
      balance: w.availableBalance,
      threshold,
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
