import { adminProcedure } from "../../procedures";
import {
  listUsersInput,
  setRoleInput,
  adminGetWalletInput,
  adminListLedgerEntriesInput,
  adminGetTutorPayoutsInput,
} from "./admin.types";
import type { AdminHandler } from "./admin.handler";

export function createAdminRouter(handler: AdminHandler) {
  return {
    listUsers: adminProcedure
      .route({
        method: "POST",
        path: "/admin/users/list",
        tags: ["Admin"],
        summary: "List users",
        description: "Returns a paginated list of users",
      })
      .input(listUsersInput)
      .handler(handler.listUsers),

    setRole: adminProcedure
      .route({
        method: "POST",
        path: "/admin/users/set-role",
        tags: ["Admin"],
        summary: "Set user role",
        description:
          "Updates a user's role with audit trail and last-admin guard",
      })
      .input(setRoleInput)
      .handler(handler.setRole),

    getWallet: adminProcedure
      .route({
        method: "POST",
        path: "/admin/wallet/get",
        tags: ["Admin"],
        summary: "Get any user's wallet",
        description: "Returns balance, held, and available Marks for a user",
      })
      .input(adminGetWalletInput)
      .handler(handler.getWallet),

    listLedgerEntries: adminProcedure
      .route({
        method: "POST",
        path: "/admin/wallet/ledger",
        tags: ["Admin"],
        summary: "List ledger entries for any wallet",
        description:
          "Paginated ledger entries filtered by entry type, date range, or booking",
      })
      .input(adminListLedgerEntriesInput)
      .handler(handler.listLedgerEntries),

    getTutorPayouts: adminProcedure
      .route({
        method: "POST",
        path: "/admin/payouts/tutor",
        tags: ["Admin"],
        summary: "Get tutor payout summary",
        description:
          "Returns a tutor's payout summary from completed bookings in a date range",
      })
      .input(adminGetTutorPayoutsInput)
      .handler(handler.getTutorPayouts),
  };
}
