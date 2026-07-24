import type { Context } from "../../context";
import { z } from "zod";
import { withDomainMap } from "../../lib/handler-utils";
import type { TutorService } from "./tutor.service";
import { updateMyProfileInput } from "./tutor.types";
import {
  upsertAvailabilityInput,
  deleteAvailabilityInput,
} from "./availability.types";
import { mapTutorError } from "./tutor.errors";

type UpdateMyProfileInput = z.infer<typeof updateMyProfileInput>;
type UpsertAvailabilityInput = z.infer<typeof upsertAvailabilityInput>;
type DeleteAvailabilityInput = z.infer<typeof deleteAvailabilityInput>;

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
  };
}
