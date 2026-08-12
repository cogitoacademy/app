import type { Context } from "../../context";
import { z } from "zod";
import { withDomainMap } from "../../lib/handler-utils";
import { mapAdminError } from "./admin.errors";
import type {
  AdminService,
  ListUsersInput,
  ListUsersResult,
} from "./admin.service";
import type {
  listUsersInput,
  setRoleInput,
  adminGetWalletInput,
  adminListLedgerEntriesInput,
} from "./admin.types";

type ListUsersInputZod = z.infer<typeof listUsersInput>;
type SetRoleInputZod = z.infer<typeof setRoleInput>;
type AdminGetWalletInputZod = z.infer<typeof adminGetWalletInput>;
type AdminListLedgerEntriesInputZod = z.infer<typeof adminListLedgerEntriesInput>;

export type { ListUsersInput, ListUsersResult };

export type AdminHandler = ReturnType<typeof createAdminHandler>;

export function createAdminHandler(adminService: AdminService) {
  return {
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
      return withDomainMap(
        () => adminService.getWallet(input),
        mapAdminError,
      );
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
  };
}
