import { adminProcedure } from "../../procedures";
import { listUsersInput, setRoleInput } from "./admin.types";
import { adminHandlers } from "./admin.handlers";

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
    .handler(adminHandlers.listUsers),

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
    .handler(adminHandlers.setRole),
};
