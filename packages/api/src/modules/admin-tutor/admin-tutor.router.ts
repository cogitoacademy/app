import { adminProcedure } from "../../procedures";
import {
  createInviteInput,
  listInvitesInput,
  resendInviteInput,
  revokeInviteInput,
  listTutorProfilesInput,
  reviewTutorProfileInput,
} from "./admin-tutor.types";

export const adminTutorRouter = {
  createInvite: adminProcedure
    .route({
      method: "POST",
      path: "/admin/tutors/invites/create",
      tags: ["Admin Tutors"],
      summary: "Create tutor invite",
      description: "Creates a tutor invite by email",
    })
    .input(createInviteInput)
    .handler(async ({ context, input }) => {
      return context.services.adminTutor.createInvite(
        context.session.user.id,
        input,
      );
    }),

  listInvites: adminProcedure
    .route({
      method: "POST",
      path: "/admin/tutors/invites/list",
      tags: ["Admin Tutors"],
      summary: "List tutor invites",
      description: "Returns tutor invites, optionally filtered by status",
    })
    .input(listInvitesInput)
    .handler(async ({ context, input }) => {
      return context.services.adminTutor.listInvites(input ?? {});
    }),

  resendInvite: adminProcedure
    .route({
      method: "POST",
      path: "/admin/tutors/invites/resend",
      tags: ["Admin Tutors"],
      summary: "Resend tutor invite",
      description: "Regenerates an invite token and expiry",
    })
    .input(resendInviteInput)
    .handler(async ({ context, input }) => {
      return context.services.adminTutor.resendInvite(
        context.session.user.id,
        input.inviteId,
      );
    }),

  revokeInvite: adminProcedure
    .route({
      method: "POST",
      path: "/admin/tutors/invites/revoke",
      tags: ["Admin Tutors"],
      summary: "Revoke tutor invite",
      description: "Revokes a pending tutor invite",
    })
    .input(revokeInviteInput)
    .handler(async ({ context, input }) => {
      return context.services.adminTutor.revokeInvite(
        context.session.user.id,
        input.inviteId,
      );
    }),

  listTutorProfiles: adminProcedure
    .route({
      method: "POST",
      path: "/admin/tutors/profiles/list",
      tags: ["Admin Tutors"],
      summary: "List tutor profiles",
      description:
        "Returns tutor profiles, optionally filtered by onboarding status",
    })
    .input(listTutorProfilesInput)
    .handler(async ({ context, input }) => {
      return context.services.adminTutor.listTutorProfiles(input ?? {});
    }),

  reviewTutorProfile: adminProcedure
    .route({
      method: "POST",
      path: "/admin/tutors/profiles/review",
      tags: ["Admin Tutors"],
      summary: "Review tutor profile",
      description: "Reviews or changes a tutor profile status",
    })
    .input(reviewTutorProfileInput)
    .handler(async ({ context, input }) => {
      return context.services.adminTutor.reviewTutorProfile(
        context.session.user.id,
        input,
      );
    }),
};
