import type { DbOrTx } from "../../lib/tx";

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
}

export interface ReleaseParams {
  walletId: string;
  amount: number;
  eventKey: string;
  sourceReference?: string;
  actorType: ActorType;
  reason?: string;
}

export interface DeductParams {
  walletId: string;
  amount: number;
  eventKey: string;
  sourceReference?: string;
  actorType: ActorType;
  reason?: string;
}

export interface CreditParams {
  walletId: string;
  amount: number;
  eventKey: string;
  sourceReference?: string;
  actorType: ActorType;
  reason?: string;
}

export interface CompensateParams {
  walletId: string;
  amount: number;
  eventKey: string;
  sourceReference?: string;
  actorType: ActorType;
  reason?: string;
  type: "compensate_credit" | "compensate_deduct";
}

export interface WalletSnapshot {
  id: string;
  totalBalance: number;
  heldBalance: number;
  availableBalance: number;
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
}
