import type { Context } from "../../context";
import { withDomainMap } from "../../lib/handler-utils";
import { z } from "zod";
import { mapAuthError, StudentSearchForbiddenError } from "./auth.errors";
import type { updateProfileInput, searchStudentsInput } from "./auth.types";
import type { AuthService, MeResult } from "./auth.service";
import { USER_ROLE } from "../../shared/constants";

type UpdateProfileInput = z.infer<typeof updateProfileInput>;
type SearchStudentsInput = z.infer<typeof searchStudentsInput>;

export type { MeResult };

export type AuthHandler = ReturnType<typeof createAuthHandler>;

export function createAuthHandler(authService: AuthService) {
  return {
    me: async ({ context }: { context: Context }) => {
      return withDomainMap(async () => {
        const result = await authService.me(context.session!.user.id);
        return {
          user: context.session!.user,
          profile: result.profile,
          tutorProfile: result.tutorProfile,
          wallet: result.wallet,
        };
      }, mapAuthError);
    },

    getProfile: async ({ context }: { context: Context }) => {
      return withDomainMap(
        () => authService.getProfile(context.session!.user.id),
        mapAuthError,
      );
    },

    updateProfile: async ({
      context,
      input,
    }: {
      context: Context;
      input: UpdateProfileInput;
    }) => {
      return withDomainMap(
        () => authService.updateProfile(context.session!.user.id, input),
        mapAuthError,
      );
    },

    searchStudents: async ({
      context,
      input,
    }: {
      context: Context;
      input: SearchStudentsInput;
    }) => {
      return withDomainMap(async () => {
        // Group-booking invites are created by students; tutors/admins have
        // their own surfaces and must not harvest student emails (M8).
        const role = (context.session!.user as { role?: string }).role;
        if (role !== USER_ROLE.STUDENT) {
          throw new StudentSearchForbiddenError(context.session!.user.id);
        }
        return authService.searchStudents(
          context.session!.user.id,
          input.query,
          input.limit,
        );
      }, mapAuthError);
    },
  };
}
