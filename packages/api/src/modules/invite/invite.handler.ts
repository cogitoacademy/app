import type { InviteService } from "./invite.service";

export function createInviteHandler(deps: { inviteService: InviteService }) {
  const { inviteService } = deps;

  async function verify(token: string) {
    return inviteService.verify(token);
  }

  async function claim(userId: string, userEmail: string, token: string) {
    return inviteService.claim(userId, userEmail, token);
  }

  return { verify, claim };
}

export type InviteHandler = ReturnType<typeof createInviteHandler>;
