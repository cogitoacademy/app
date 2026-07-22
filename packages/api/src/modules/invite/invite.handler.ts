import type { Context } from "../../context";
import { withDomainMap } from "../../lib/handler-utils";
import { z } from "zod";
import type { verifyInput, claimInput } from "./invite.types";
import type { InviteService } from "./invite.service";
import { mapInviteError } from "./invite.errors";

type VerifyInput = z.infer<typeof verifyInput>;
type ClaimInput = z.infer<typeof claimInput>;

export function createInviteHandler(deps: { inviteService: InviteService }) {
  const { inviteService } = deps;

  async function verify({ input }: { context: Context; input: VerifyInput }) {
    return withDomainMap(
      () => inviteService.verify(input.token),
      mapInviteError,
    );
  }

  async function claim({
    context,
    input,
  }: {
    context: Context;
    input: ClaimInput;
  }) {
    const user = context.session!.user;
    return withDomainMap(
      () => inviteService.claim(user.id, user.email, input.token),
      mapInviteError,
    );
  }

  return { verify, claim };
}

export type InviteHandler = ReturnType<typeof createInviteHandler>;
