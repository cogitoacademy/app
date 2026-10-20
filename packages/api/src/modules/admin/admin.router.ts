import { adminProcedure } from "../../procedures";
import {
  dashboardAnalyticsInput,
  listUsersInput,
  adminSearchUsersInput,
  setRoleInput,
  adminGetWalletInput,
  adminListLedgerEntriesInput,
  adminGetTutorPayoutsInput,
  adminGetTutorPayoutReportInput,
  adminGetPendingTutorPayoutsInput,
  adminGetTutorPayoutAllocationsInput,
  adminPreviewTutorPayoutInput,
  adminPrepareTutorPayoutInput,
  adminRecordTutorPayoutTransferInput,
  adminVoidTutorPayoutInput,
  adminResolveTutorPayoutReconciliationInput,
  adminUpdateTutorTaxConfigInput,
  adminSetTutorTaxRateOverrideInput,
  adminUpdateEconomySettingsInput,
  adminPreviewV3EconomyInput,
  adminSaveV3EconomyInput,
} from "./admin.types";
import type { AdminHandler } from "./admin.handler";

export function createAdminRouter(handler: AdminHandler) {
  return {
    getV3EconomySettings: adminProcedure
      .route({
        method: "POST",
        path: "/admin/economy/v3/get",
        tags: ["Admin", "Economy"],
        summary: "Get latest V3 draft economy revision",
      })
      .handler(handler.getV3EconomySettings),
    previewV3EconomySettings: adminProcedure
      .route({
        method: "POST",
        path: "/admin/economy/v3/preview",
        tags: ["Admin", "Economy"],
        summary: "Preview V3 session and exact top-up rates",
      })
      .input(adminPreviewV3EconomyInput)
      .handler(handler.previewV3EconomySettings),
    saveV3EconomySettings: adminProcedure
      .route({
        method: "POST",
        path: "/admin/economy/v3/save",
        tags: ["Admin", "Economy"],
        summary:
          "Append an audited V3 draft economy revision without activation",
      })
      .input(adminSaveV3EconomyInput)
      .handler(handler.saveV3EconomySettings),
    getDashboardAnalytics: adminProcedure
      .route({
        method: "POST",
        path: "/admin/dashboard-analytics",
        tags: ["Admin", "Analytics"],
        summary: "Get admin dashboard analytics",
        description:
          "Returns booking, account activity, wallet health, payment, portfolio, and demand metrics for the admin dashboard",
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

    searchUsers: adminProcedure
      .route({
        method: "POST",
        path: "/admin/users/search",
        tags: ["Admin"],
        summary: "Search users",
        description:
          "Finds users by name, email, or user ID for admin support workflows",
      })
      .input(adminSearchUsersInput)
      .handler(handler.searchUsers),

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

    getTutorPayoutReport: adminProcedure
      .route({
        method: "POST",
        path: "/admin/payouts/tutor/report",
        tags: ["Admin"],
        summary: "Get the tutor payout report",
        description:
          "Returns paid payout batches and current unpaid tutor honorarium for a selected date window",
      })
      .input(adminGetTutorPayoutReportInput)
      .handler(handler.getTutorPayoutReport),

    getPendingTutorPayouts: adminProcedure
      .route({
        method: "POST",
        path: "/admin/payouts/tutor/pending",
        tags: ["Admin"],
        summary: "Get unpaid tutor honorarium",
        description:
          "Returns completed tutor honorarium since the last paid cutoff",
      })
      .input(adminGetPendingTutorPayoutsInput)
      .handler(handler.getPendingTutorPayouts),

    getTutorPayoutAllocations: adminProcedure
      .route({
        method: "POST",
        path: "/admin/payouts/tutor/details",
        tags: ["Admin"],
        summary: "Get sessions allocated to a tutor payout",
        description:
          "Returns the immutable per-session sources recorded for a paid tutor transfer",
      })
      .input(adminGetTutorPayoutAllocationsInput)
      .handler(handler.getTutorPayoutAllocations),

    previewTutorPayout: adminProcedure
      .route({
        method: "POST",
        path: "/admin/payouts/tutor/preview",
        tags: ["Admin"],
        summary: "Preview a selected tutor payout batch",
        description:
          "Revalidates selected unpaid sessions, bank details and tax-rate basis",
      })
      .input(adminPreviewTutorPayoutInput)
      .handler(handler.previewTutorPayout),

    prepareTutorPayout: adminProcedure
      .route({
        method: "POST",
        path: "/admin/payouts/tutor/prepare",
        tags: ["Admin"],
        summary: "Prepare an immutable tutor payout preview",
      })
      .input(adminPrepareTutorPayoutInput)
      .handler(handler.prepareTutorPayout),

    recordTutorPayoutTransfer: adminProcedure
      .route({
        method: "POST",
        path: "/admin/payouts/tutor/record-transfer",
        tags: ["Admin"],
        summary: "Record an externally performed tutor transfer",
        description:
          "Records actual amount, date and optional evidence after the bank transfer; it does not execute a transfer",
      })
      .input(adminRecordTutorPayoutTransferInput)
      .handler(handler.recordTutorPayoutTransfer),

    voidTutorPayout: adminProcedure
      .route({
        method: "POST",
        path: "/admin/payouts/tutor/void",
        tags: ["Admin"],
        summary: "Void a payout while keeping its audit and transfer evidence",
      })
      .input(adminVoidTutorPayoutInput)
      .handler(handler.voidTutorPayout),

    resolveTutorPayoutReconciliation: adminProcedure
      .route({
        method: "POST",
        path: "/admin/payouts/tutor/reconciliation/resolve",
        tags: ["Admin"],
        summary: "Resolve an audited transfer reconciliation",
      })
      .input(adminResolveTutorPayoutReconciliationInput)
      .handler(handler.resolveTutorPayoutReconciliation),

    getTutorTaxConfig: adminProcedure
      .route({
        method: "POST",
        path: "/admin/payouts/tutor/tax-config/get",
        tags: ["Admin"],
        summary: "Get configurable tutor payout tax defaults",
      })
      .handler(handler.getTutorTaxConfig),

    updateTutorTaxConfig: adminProcedure
      .route({
        method: "POST",
        path: "/admin/payouts/tutor/tax-config/update",
        tags: ["Admin"],
        summary: "Update audited tutor payout tax defaults",
      })
      .input(adminUpdateTutorTaxConfigInput)
      .handler(handler.updateTutorTaxConfig),

    setTutorTaxRateOverride: adminProcedure
      .route({
        method: "POST",
        path: "/admin/payouts/tutor/tax-override/set",
        tags: ["Admin"],
        summary: "Set an audited tutor-specific payout tax rate",
      })
      .input(adminSetTutorTaxRateOverrideInput)
      .handler(handler.setTutorTaxRateOverride),

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
