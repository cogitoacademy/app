import { describe, test, expect, mock } from "bun:test";
import { createInviteHandler } from "../../modules/invite/invite.handler";

describe("inviteHandler", () => {
  const verify = mock(async () => ({ valid: true, tutorId: "t1" }));
  const claim = mock(async () => ({ id: "t1" }));
  const handler = createInviteHandler({
    inviteService: { verify, claim } as any,
  });

  describe("verify", () => {
    test("calls inviteService.verify with input.token", async () => {
      const context = { session: { user: { id: "u1" } } } as any;
      const input = { token: "tok123" };

      const result = await handler.verify({ context, input });

      expect(verify).toHaveBeenCalledWith("tok123");
      expect(result).toEqual({ valid: true, tutorId: "t1" });
    });
  });

  describe("claim", () => {
    test("calls inviteService.claim with user.id, user.email and input.token", async () => {
      const context = {
        session: { user: { id: "u1", email: "u1@test.com" } },
      } as any;
      const input = { token: "tok123" };

      const result = await handler.claim({ context, input });

      expect(claim).toHaveBeenCalledWith("u1", "u1@test.com", "tok123");
      expect(result).toEqual({ id: "t1" });
    });

    test("passes user email to inviteService.claim", async () => {
      const context = {
        session: { user: { id: "u2", email: "u2@example.com" } },
      } as any;
      const input = { token: "abc" };

      const result = await handler.claim({ context, input });

      expect(claim).toHaveBeenCalledWith("u2", "u2@example.com", "abc");
      expect(result).toEqual({ id: "t1" });
    });
  });
});
