import type { Context } from "../../context";
import type { z } from "zod";
import type { verifyInput, claimInput } from "./invite.types";
import type { InviteService } from "./invite.service";

type VerifyInput = z.infer<typeof verifyInput>;
type ClaimInput = z.infer<typeof claimInput>;

export function createInviteHandler(deps: { inviteService: InviteService }) {
  const { inviteService } = deps;

  async function verify({ input }: { context: Context; input: VerifyInput }) {
    return inviteService.verify(input.token);
  }

  async function claim({
    context,
    input,
  }: {
    context: Context;
    input: ClaimInput;
  }) {
    const user = context.session!.user;
    return inviteService.claim(user.id, user.email, input.token);
  }

  return { verify, claim };
}

export type InviteHandler = ReturnType<typeof createInviteHandler>;
