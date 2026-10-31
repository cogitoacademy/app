import type { DbType } from "../../lib/db";
import type { NotificationService } from "../notification/notification.service";
import type { PaymentService } from "../payment/payment.service";
import type { WalletService } from "../wallet/wallet.service";
import type { ReferralService } from "../referral/referral.service";
import { createClassEnrollmentHandler } from "./class-enrollment.handler";
import { createClassEnrollmentService } from "./class-enrollment.service";

export function createClassEnrollmentModule(deps: {
  db: DbType;
  wallet: Pick<WalletService, "hold" | "getOrCreate" | "release" | "deduct">;
  payment: Pick<
    PaymentService,
    "createTopUpQuote" | "createPurchaseFromTopUpQuote"
  >;
  notification: Pick<NotificationService, "write">;
  appBaseUrl: string;
  referralPort?: Pick<ReferralService, "recordEligibleFirstCompletion">;
  clock?: () => Date;
}) {
  const service = createClassEnrollmentService(deps);
  const handler = createClassEnrollmentHandler(service);
  return { service, handler };
}

export type { ClassEnrollmentService } from "./class-enrollment.service";
export type { ClassEnrollmentHandler } from "./class-enrollment.handler";
