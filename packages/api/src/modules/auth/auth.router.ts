import { z } from "zod";

import { protectedProcedure } from "../../procedures";
import { updateProfileInput } from "./auth.types";

export const authRouter = {
  me: protectedProcedure
    .route({
      method: "POST",
      path: "/auth/me",
      tags: ["Auth"],
      summary: "Get current user",
      description:
        "Returns the authenticated user with student profile, tutor profile, and wallet data",
    })
    .input(z.void())
    .handler(async ({ context }) => {
      const result = await context.services.auth.me(context.session.user.id);
      return {
        user: context.session.user,
        profile: result.profile,
        tutorProfile: result.tutorProfile,
        wallet: result.wallet,
      };
    }),

  getProfile: protectedProcedure
    .route({
      method: "POST",
      path: "/auth/profile/get",
      tags: ["Auth"],
      summary: "Get student profile",
      description: "Returns the authenticated user's student profile",
    })
    .input(z.void())
    .handler(async ({ context }) => {
      return context.services.auth.getProfile(context.session.user.id);
    }),

  updateProfile: protectedProcedure
    .route({
      method: "POST",
      path: "/auth/profile/update",
      tags: ["Auth"],
      summary: "Update student profile",
      description:
        "Creates or updates the authenticated user's student profile",
    })
    .input(updateProfileInput)
    .handler(async ({ context, input }) => {
      return context.services.auth.updateProfile(
        context.session.user.id,
        input,
      );
    }),
};
