import type { Context } from "../../context";
import type { z } from "zod";
import type { verifyInput, claimInput } from "./invite.types";

type VerifyInput = z.infer<typeof verifyInput>;
type ClaimInput = z.infer<typeof claimInput>;

export const inviteHandlers = {
  verify: async ({
    context,
    input,
  }: {
    context: Context;
    input: VerifyInput;
  }) => {
    return context.services.invite.verify(input.token);
  },

  claim: async ({
    context,
    input,
  }: {
    context: Context;
    input: ClaimInput;
  }) => {
    const user = context.session!.user;
    return context.services.invite.claim(user.id, user.email, input.token);
  },
};
