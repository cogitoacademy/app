import type { Context } from "../../context";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { internalServerError } from "../../lib/errors";
import type { TutorService } from "./tutor.service";
import { updateMyProfileInput } from "./tutor.types";
import {
  upsertAvailabilityInput,
  deleteAvailabilityInput,
} from "./availability.types";

type UpdateMyProfileInput = z.infer<typeof updateMyProfileInput>;
type UpsertAvailabilityInput = z.infer<typeof upsertAvailabilityInput>;
type DeleteAvailabilityInput = z.infer<typeof deleteAvailabilityInput>;

export type TutorHandler = ReturnType<typeof createTutorHandler>;

export function createTutorHandler(tutorService: TutorService) {
  return {
    getMyProfile: async ({ context }: { context: Context }) => {
      try {
        return tutorService.getMyProfile(context.session!.user.id);
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to fetch tutor profile", err);
      }
    },

    updateMyProfile: async ({
      context,
      input,
    }: {
      context: Context;
      input: UpdateMyProfileInput;
    }) => {
      try {
        return tutorService.updateMyProfile(context.session!.user.id, input);
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to update tutor profile", err);
      }
    },

    submitForReview: async ({ context }: { context: Context }) => {
      try {
        return tutorService.submitForReview(context.session!.user.id);
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to submit for review", err);
      }
    },

    listAvailability: async ({ context }: { context: Context }) => {
      try {
        return tutorService.listAvailability(context.session!.user.id);
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to list availability", err);
      }
    },

    upsertAvailability: async ({
      context,
      input,
    }: {
      context: Context;
      input: UpsertAvailabilityInput;
    }) => {
      try {
        return tutorService.upsertAvailability(context.session!.user.id, input);
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to upsert availability", err);
      }
    },

    deleteAvailability: async ({
      context,
      input,
    }: {
      context: Context;
      input: DeleteAvailabilityInput;
    }) => {
      try {
        await tutorService.deleteAvailability(
          context.session!.user.id,
          input.id,
        );
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to delete availability", err);
      }
    },
  };
}
