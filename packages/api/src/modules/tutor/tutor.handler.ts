import type { Context } from "../../context";
import type { TutorService } from "./tutor.service";

export type TutorHandler = ReturnType<typeof createTutorHandler>;

export function createTutorHandler(tutorService: TutorService) {
  return {
    getMyProfile: async ({ context }: { context: Context }) => {
      return tutorService.getMyProfile(context.session!.user.id);
    },

    updateMyProfile: async ({
      context,
      input,
    }: {
      context: Context;
      input: any;
    }) => {
      return tutorService.updateMyProfile(context.session!.user.id, input);
    },

    submitForReview: async ({ context }: { context: Context }) => {
      return tutorService.submitForReview(context.session!.user.id);
    },

    listAvailability: async ({ context }: { context: Context }) => {
      return tutorService.listAvailability(context.session!.user.id);
    },

    upsertAvailability: async ({
      context,
      input,
    }: {
      context: Context;
      input: any;
    }) => {
      return tutorService.upsertAvailability(context.session!.user.id, input);
    },

    deleteAvailability: async ({
      context,
      input,
    }: {
      context: Context;
      input: any;
    }) => {
      return tutorService.deleteAvailability(
        context.session!.user.id,
        input.id,
      );
    },
  };
}
