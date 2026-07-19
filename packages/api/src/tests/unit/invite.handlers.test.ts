import { describe, test, expect, mock } from "bun:test";
import { inviteHandlers } from "../../modules/invite/invite.handlers";

describe("inviteHandlers", () => {
  describe("verify", () => {
    test("calls invite.verify with input.token", async () => {
      const verify = mock(async () => ({ valid: true, tutorId: "t1" }));
      const context = {
        services: { invite: { verify } },
      };
      const input = { token: "tok123" };

      const result = await inviteHandlers.verify({ context, input });

      expect(verify).toHaveBeenCalledWith("tok123");
      expect(result).toEqual({ valid: true, tutorId: "t1" });
    });
  });

  describe("claim", () => {
    test("calls invite.claim with user.id and user.email", async () => {
      const claim = mock(async () => ({ id: "t1" }));
      const context = {
        session: { user: { id: "u1", email: "u1@test.com" } },
        services: { invite: { claim } },
      };
      const input = { token: "tok123" };

      const result = await inviteHandlers.claim({ context, input });

      expect(claim).toHaveBeenCalledWith("u1", "u1@test.com", "tok123");
      expect(result).toEqual({ id: "t1" });
    });

    test("passes user email to invite.claim", async () => {
      const claim = mock(async () => ({ id: "t2" }));
      const context = {
        session: { user: { id: "u2", email: "u2@example.com" } },
        services: { invite: { claim } },
      };
      const input = { token: "abc" };

      const result = await inviteHandlers.claim({ context, input });

      expect(claim).toHaveBeenCalledWith("u2", "u2@example.com", "abc");
      expect(result).toEqual({ id: "t2" });
    });
  });
});
