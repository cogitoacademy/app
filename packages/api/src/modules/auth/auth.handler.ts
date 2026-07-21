import type { Context } from "../../context";
import type { z } from "zod";
import type { updateProfileInput } from "./auth.types";
import type { AuthService, MeResult } from "./auth.service";

type UpdateProfileInput = z.infer<typeof updateProfileInput>;

export type { MeResult };

export type AuthHandler = ReturnType<typeof createAuthHandler>;

export function createAuthHandler(authService: AuthService) {
  return {
    me: async ({ context }: { context: Context }) => {
      const result = await authService.me(context.session!.user.id);
      return {
        user: context.session!.user,
        profile: result.profile,
        tutorProfile: result.tutorProfile,
        wallet: result.wallet,
      };
    },

    getProfile: async ({ context }: { context: Context }) => {
      return authService.getProfile(context.session!.user.id);
    },

    updateProfile: async ({
      context,
      input,
    }: {
      context: Context;
      input: UpdateProfileInput;
    }) => {
      return authService.updateProfile(context.session!.user.id, input);
    },
  };
}
