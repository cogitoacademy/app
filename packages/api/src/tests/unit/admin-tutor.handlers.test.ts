import { describe, test, expect, mock } from "bun:test";
import { adminTutorHandlers } from "../../modules/admin-tutor/admin-tutor.handlers";

describe("adminTutorHandlers", () => {
  describe("createInvite", () => {
    test("calls adminTutor.createInvite with session user id and input", async () => {
      const createInvite = mock(async () => ({ id: "inv1" }));
      const context = {
        session: { user: { id: "admin1" } },
        services: { adminTutor: { createInvite } },
      };
      const input = { email: "tutor@example.com" };

      const result = await adminTutorHandlers.createInvite({ context, input });

      expect(createInvite).toHaveBeenCalledWith("admin1", input);
      expect(result).toEqual({ id: "inv1" });
    });
  });

  describe("listInvites", () => {
    test("calls adminTutor.listInvites with input", async () => {
      const listInvites = mock(async () => ({ items: [] }));
      const context = {
        session: { user: { id: "admin1" } },
        services: { adminTutor: { listInvites } },
      };
      const input = { status: "pending" };

      const result = await adminTutorHandlers.listInvites({ context, input });

      expect(listInvites).toHaveBeenCalledWith(input);
      expect(result).toEqual({ items: [] });
    });

    test("calls adminTutor.listInvites with empty object when input is undefined", async () => {
      const listInvites = mock(async () => ({ items: [] }));
      const context = {
        session: { user: { id: "admin1" } },
        services: { adminTutor: { listInvites } },
      };

      await adminTutorHandlers.listInvites({
        context,
        input: undefined as any,
      });

      expect(listInvites).toHaveBeenCalledWith({});
    });
  });

  describe("resendInvite", () => {
    test("calls adminTutor.resendInvite with session user id and input.inviteId", async () => {
      const resendInvite = mock(async () => ({ ok: true }));
      const context = {
        session: { user: { id: "admin1" } },
        services: { adminTutor: { resendInvite } },
      };
      const input = { inviteId: "inv1" };

      const result = await adminTutorHandlers.resendInvite({ context, input });

      expect(resendInvite).toHaveBeenCalledWith("admin1", "inv1");
      expect(result).toEqual({ ok: true });
    });
  });

  describe("revokeInvite", () => {
    test("calls adminTutor.revokeInvite with session user id and input.inviteId", async () => {
      const revokeInvite = mock(async () => ({ ok: true }));
      const context = {
        session: { user: { id: "admin1" } },
        services: { adminTutor: { revokeInvite } },
      };
      const input = { inviteId: "inv1" };

      const result = await adminTutorHandlers.revokeInvite({ context, input });

      expect(revokeInvite).toHaveBeenCalledWith("admin1", "inv1");
      expect(result).toEqual({ ok: true });
    });
  });

  describe("listTutorProfiles", () => {
    test("calls adminTutor.listTutorProfiles with input", async () => {
      const listTutorProfiles = mock(async () => ({ items: [] }));
      const context = {
        session: { user: { id: "admin1" } },
        services: { adminTutor: { listTutorProfiles } },
      };
      const input = { status: "pending" };

      const result = await adminTutorHandlers.listTutorProfiles({
        context,
        input,
      });

      expect(listTutorProfiles).toHaveBeenCalledWith(input);
      expect(result).toEqual({ items: [] });
    });

    test("calls adminTutor.listTutorProfiles with empty object when input is undefined", async () => {
      const listTutorProfiles = mock(async () => ({ items: [] }));
      const context = {
        session: { user: { id: "admin1" } },
        services: { adminTutor: { listTutorProfiles } },
      };

      await adminTutorHandlers.listTutorProfiles({
        context,
        input: undefined as any,
      });

      expect(listTutorProfiles).toHaveBeenCalledWith({});
    });
  });

  describe("reviewTutorProfile", () => {
    test("calls adminTutor.reviewTutorProfile with session user id and input", async () => {
      const reviewTutorProfile = mock(async () => ({ ok: true }));
      const context = {
        session: { user: { id: "admin1" } },
        services: { adminTutor: { reviewTutorProfile } },
      };
      const input = { profileId: "p1", action: "approve" };

      const result = await adminTutorHandlers.reviewTutorProfile({
        context,
        input,
      });

      expect(reviewTutorProfile).toHaveBeenCalledWith("admin1", input);
      expect(result).toEqual({ ok: true });
    });
  });
});
