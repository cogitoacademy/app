import { z } from "zod";

import { protectedProcedure } from "../../procedures";
import { updateMyProfileInput } from "./tutor.types";

export const tutorRouter = {
  getMyProfile: protectedProcedure
    .route({
      method: "POST",
      path: "/tutor/profile/get",
      tags: ["Tutor"],
      summary: "Get tutor profile",
      description: "Returns the authenticated tutor's profile",
    })
    .input(z.void())
    .handler(async ({ context }) => {
      return context.services.tutor.getMyProfile(context.session.user.id);
    }),

  updateMyProfile: protectedProcedure
    .route({
      method: "POST",
      path: "/tutor/profile/update",
      tags: ["Tutor"],
      summary: "Update tutor profile",
      description: "Updates the authenticated tutor's draft profile",
    })
    .input(updateMyProfileInput)
    .handler(async ({ context, input }) => {
      return context.services.tutor.updateMyProfile(
        context.session.user.id,
        input,
      );
    }),

  submitForReview: protectedProcedure
    .route({
      method: "POST",
      path: "/tutor/profile/submit",
      tags: ["Tutor"],
      summary: "Submit tutor profile",
      description: "Submits a tutor profile for admin review",
    })
    .input(z.void())
    .handler(async ({ context }) => {
      return context.services.tutor.submitForReview(context.session.user.id);
    }),
};
