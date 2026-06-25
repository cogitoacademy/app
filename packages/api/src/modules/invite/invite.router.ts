import { publicProcedure, protectedProcedure } from "../../procedures";
import { verifyInput, claimInput } from "./invite.types";

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
    .handler(async ({ context, input }) => {
      return context.services.invite.verify(input.token);
    }),

  claim: protectedProcedure
    .route({
      method: "POST",
      path: "/invites/claim",
      tags: ["Invites"],
      summary: "Claim invite",
      description: "Claims a tutor invite and creates a tutor profile",
    })
    .input(claimInput)
    .handler(async ({ context, input }) => {
      const user = context.session.user;
      return context.services.invite.claim(user.id, user.email, input.token);
    }),
};
