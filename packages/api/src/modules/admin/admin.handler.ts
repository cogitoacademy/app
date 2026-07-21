import type { Context } from "../../context";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { internalServerError } from "../../lib/errors";
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
      try {
        return adminService.listUsers(input ?? {});
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to list users", err);
      }
    },

    setRole: async ({
      context,
      input,
    }: {
      context: Context;
      input: SetRoleInputZod;
    }) => {
      try {
        return adminService.setRole(context.session!.user.id, input);
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to set user role", err);
      }
    },
  };
}
