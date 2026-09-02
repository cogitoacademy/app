import { adminProcedure } from "../../procedures";
import {
  dashboardAnalyticsInput,
  listUsersInput,
  setRoleInput,
  adminGetWalletInput,
  adminListLedgerEntriesInput,
  adminGetTutorPayoutsInput,
  adminMarkTutorPayoutPaidInput,
  adminUpdateEconomySettingsInput,
} from "./admin.types";
import type { AdminHandler } from "./admin.handler";

export function createAdminRouter(handler: AdminHandler) {
  return {
    getDashboardAnalytics: adminProcedure
      .route({
        method: "POST",
        path: "/admin/dashboard-analytics",
        tags: ["Admin", "Analytics"],
        summary: "Get admin dashboard analytics",
        description:
          "Returns aggregate booking, audience, portfolio, and category metrics for the admin dashboard",
      })
      .input(dashboardAnalyticsInput)
      .handler(handler.getDashboardAnalytics),

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

    getPendingTutorPayouts: adminProcedure
      .route({
        method: "POST",
        path: "/admin/payouts/tutor/pending",
        tags: ["Admin"],
        summary: "Get unpaid tutor honorarium",
        description:
          "Returns completed tutor honorarium since the last paid cutoff",
      })
      .input(adminMarkTutorPayoutPaidInput)
      .handler(handler.getPendingTutorPayouts),

    markTutorPayoutPaid: adminProcedure
      .route({
        method: "POST",
        path: "/admin/payouts/tutor/mark-paid",
        tags: ["Admin"],
        summary: "Mark unpaid tutor honorarium as paid",
        description:
          "Creates an immutable payout record and advances the tutor's paid cutoff",
      })
      .input(adminMarkTutorPayoutPaidInput)
      .handler(handler.markTutorPayoutPaid),

    getEconomySettings: adminProcedure
      .route({
        method: "POST",
        path: "/admin/economy/get",
        tags: ["Admin", "Economy"],
        summary: "Get active economy settings",
        description:
          "Returns the active Cogito take schedule and computational Mark value",
      })
      .handler(handler.getEconomySettings),

    updateEconomySettings: adminProcedure
      .route({
        method: "POST",
        path: "/admin/economy/update",
        tags: ["Admin", "Economy"],
        summary: "Update the Cogito take schedule",
        description:
          "Updates future-booking Cogito take rates with optimistic locking and an audit record",
      })
      .input(adminUpdateEconomySettingsInput)
      .handler(handler.updateEconomySettings),
  };
}
