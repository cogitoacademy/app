import type { Context } from "../../context";
import type { AdminTutorService } from "./admin-tutor.service";

export type AdminTutorHandler = ReturnType<typeof createAdminTutorHandler>;

export function createAdminTutorHandler(adminTutorService: AdminTutorService) {
  return {
    createInvite: async ({
      context,
      input,
    }: {
      context: Context;
      input: any;
    }) => {
      return adminTutorService.createInvite(context.session!.user.id, input);
    },

    listInvites: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: any;
    }) => {
      return adminTutorService.listInvites(input ?? {});
    },

    resendInvite: async ({
      context,
      input,
    }: {
      context: Context;
      input: any;
    }) => {
      return adminTutorService.resendInvite(
        context.session!.user.id,
        input.inviteId,
      );
    },

    revokeInvite: async ({
      context,
      input,
    }: {
      context: Context;
      input: any;
    }) => {
      return adminTutorService.revokeInvite(
        context.session!.user.id,
        input.inviteId,
      );
    },

    listTutorProfiles: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: any;
    }) => {
      return adminTutorService.listTutorProfiles(input ?? {});
    },

    reviewTutorProfile: async ({
      context,
      input,
    }: {
      context: Context;
      input: any;
    }) => {
      return adminTutorService.reviewTutorProfile(
        context.session!.user.id,
        input,
      );
    },
  };
}
