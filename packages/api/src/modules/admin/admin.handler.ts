import type {
  AdminService,
  SetRoleInput,
  ListUsersInput,
  ListUsersResult,
} from "./admin.service";
import type { UserRow } from "./admin.repo";

export type { ListUsersInput, ListUsersResult };

export type AdminHandler = ReturnType<typeof createAdminHandler>;

export function createAdminHandler(deps: { adminService: AdminService }) {
  const { adminService } = deps;

  async function listUsers(
    input: ListUsersInput = {},
  ): Promise<ListUsersResult> {
    return adminService.listUsers(input);
  }

  async function setRole(
    adminId: string,
    input: SetRoleInput,
  ): Promise<UserRow> {
    return adminService.setRole(adminId, input);
  }

  return { listUsers, setRole };
}
