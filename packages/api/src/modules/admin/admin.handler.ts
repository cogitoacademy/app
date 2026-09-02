import type { Context } from "../../context";
import { z } from "zod";
import { withDomainMap } from "../../lib/handler-utils";
import { mapAdminError } from "./admin.errors";
import type {
  AdminService,
  ListUsersInput,
  ListUsersResult,
  GetTutorPayoutsInput,
} from "./admin.service";
import type {
  listUsersInput,
  dashboardAnalyticsInput,
  setRoleInput,
  adminGetWalletInput,
  adminListLedgerEntriesInput,
  adminSearchUsersInput,
  adminGetTutorPayoutsInput,
  adminMarkTutorPayoutPaidInput,
  adminUpdateEconomySettingsInput,
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
type AdminMarkTutorPayoutPaidInputZod = z.infer<
  typeof adminMarkTutorPayoutPaidInput
>;
type AdminUpdateEconomySettingsInputZod = z.infer<
  typeof adminUpdateEconomySettingsInput
>;

export type { ListUsersInput, ListUsersResult, GetTutorPayoutsInput };

export type AdminHandler = ReturnType<typeof createAdminHandler>;

export function createAdminHandler(adminService: AdminService) {
  return {
    getDashboardAnalytics: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: DashboardAnalyticsInputZod;
    }) => {
      return withDomainMap(
        () => adminService.getDashboardAnalytics(input?.period),
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

    getPendingTutorPayouts: async ({
      input,
    }: {
      context: Context;
      input: AdminMarkTutorPayoutPaidInputZod;
    }) => {
      return withDomainMap(
        () => adminService.getPendingTutorPayouts(input),
        mapAdminError,
      );
    },

    markTutorPayoutPaid: async ({
      context,
      input,
    }: {
      context: Context;
      input: AdminMarkTutorPayoutPaidInputZod;
    }) => {
      return withDomainMap(
        () => adminService.markTutorPayoutPaid(context.session!.user.id, input),
        mapAdminError,
      );
    },

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
