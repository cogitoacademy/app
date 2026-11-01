import type { DbType } from "../../lib/db";
import type { AuditPort } from "../audit/audit.service";
import type { WalletPort } from "../wallet/wallet.service";
import { createReferralHandler } from "./referral.handler";
import { createReferralService } from "./referral.service";

export function createReferralModule(deps: {
  db: DbType;
  wallet: Pick<WalletPort, "getOrCreate" | "credit">;
  audit: AuditPort;
  clock?: () => Date;
}) {
  const service = createReferralService(deps);
  const handler = createReferralHandler(service);
  return { service, handler };
}

export type {
  ReferralService,
  EligibleReferralCompletion,
} from "./referral.service";
export type { ReferralCompletionType } from "./referral.service";
