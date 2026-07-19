import { z } from "zod";

import { protectedProcedure } from "../../procedures";
import { updateProfileInput } from "./auth.types";
import { authHandlers } from "./auth.handlers";

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
    .handler(authHandlers.me),

  getProfile: protectedProcedure
    .route({
      method: "POST",
      path: "/auth/profile/get",
      tags: ["Auth"],
      summary: "Get student profile",
      description: "Returns the authenticated user's student profile",
    })
    .input(z.void())
    .handler(authHandlers.getProfile),

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
    .handler(authHandlers.updateProfile),
};
