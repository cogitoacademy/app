import { publicProcedure, protectedProcedure } from "../../procedures";
import { verifyInput, claimInput } from "./invite.types";
import type { InviteHandler } from "./invite.handler";

export function createInviteRouter(handler: InviteHandler) {
  return {
    verify: publicProcedure
      .route({
        method: "POST",
        path: "/invites/verify",
        tags: ["Invites"],
        summary: "Verify invite",
        description: "Validates a tutor invite token",
      })
      .input(verifyInput)
      .handler(handler.verify),

    claim: protectedProcedure
      .route({
        method: "POST",
        path: "/invites/claim",
        tags: ["Invites"],
        summary: "Claim invite",
        description: "Claims a tutor invite and creates a tutor profile",
      })
      .input(claimInput)
      .handler(handler.claim),
  };
}
