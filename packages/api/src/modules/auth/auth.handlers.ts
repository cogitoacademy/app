import type { Context } from "../../context";
import type { z } from "zod";
import type { updateProfileInput } from "./auth.types";

type UpdateProfileInput = z.infer<typeof updateProfileInput>;

export const authHandlers = {
  me: async ({ context }: { context: Context }) => {
    const result = await context.services.auth.me(context.session!.user.id);
    return {
      user: context.session!.user,
      profile: result.profile,
      tutorProfile: result.tutorProfile,
      wallet: result.wallet,
    };
  },

  getProfile: async ({ context }: { context: Context }) => {
    return context.services.auth.getProfile(context.session!.user.id);
  },

  updateProfile: async ({
    context,
    input,
  }: {
    context: Context;
    input: UpdateProfileInput;
  }) => {
    return context.services.auth.updateProfile(context.session!.user.id, input);
  },
};
