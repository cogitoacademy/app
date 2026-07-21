import type { Context } from "../../context";
import type { z } from "zod";
import type { listUsersInput, setRoleInput } from "./admin.types";

type ListUsersInput = z.infer<typeof listUsersInput>;
type SetRoleInput = z.infer<typeof setRoleInput>;

export const adminHandlers = {
  listUsers: async ({
    context,
    input,
  }: {
    context: Context;
    input: ListUsersInput;
  }) => {
    return context.services.admin.listUsers(input ?? {});
  },

  setRole: async ({
    context,
    input,
  }: {
    context: Context;
    input: SetRoleInput;
  }) => {
    return context.services.admin.setRole(context.session!.user.id, input);
  },
};
