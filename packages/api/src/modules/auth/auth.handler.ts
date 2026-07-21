import type { Context } from "../../context";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { internalServerError } from "../../lib/errors";
import type { updateProfileInput } from "./auth.types";
import type { AuthService, MeResult } from "./auth.service";

type UpdateProfileInput = z.infer<typeof updateProfileInput>;

export type { MeResult };

export type AuthHandler = ReturnType<typeof createAuthHandler>;

export function createAuthHandler(authService: AuthService) {
  return {
    me: async ({ context }: { context: Context }) => {
      try {
        const result = await authService.me(context.session!.user.id);
        return {
          user: context.session!.user,
          profile: result.profile,
          tutorProfile: result.tutorProfile,
          wallet: result.wallet,
        };
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to fetch user profile", err);
      }
    },

    getProfile: async ({ context }: { context: Context }) => {
      try {
        return authService.getProfile(context.session!.user.id);
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to fetch profile", err);
      }
    },

    updateProfile: async ({
      context,
      input,
    }: {
      context: Context;
      input: UpdateProfileInput;
    }) => {
      try {
        return authService.updateProfile(context.session!.user.id, input);
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to update profile", err);
      }
    },
  };
}
