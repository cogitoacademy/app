import type { Context } from "../../context";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { internalServerError } from "../../lib/errors";
import type { AdminTutorService } from "./admin-tutor.service";
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
      try {
        return adminTutorService.createInvite(context.session!.user.id, input);
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to create invite", err);
      }
    },

    listInvites: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: ListInvitesInput;
    }) => {
      try {
        return adminTutorService.listInvites(input);
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to list invites", err);
      }
    },

    resendInvite: async ({
      context,
      input,
    }: {
      context: Context;
      input: ResendInviteInput;
    }) => {
      try {
        return adminTutorService.resendInvite(
          context.session!.user.id,
          input.inviteId,
        );
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to resend invite", err);
      }
    },

    revokeInvite: async ({
      context,
      input,
    }: {
      context: Context;
      input: RevokeInviteInput;
    }) => {
      try {
        return adminTutorService.revokeInvite(
          context.session!.user.id,
          input.inviteId,
        );
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to revoke invite", err);
      }
    },

    listTutorProfiles: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: ListTutorProfilesInput;
    }) => {
      try {
        return adminTutorService.listTutorProfiles(input);
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to list tutor profiles", err);
      }
    },

    reviewTutorProfile: async ({
      context,
      input,
    }: {
      context: Context;
      input: ReviewTutorProfileInput;
    }) => {
      try {
        return adminTutorService.reviewTutorProfile(
          context.session!.user.id,
          input,
        );
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to review tutor profile", err);
      }
    },
  };
}
