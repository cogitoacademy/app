import { z } from "zod";

import { protectedProcedure } from "../../procedures";
import { updateMyProfileInput } from "./tutor.types";
import {
  upsertAvailabilityInput,
  deleteAvailabilityInput,
} from "./availability.types";
import { tutorHandlers } from "./tutor.handlers";

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
    .handler(tutorHandlers.getMyProfile),

  updateMyProfile: protectedProcedure
    .route({
      method: "POST",
      path: "/tutor/profile/update",
      tags: ["Tutor"],
      summary: "Update tutor profile",
      description: "Updates the authenticated tutor's draft profile",
    })
    .input(updateMyProfileInput)
    .handler(tutorHandlers.updateMyProfile),

  submitForReview: protectedProcedure
    .route({
      method: "POST",
      path: "/tutor/profile/submit",
      tags: ["Tutor"],
      summary: "Submit tutor profile",
      description: "Submits a tutor profile for admin review",
    })
    .input(z.void())
    .handler(tutorHandlers.submitForReview),

  listAvailability: protectedProcedure
    .route({
      method: "POST",
      path: "/tutor/availability/list",
      tags: ["Tutor"],
      summary: "List availability",
      description:
        "Returns the authenticated tutor's active availability slots",
    })
    .input(z.void())
    .handler(tutorHandlers.listAvailability),

  upsertAvailability: protectedProcedure
    .route({
      method: "POST",
      path: "/tutor/availability/upsert",
      tags: ["Tutor"],
      summary: "Upsert availability",
      description: "Creates or updates a tutor availability window",
    })
    .input(upsertAvailabilityInput)
    .handler(tutorHandlers.upsertAvailability),

  deleteAvailability: protectedProcedure
    .route({
      method: "POST",
      path: "/tutor/availability/delete",
      tags: ["Tutor"],
      summary: "Delete availability",
      description: "Deletes a tutor availability window",
    })
    .input(deleteAvailabilityInput)
    .handler(tutorHandlers.deleteAvailability),
};
