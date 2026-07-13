import type { ORPCError } from "@orpc/server";
import { notFound, conflict } from "../../lib/errors";
import { USER_ROLE } from "../../shared/constants";
import type { UserRole } from "./admin.repo";

export interface SetRoleInput {
  userId: string;
  role: UserRole;
}

export interface TargetUser {
  id: string;
  role: string;
}

type AdminError =
  | ORPCError<"NOT_FOUND", undefined>
  | ORPCError<"CONFLICT", undefined>;

export type RoleChangeResult =
  | { ok: true; previousRole: string }
  | { ok: false; error: AdminError };

export function validateRoleChange(
  target: TargetUser | null,
  newRole: UserRole,
  adminCount: number,
): RoleChangeResult {
  if (!target) {
    return { ok: false, error: notFound("User not found") };
  }

  const previousRole = target.role;

  if (
    previousRole === USER_ROLE.ADMIN &&
    newRole !== USER_ROLE.ADMIN &&
    adminCount <= 1
  ) {
    return {
      ok: false,
      error: conflict("Cannot demote the last admin user"),
    };
  }

  return { ok: true, previousRole };
}
