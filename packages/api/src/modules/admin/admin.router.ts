import { adminProcedure } from "../../procedures";
import { listUsersInput, setRoleInput } from "./admin.types";
import type { AdminHandler } from "./admin.handler";

export function createAdminRouter(handler: AdminHandler) {
  return {
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
  };
}
