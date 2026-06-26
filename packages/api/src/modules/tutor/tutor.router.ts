import { z } from "zod";

import { protectedProcedure } from "../../procedures";
import { updateMyProfileInput } from "./tutor.types";
import {
  upsertAvailabilityInput,
  deleteAvailabilityInput,
} from "./availability.types";

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

  listAvailability: protectedProcedure
    .route({
      method: "POST",
      path: "/tutor/availability/list",
      tags: ["Tutor"],
      summary: "List availability",
      description: "Returns the authenticated tutor's active availability slots",
    })
    .input(z.void())
    .handler(async ({ context }) => {
      return context.services.tutor.listAvailability(context.session.user.id);
    }),

  upsertAvailability: protectedProcedure
    .route({
      method: "POST",
      path: "/tutor/availability/upsert",
      tags: ["Tutor"],
      summary: "Upsert availability",
      description: "Creates or updates a tutor availability window",
    })
    .input(upsertAvailabilityInput)
    .handler(async ({ context, input }) => {
      return context.services.tutor.upsertAvailability(
        context.session.user.id,
        input,
      );
    }),

  deleteAvailability: protectedProcedure
    .route({
      method: "POST",
      path: "/tutor/availability/delete",
      tags: ["Tutor"],
      summary: "Delete availability",
      description: "Deletes a tutor availability window",
    })
    .input(deleteAvailabilityInput)
    .handler(async ({ context, input }) => {
      return context.services.tutor.deleteAvailability(
        context.session.user.id,
        input.id,
      );
    }),
};
