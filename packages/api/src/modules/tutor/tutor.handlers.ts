import type { Context } from "../../context";
import type { z } from "zod";
import type { updateMyProfileInput } from "./tutor.types";
import type {
  upsertAvailabilityInput,
  deleteAvailabilityInput,
} from "./availability.types";

type UpdateMyProfileInput = z.infer<typeof updateMyProfileInput>;
type UpsertAvailabilityInput = z.infer<typeof upsertAvailabilityInput>;
type DeleteAvailabilityInput = z.infer<typeof deleteAvailabilityInput>;

export const tutorHandlers = {
  getMyProfile: async ({ context }: { context: Context }) => {
    return context.services.tutor.getMyProfile(context.session!.user.id);
  },

  updateMyProfile: async ({
    context,
    input,
  }: {
    context: Context;
    input: UpdateMyProfileInput;
  }) => {
    return context.services.tutor.updateMyProfile(
      context.session!.user.id,
      input,
    );
  },

  submitForReview: async ({ context }: { context: Context }) => {
    return context.services.tutor.submitForReview(context.session!.user.id);
  },

  listAvailability: async ({ context }: { context: Context }) => {
    return context.services.tutor.listAvailability(context.session!.user.id);
  },

  upsertAvailability: async ({
    context,
    input,
  }: {
    context: Context;
    input: UpsertAvailabilityInput;
  }) => {
    return context.services.tutor.upsertAvailability(
      context.session!.user.id,
      input,
    );
  },

  deleteAvailability: async ({
    context,
    input,
  }: {
    context: Context;
    input: DeleteAvailabilityInput;
  }) => {
    return context.services.tutor.deleteAvailability(
      context.session!.user.id,
      input.id,
    );
  },
};
