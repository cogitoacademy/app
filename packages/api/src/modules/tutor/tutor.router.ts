import { z } from "zod";

import { tutorProcedure } from "../../procedures";
import { updateMyProfileInput, getMyPayoutsInput } from "./tutor.types";
import {
  upsertAvailabilityInput,
  createWeeklyAvailabilityInput,
  replaceWeeklyAvailabilityInput,
  deleteAvailabilityInput,
} from "./availability.types";
import type { TutorHandler } from "./tutor.handler";

export function createTutorRouter(handler: TutorHandler) {
  return {
    getMyProfile: tutorProcedure
      .route({
        method: "POST",
        path: "/tutor/profile/get",
        tags: ["Tutor"],
        summary: "Get tutor profile",
        description: "Returns the authenticated tutor's profile",
      })
      .input(z.void())
      .handler(handler.getMyProfile),

    updateMyProfile: tutorProcedure
      .route({
        method: "POST",
        path: "/tutor/profile/update",
        tags: ["Tutor"],
        summary: "Update tutor profile",
        description: "Updates the authenticated tutor's draft profile",
      })
      .input(updateMyProfileInput)
      .handler(handler.updateMyProfile),

    submitForReview: tutorProcedure
      .route({
        method: "POST",
        path: "/tutor/profile/submit",
        tags: ["Tutor"],
        summary: "Submit tutor profile",
        description: "Submits a tutor profile for admin review",
      })
      .input(z.void())
      .handler(handler.submitForReview),

    listAvailability: tutorProcedure
      .route({
        method: "POST",
        path: "/tutor/availability/list",
        tags: ["Tutor"],
        summary: "List availability",
        description:
          "Returns the authenticated tutor's active availability slots",
      })
      .input(z.void())
      .handler(handler.listAvailability),

    upsertAvailability: tutorProcedure
      .route({
        method: "POST",
        path: "/tutor/availability/upsert",
        tags: ["Tutor"],
        summary: "Upsert availability",
        description: "Creates or updates a tutor availability window",
      })
      .input(upsertAvailabilityInput)
      .handler(handler.upsertAvailability),

    createWeeklyAvailability: tutorProcedure
      .route({
        method: "POST",
        path: "/tutor/availability/weekly/create",
        tags: ["Tutor"],
        summary: "Create weekly availability",
        description:
          "Creates concrete weekly availability windows through the selected end date",
      })
      .input(createWeeklyAvailabilityInput)
      .handler(handler.createWeeklyAvailability),

    replaceWeeklyAvailability: tutorProcedure
      .route({
        method: "POST",
        path: "/tutor/availability/weekly/replace",
        tags: ["Tutor"],
        summary: "Replace weekly availability",
        description:
          "Replaces future recurring windows from a weekly-hours schedule while preserving one-off overrides",
      })
      .input(replaceWeeklyAvailabilityInput)
      .handler(handler.replaceWeeklyAvailability),

    deleteAvailability: tutorProcedure
      .route({
        method: "POST",
        path: "/tutor/availability/delete",
        tags: ["Tutor"],
        summary: "Delete availability",
        description: "Deletes a tutor availability window",
      })
      .input(deleteAvailabilityInput)
      .handler(handler.deleteAvailability),

    getMyPayouts: tutorProcedure
      .route({
        method: "POST",
        path: "/tutor/payouts/get",
        tags: ["Tutor"],
        summary: "Get my payout summary",
        description:
          "Returns the authenticated tutor's payout summary from completed bookings",
      })
      .input(getMyPayoutsInput)
      .handler(handler.getMyPayouts),
  };
}
