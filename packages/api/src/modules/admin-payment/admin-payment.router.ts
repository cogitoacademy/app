import { adminProcedure } from "../../procedures";
import type { AdminPaymentHandler } from "./admin-payment.handler";
import { adminListPaymentsInput } from "./admin-payment.types";

export function createAdminPaymentRouter(handler: AdminPaymentHandler) {
  return {
    listPayments: adminProcedure
      .route({
        method: "POST",
        path: "/admin/payment/list",
        tags: ["Admin", "Payments"],
        summary: "List payments for admin review",
        description:
          "Returns a paginated payment list with user identity, provider refund facts, and the total for the current filters",
      })
      .input(adminListPaymentsInput)
      .handler(handler.listPayments),
  };
}
