import type { Context } from "../../context";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { internalServerError } from "../../lib/errors";
import type { verifyInput, claimInput } from "./invite.types";
import type { InviteService } from "./invite.service";

type VerifyInput = z.infer<typeof verifyInput>;
type ClaimInput = z.infer<typeof claimInput>;

export function createInviteHandler(deps: { inviteService: InviteService }) {
  const { inviteService } = deps;

  async function verify({ input }: { context: Context; input: VerifyInput }) {
    try {
      return inviteService.verify(input.token);
    } catch (err) {
      if (err instanceof ORPCError) throw err;
      throw internalServerError("Failed to verify invite", err);
    }
  }

  async function claim({
    context,
    input,
  }: {
    context: Context;
    input: ClaimInput;
  }) {
    try {
      const user = context.session!.user;
      return inviteService.claim(user.id, user.email, input.token);
    } catch (err) {
      if (err instanceof ORPCError) throw err;
      throw internalServerError("Failed to claim invite", err);
    }
  }

  return { verify, claim };
}

export type InviteHandler = ReturnType<typeof createInviteHandler>;
