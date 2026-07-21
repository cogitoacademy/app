import type { Context } from "../../context";

export const adminTutorHandlers = {
  createInvite: async ({
    context,
    input,
  }: {
    context: Context;
    input: any;
  }) => {
    return context.services.adminTutor.createInvite(
      context.session!.user.id,
      input,
    );
  },

  listInvites: async ({ context, input }: { context: Context; input: any }) => {
    return context.services.adminTutor.listInvites(input ?? {});
  },

  resendInvite: async ({
    context,
    input,
  }: {
    context: Context;
    input: any;
  }) => {
    return context.services.adminTutor.resendInvite(
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
    return context.services.adminTutor.revokeInvite(
      context.session!.user.id,
      input.inviteId,
    );
  },

  listTutorProfiles: async ({
    context,
    input,
  }: {
    context: Context;
    input: any;
  }) => {
    return context.services.adminTutor.listTutorProfiles(input ?? {});
  },

  reviewTutorProfile: async ({
    context,
    input,
  }: {
    context: Context;
    input: any;
  }) => {
    return context.services.adminTutor.reviewTutorProfile(
      context.session!.user.id,
      input,
    );
  },
};
