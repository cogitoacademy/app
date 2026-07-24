import type { Context } from "../../context";
import { z } from "zod";
import { withDomainMap } from "../../lib/handler-utils";
import type { AdminTutorService } from "./admin-tutor.service";
import { mapAdminTutorError } from "./admin-tutor.errors";
import {
  createInviteInput,
  listInvitesInput,
  resendInviteInput,
  revokeInviteInput,
  listTutorProfilesInput,
  reviewTutorProfileInput,
} from "./admin-tutor.types";

type CreateInviteInput = z.infer<typeof createInviteInput>;
type ListInvitesInput = z.infer<typeof listInvitesInput>;
type ResendInviteInput = z.infer<typeof resendInviteInput>;
type RevokeInviteInput = z.infer<typeof revokeInviteInput>;
type ListTutorProfilesInput = z.infer<typeof listTutorProfilesInput>;
type ReviewTutorProfileInput = z.infer<typeof reviewTutorProfileInput>;

export type AdminTutorHandler = ReturnType<typeof createAdminTutorHandler>;

export function createAdminTutorHandler(adminTutorService: AdminTutorService) {
  return {
    createInvite: async ({
      context,
      input,
    }: {
      context: Context;
      input: CreateInviteInput;
    }) => {
      return withDomainMap(
        () => adminTutorService.createInvite(context.session!.user.id, input),
        mapAdminTutorError,
      );
    },

    listInvites: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: ListInvitesInput;
    }) => {
      return withDomainMap(
        () => adminTutorService.listInvites(input),
        mapAdminTutorError,
      );
    },

    resendInvite: async ({
      context,
      input,
    }: {
      context: Context;
      input: ResendInviteInput;
    }) => {
      return withDomainMap(
        () =>
          adminTutorService.resendInvite(
            context.session!.user.id,
            input.inviteId,
          ),
        mapAdminTutorError,
      );
    },

    revokeInvite: async ({
      context,
      input,
    }: {
      context: Context;
      input: RevokeInviteInput;
    }) => {
      return withDomainMap(
        () =>
          adminTutorService.revokeInvite(
            context.session!.user.id,
            input.inviteId,
          ),
        mapAdminTutorError,
      );
    },

    listTutorProfiles: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: ListTutorProfilesInput;
    }) => {
      return withDomainMap(
        () => adminTutorService.listTutorProfiles(input),
        mapAdminTutorError,
      );
    },

    reviewTutorProfile: async ({
      context,
      input,
    }: {
      context: Context;
      input: ReviewTutorProfileInput;
    }) => {
      return withDomainMap(
        () =>
          adminTutorService.reviewTutorProfile(context.session!.user.id, input),
        mapAdminTutorError,
      );
    },
  };
}
