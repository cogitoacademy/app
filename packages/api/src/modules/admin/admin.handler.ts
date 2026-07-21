import type { Context } from "../../context";
import type { z } from "zod";
import type {
  AdminService,
  ListUsersInput,
  ListUsersResult,
} from "./admin.service";
import type { listUsersInput, setRoleInput } from "./admin.types";

type ListUsersInputZod = z.infer<typeof listUsersInput>;
type SetRoleInputZod = z.infer<typeof setRoleInput>;

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
      return adminService.listUsers(input ?? {});
    },

    setRole: async ({
      context,
      input,
    }: {
      context: Context;
      input: SetRoleInputZod;
    }) => {
      return adminService.setRole(context.session!.user.id, input);
    },
  };
}
