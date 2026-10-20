import type { Context } from "../../context";
import { z } from "zod";
import { withDomainMap } from "../../lib/handler-utils";
import { mapAdminError } from "./admin.errors";
import type {
  AdminService,
  ListUsersInput,
  ListUsersResult,
  GetTutorPayoutsInput,
  GetTutorPayoutReportInput,
} from "./admin.service";
import type {
  listUsersInput,
  dashboardAnalyticsInput,
  setRoleInput,
  adminGetWalletInput,
  adminListLedgerEntriesInput,
  adminSearchUsersInput,
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

type ListUsersInputZod = z.infer<typeof listUsersInput>;
type DashboardAnalyticsInputZod = z.infer<typeof dashboardAnalyticsInput>;
type SetRoleInputZod = z.infer<typeof setRoleInput>;
type AdminGetWalletInputZod = z.infer<typeof adminGetWalletInput>;
type AdminListLedgerEntriesInputZod = z.infer<
  typeof adminListLedgerEntriesInput
>;
type AdminSearchUsersInputZod = z.infer<typeof adminSearchUsersInput>;
type AdminGetTutorPayoutsInputZod = z.infer<typeof adminGetTutorPayoutsInput>;
type AdminGetTutorPayoutReportInputZod = z.infer<
  typeof adminGetTutorPayoutReportInput
>;
type AdminGetPendingTutorPayoutsInputZod = z.infer<
  typeof adminGetPendingTutorPayoutsInput
>;
type AdminGetTutorPayoutAllocationsInputZod = z.infer<
  typeof adminGetTutorPayoutAllocationsInput
>;
type AdminUpdateEconomySettingsInputZod = z.infer<
  typeof adminUpdateEconomySettingsInput
>;

export type {
  ListUsersInput,
  ListUsersResult,
  GetTutorPayoutsInput,
  GetTutorPayoutReportInput,
};

export type AdminHandler = ReturnType<typeof createAdminHandler>;

export function createAdminHandler(adminService: AdminService) {
  return {
    getV3EconomySettings: async () =>
      withDomainMap(() => adminService.getV3EconomySettings(), mapAdminError),
    previewV3EconomySettings: async ({
      input,
    }: {
      input: z.infer<typeof adminPreviewV3EconomyInput>;
    }) =>
      withDomainMap(
        async () => adminService.previewV3EconomySettings(input),
        mapAdminError,
      ),
    saveV3EconomySettings: async ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof adminSaveV3EconomyInput>;
    }) =>
      withDomainMap(
        () =>
          adminService.saveV3EconomySettings(context.session!.user.id, input),
        mapAdminError,
      ),
    getDashboardAnalytics: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: DashboardAnalyticsInputZod;
    }) => {
      return withDomainMap(
        () => adminService.getDashboardAnalytics(input),
        mapAdminError,
      );
    },

    listUsers: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: ListUsersInputZod;
    }) => {
      return withDomainMap(
        () => adminService.listUsers(input ?? {}),
        mapAdminError,
      );
    },

    searchUsers: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: AdminSearchUsersInputZod;
    }) => {
      return withDomainMap(
        () => adminService.searchUsers(input),
        mapAdminError,
      );
    },

    setRole: async ({
      context,
      input,
    }: {
      context: Context;
      input: SetRoleInputZod;
    }) => {
      return withDomainMap(
        () => adminService.setRole(context.session!.user.id, input),
        mapAdminError,
      );
    },

    getWallet: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: AdminGetWalletInputZod;
    }) => {
      return withDomainMap(() => adminService.getWallet(input), mapAdminError);
    },

    listLedgerEntries: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: AdminListLedgerEntriesInputZod;
    }) => {
      return withDomainMap(
        () => adminService.listLedgerEntries(input),
        mapAdminError,
      );
    },

    getTutorPayouts: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: AdminGetTutorPayoutsInputZod;
    }) => {
      return withDomainMap(
        () => adminService.getTutorPayouts(input),
        mapAdminError,
      );
    },

    getTutorPayoutReport: async ({
      input,
    }: {
      context: Context;
      input: AdminGetTutorPayoutReportInputZod;
    }) => {
      return withDomainMap(
        () => adminService.getTutorPayoutReport(input ?? {}),
        mapAdminError,
      );
    },

    getPendingTutorPayouts: async ({
      input,
    }: {
      context: Context;
      input: AdminGetPendingTutorPayoutsInputZod;
    }) => {
      return withDomainMap(
        () => adminService.getPendingTutorPayouts(input),
        mapAdminError,
      );
    },

    getTutorPayoutAllocations: async ({
      input,
    }: {
      context: Context;
      input: AdminGetTutorPayoutAllocationsInputZod;
    }) => {
      return withDomainMap(
        () => adminService.getTutorPayoutAllocations(input),
        mapAdminError,
      );
    },

    previewTutorPayout: async ({
      input,
    }: {
      input: z.infer<typeof adminPreviewTutorPayoutInput>;
    }) =>
      withDomainMap(
        () => adminService.previewTutorPayout(input),
        mapAdminError,
      ),

    prepareTutorPayout: async ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof adminPrepareTutorPayoutInput>;
    }) =>
      withDomainMap(
        () => adminService.prepareTutorPayout(context.session!.user.id, input),
        mapAdminError,
      ),

    recordTutorPayoutTransfer: async ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof adminRecordTutorPayoutTransferInput>;
    }) =>
      withDomainMap(
        () =>
          adminService.recordTutorPayoutTransfer(
            context.session!.user.id,
            input,
          ),
        mapAdminError,
      ),

    voidTutorPayout: async ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof adminVoidTutorPayoutInput>;
    }) =>
      withDomainMap(
        () => adminService.voidTutorPayout(context.session!.user.id, input),
        mapAdminError,
      ),

    resolveTutorPayoutReconciliation: async ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof adminResolveTutorPayoutReconciliationInput>;
    }) =>
      withDomainMap(
        () =>
          adminService.resolveTutorPayoutReconciliation(
            context.session!.user.id,
            input,
          ),
        mapAdminError,
      ),

    getTutorTaxConfig: async ({ context: _context }: { context: Context }) =>
      withDomainMap(() => adminService.getTutorTaxConfig(), mapAdminError),

    updateTutorTaxConfig: async ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof adminUpdateTutorTaxConfigInput>;
    }) =>
      withDomainMap(
        () =>
          adminService.updateTutorTaxConfig(context.session!.user.id, input),
        mapAdminError,
      ),

    setTutorTaxRateOverride: async ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof adminSetTutorTaxRateOverrideInput>;
    }) =>
      withDomainMap(
        () =>
          adminService.setTutorTaxRateOverride(context.session!.user.id, input),
        mapAdminError,
      ),

    getEconomySettings: async ({ context: _context }: { context: Context }) => {
      return withDomainMap(
        () => adminService.getEconomySettings(),
        mapAdminError,
      );
    },

    updateEconomySettings: async ({
      context,
      input,
    }: {
      context: Context;
      input: AdminUpdateEconomySettingsInputZod;
    }) => {
      return withDomainMap(
        () =>
          adminService.updateEconomySettings(context.session!.user.id, input),
        mapAdminError,
      );
    },
  };
}
