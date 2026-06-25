import { adminProcedure } from "../../procedures";
import { listUsersInput, setRoleInput } from "./admin.types";

export const adminRouter = {
  listUsers: adminProcedure
    .route({
      method: "POST",
      path: "/admin/users/list",
      tags: ["Admin"],
      summary: "List users",
      description: "Returns a paginated list of users",
    })
    .input(listUsersInput)
    .handler(async ({ context, input }) => {
      return context.services.admin.listUsers(input ?? {});
    }),

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
    .handler(async ({ context, input }) => {
      return context.services.admin.setRole(context.session.user.id, input);
    }),
};
