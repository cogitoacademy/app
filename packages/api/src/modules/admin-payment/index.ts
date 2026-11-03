import type { DbType } from "../../lib/db";
import { createAdminPaymentHandler } from "./admin-payment.handler";
import { createAdminPaymentRepo } from "./admin-payment.repo";
import { createAdminPaymentService } from "./admin-payment.service";

export type AdminPaymentModule = ReturnType<typeof createAdminPaymentModule>;

export function createAdminPaymentModule(deps: { db: DbType }) {
  const repo = createAdminPaymentRepo();
  const service = createAdminPaymentService({ db: deps.db, repo });
  const handler = createAdminPaymentHandler(service);
  return { repo, service, handler };
}

export type { AdminPaymentService } from "./admin-payment.service";
export type { AdminPaymentHandler } from "./admin-payment.handler";
export type {
  AdminListPaymentsInput,
  AdminListPaymentsResult,
  AdminPaymentListItem,
} from "./admin-payment.types";
