import { adminProcedure } from "../../procedures";
import {
  createInviteInput,
  listInvitesInput,
  resendInviteInput,
  revokeInviteInput,
  listTutorProfilesInput,
  reviewTutorProfileInput,
} from "./admin-tutor.types";
import { adminTutorHandlers } from "./admin-tutor.handlers";

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
    .handler(adminTutorHandlers.createInvite),

  listInvites: adminProcedure
    .route({
      method: "POST",
      path: "/admin/tutors/invites/list",
      tags: ["Admin Tutors"],
      summary: "List tutor invites",
      description: "Returns tutor invites, optionally filtered by status",
    })
    .input(listInvitesInput)
    .handler(adminTutorHandlers.listInvites),

  resendInvite: adminProcedure
    .route({
      method: "POST",
      path: "/admin/tutors/invites/resend",
      tags: ["Admin Tutors"],
      summary: "Resend tutor invite",
      description: "Regenerates an invite token and expiry",
    })
    .input(resendInviteInput)
    .handler(adminTutorHandlers.resendInvite),

  revokeInvite: adminProcedure
    .route({
      method: "POST",
      path: "/admin/tutors/invites/revoke",
      tags: ["Admin Tutors"],
      summary: "Revoke tutor invite",
      description: "Revokes a pending tutor invite",
    })
    .input(revokeInviteInput)
    .handler(adminTutorHandlers.revokeInvite),

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
    .handler(adminTutorHandlers.listTutorProfiles),

  reviewTutorProfile: adminProcedure
    .route({
      method: "POST",
      path: "/admin/tutors/profiles/review",
      tags: ["Admin Tutors"],
      summary: "Review tutor profile",
      description: "Reviews or changes a tutor profile status",
    })
    .input(reviewTutorProfileInput)
    .handler(adminTutorHandlers.reviewTutorProfile),
};
