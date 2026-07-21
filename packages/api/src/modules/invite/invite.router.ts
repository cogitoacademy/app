import { publicProcedure, protectedProcedure } from "../../procedures";
import { verifyInput, claimInput } from "./invite.types";
import { inviteHandlers } from "./invite.handlers";

export const inviteRouter = {
  verify: publicProcedure
    .route({
      method: "POST",
      path: "/invites/verify",
      tags: ["Invites"],
      summary: "Verify invite",
      description: "Validates a tutor invite token",
    })
    .input(verifyInput)
    .handler(inviteHandlers.verify),

  claim: protectedProcedure
    .route({
      method: "POST",
      path: "/invites/claim",
      tags: ["Invites"],
      summary: "Claim invite",
      description: "Claims a tutor invite and creates a tutor profile",
    })
    .input(claimInput)
    .handler(inviteHandlers.claim),
};
