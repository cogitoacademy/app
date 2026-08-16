import { adminProcedure } from "../../procedures";
import {
  createInviteInput,
  listInvitesInput,
  resendInviteInput,
  revokeInviteInput,
  listTutorProfilesInput,
  reviewTutorProfileInput,
  inspectInviteeInput,
} from "./admin-tutor.types";
import type { AdminTutorHandler } from "./admin-tutor.handler";

export function createAdminTutorRouter(handler: AdminTutorHandler) {
  return {
    inspectInvitee: adminProcedure
      .route({
        method: "POST",
        path: "/admin/tutors/invites/inspect-invitee",
        tags: ["Admin Tutors"],
        summary: "Inspect tutor invitee account",
        description:
          "Checks whether an email is registered and returns its authentication providers",
      })
      .input(inspectInviteeInput)
      .handler(handler.inspectInvitee),

    createInvite: adminProcedure
      .route({
        method: "POST",
        path: "/admin/tutors/invites/create",
        tags: ["Admin Tutors"],
        summary: "Create tutor invite",
        description: "Creates a tutor invite by email",
      })
      .input(createInviteInput)
      .handler(handler.createInvite),

    listInvites: adminProcedure
      .route({
        method: "POST",
        path: "/admin/tutors/invites/list",
        tags: ["Admin Tutors"],
        summary: "List tutor invites",
        description: "Returns tutor invites, optionally filtered by status",
      })
      .input(listInvitesInput)
      .handler(handler.listInvites),

    resendInvite: adminProcedure
      .route({
        method: "POST",
        path: "/admin/tutors/invites/resend",
        tags: ["Admin Tutors"],
        summary: "Resend tutor invite",
        description: "Regenerates an invite token and expiry",
      })
      .input(resendInviteInput)
      .handler(handler.resendInvite),

    sendInviteAgain: adminProcedure
      .route({
        method: "POST",
        path: "/admin/tutors/invites/send-again",
        tags: ["Admin Tutors"],
        summary: "Send tutor invite again",
        description:
          "Regenerates the invite token and explicitly sends the new link by email",
      })
      .input(resendInviteInput)
      .handler(handler.sendInviteAgain),

    revokeInvite: adminProcedure
      .route({
        method: "POST",
        path: "/admin/tutors/invites/revoke",
        tags: ["Admin Tutors"],
        summary: "Revoke tutor invite",
        description: "Revokes a pending tutor invite",
      })
      .input(revokeInviteInput)
      .handler(handler.revokeInvite),

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
      .handler(handler.listTutorProfiles),

    reviewTutorProfile: adminProcedure
      .route({
        method: "POST",
        path: "/admin/tutors/profiles/review",
        tags: ["Admin Tutors"],
        summary: "Review tutor profile",
        description: "Reviews or changes a tutor profile status",
      })
      .input(reviewTutorProfileInput)
      .handler(handler.reviewTutorProfile),
  };
}
