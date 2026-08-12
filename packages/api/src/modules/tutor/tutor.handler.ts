import type { Context } from "../../context";
import { z } from "zod";
import { withDomainMap } from "../../lib/handler-utils";
import type { TutorService } from "./tutor.service";
import { updateMyProfileInput } from "./tutor.types";
import {
  upsertAvailabilityInput,
  createWeeklyAvailabilityInput,
  deleteAvailabilityInput,
} from "./availability.types";
import { mapTutorError } from "./tutor.errors";
import { getMyPayoutsInput } from "./tutor.types";

type UpdateMyProfileInput = z.infer<typeof updateMyProfileInput>;
type UpsertAvailabilityInput = z.infer<typeof upsertAvailabilityInput>;
type CreateWeeklyAvailabilityInput = z.infer<
  typeof createWeeklyAvailabilityInput
>;
type DeleteAvailabilityInput = z.infer<typeof deleteAvailabilityInput>;
type GetMyPayoutsInput = z.infer<typeof getMyPayoutsInput>;

export type TutorHandler = ReturnType<typeof createTutorHandler>;

export function createTutorHandler(tutorService: TutorService) {
  return {
    getMyProfile: async ({ context }: { context: Context }) => {
      return withDomainMap(
        () => tutorService.getMyProfile(context.session!.user.id),
        mapTutorError,
      );
    },

    updateMyProfile: async ({
      context,
      input,
    }: {
      context: Context;
      input: UpdateMyProfileInput;
    }) => {
      return withDomainMap(
        () => tutorService.updateMyProfile(context.session!.user.id, input),
        mapTutorError,
      );
    },

    submitForReview: async ({ context }: { context: Context }) => {
      return withDomainMap(
        () => tutorService.submitForReview(context.session!.user.id),
        mapTutorError,
      );
    },

    listAvailability: async ({ context }: { context: Context }) => {
      return withDomainMap(
        () => tutorService.listAvailability(context.session!.user.id),
        mapTutorError,
      );
    },

    upsertAvailability: async ({
      context,
      input,
    }: {
      context: Context;
      input: UpsertAvailabilityInput;
    }) => {
      return withDomainMap(
        () => tutorService.upsertAvailability(context.session!.user.id, input),
        mapTutorError,
      );
    },

    createWeeklyAvailability: async ({
      context,
      input,
    }: {
      context: Context;
      input: CreateWeeklyAvailabilityInput;
    }) => {
      return withDomainMap(
        () =>
          tutorService.createWeeklyAvailability(
            context.session!.user.id,
            input,
          ),
        mapTutorError,
      );
    },

    deleteAvailability: async ({
      context,
      input,
    }: {
      context: Context;
      input: DeleteAvailabilityInput;
    }) => {
      return withDomainMap(async () => {
        await tutorService.deleteAvailability(
          context.session!.user.id,
          input.id,
        );
      }, mapTutorError);
    },

    getMyPayouts: async ({
      context,
      input,
    }: {
      context: Context;
      input: GetMyPayoutsInput;
    }) => {
      return withDomainMap(
        () => tutorService.getMyPayouts(context.session!.user.id, input ?? {}),
        mapTutorError,
      );
    },
  };
}
