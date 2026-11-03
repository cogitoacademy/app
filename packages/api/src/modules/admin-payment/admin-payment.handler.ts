import type { z } from "zod";

import type { Context } from "../../context";
import { withDomainMap } from "../../lib/handler-utils";
import { mapAdminPaymentError } from "./admin-payment.errors";
import type { AdminPaymentService } from "./admin-payment.service";
import { adminListPaymentsInput } from "./admin-payment.types";

type ListPaymentsInput = z.infer<typeof adminListPaymentsInput>;

export type AdminPaymentHandler = ReturnType<typeof createAdminPaymentHandler>;

export function createAdminPaymentHandler(service: AdminPaymentService) {
  return {
    listPayments: async ({
      input,
    }: {
      context: Context;
      input: ListPaymentsInput;
    }) =>
      withDomainMap(
        () => service.list(input ?? { limit: 50 }),
        mapAdminPaymentError,
      ),
  };
}
