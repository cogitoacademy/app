import type { Context } from "../../context";
import { withDomainMap } from "../../lib/handler-utils";
import { z } from "zod";
import { mapAuthError } from "./auth.errors";
import type { updateProfileInput } from "./auth.types";
import type { AuthService, MeResult } from "./auth.service";

type UpdateProfileInput = z.infer<typeof updateProfileInput>;

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
  };
}
