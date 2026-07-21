import { describe, test, expect, mock } from "bun:test";
import { createAdminTutorHandler } from "../../modules/admin-tutor/admin-tutor.handler";

describe("adminTutorHandlers", () => {
  describe("createInvite", () => {
    test("calls adminTutor.createInvite with session user id and input", async () => {
      const createInvite = mock(async () => ({ id: "inv1" }));
      const adminTutorService = { createInvite } as any;
      const handler = createAdminTutorHandler(adminTutorService);
      const context = { session: { user: { id: "admin1" } } } as any;
      const input = { email: "tutor@example.com" };

      const result = await handler.createInvite({ context, input });

      expect(createInvite).toHaveBeenCalledWith("admin1", input);
      expect(result).toEqual({ id: "inv1" });
    });
  });

  describe("listInvites", () => {
    test("calls adminTutor.listInvites with input", async () => {
      const listInvites = mock(async () => ({ items: [] }));
      const adminTutorService = { listInvites } as any;
      const handler = createAdminTutorHandler(adminTutorService);
      const context = { session: { user: { id: "admin1" } } } as any;
      const input = { status: "pending" };

      const result = await handler.listInvites({ context, input });

      expect(listInvites).toHaveBeenCalledWith(input);
      expect(result).toEqual({ items: [] });
    });

    test("calls adminTutor.listInvites with empty object when input is undefined", async () => {
      const listInvites = mock(async () => ({ items: [] }));
      const adminTutorService = { listInvites } as any;
      const handler = createAdminTutorHandler(adminTutorService);
      const context = { session: { user: { id: "admin1" } } } as any;

      await handler.listInvites({
        context,
        input: undefined as any,
      });

      expect(listInvites).toHaveBeenCalledWith({});
    });
  });

  describe("resendInvite", () => {
    test("calls adminTutor.resendInvite with session user id and input.inviteId", async () => {
      const resendInvite = mock(async () => ({ ok: true }));
      const adminTutorService = { resendInvite } as any;
      const handler = createAdminTutorHandler(adminTutorService);
      const context = { session: { user: { id: "admin1" } } } as any;
      const input = { inviteId: "inv1" };

      const result = await handler.resendInvite({ context, input });

      expect(resendInvite).toHaveBeenCalledWith("admin1", "inv1");
      expect(result).toEqual({ ok: true });
    });
  });

  describe("revokeInvite", () => {
    test("calls adminTutor.revokeInvite with session user id and input.inviteId", async () => {
      const revokeInvite = mock(async () => ({ ok: true }));
      const adminTutorService = { revokeInvite } as any;
      const handler = createAdminTutorHandler(adminTutorService);
      const context = { session: { user: { id: "admin1" } } } as any;
      const input = { inviteId: "inv1" };

      const result = await handler.revokeInvite({ context, input });

      expect(revokeInvite).toHaveBeenCalledWith("admin1", "inv1");
      expect(result).toEqual({ ok: true });
    });
  });

  describe("listTutorProfiles", () => {
    test("calls adminTutor.listTutorProfiles with input", async () => {
      const listTutorProfiles = mock(async () => ({ items: [] }));
      const adminTutorService = { listTutorProfiles } as any;
      const handler = createAdminTutorHandler(adminTutorService);
      const context = { session: { user: { id: "admin1" } } } as any;
      const input = { status: "pending" };

      const result = await handler.listTutorProfiles({
        context,
        input,
      });

      expect(listTutorProfiles).toHaveBeenCalledWith(input);
      expect(result).toEqual({ items: [] });
    });

    test("calls adminTutor.listTutorProfiles with empty object when input is undefined", async () => {
      const listTutorProfiles = mock(async () => ({ items: [] }));
      const adminTutorService = { listTutorProfiles } as any;
      const handler = createAdminTutorHandler(adminTutorService);
      const context = { session: { user: { id: "admin1" } } } as any;

      await handler.listTutorProfiles({
        context,
        input: undefined as any,
      });

      expect(listTutorProfiles).toHaveBeenCalledWith({});
    });
  });

  describe("reviewTutorProfile", () => {
    test("calls adminTutor.reviewTutorProfile with session user id and input", async () => {
      const reviewTutorProfile = mock(async () => ({ ok: true }));
      const adminTutorService = { reviewTutorProfile } as any;
      const handler = createAdminTutorHandler(adminTutorService);
      const context = { session: { user: { id: "admin1" } } } as any;
      const input = { profileId: "p1", action: "approve" };

      const result = await handler.reviewTutorProfile({
        context,
        input,
      });

      expect(reviewTutorProfile).toHaveBeenCalledWith("admin1", input);
      expect(result).toEqual({ ok: true });
    });
  });
});
