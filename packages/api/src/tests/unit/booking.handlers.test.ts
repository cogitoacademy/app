import { describe, test, expect, mock } from "bun:test";
import {
  bookingHandlers,
  tutorActionsHandlers,
} from "../../modules/booking/booking.handlers";

describe("bookingHandlers", () => {
  describe("createSolo", () => {
    test("calls booking.createSolo with session user id and transformed input", async () => {
      const createSolo = mock(async () => ({ id: "b1" }));
      const context = {
        session: { user: { id: "u1" } },
        services: { booking: { createSolo } },
      };
      const input = {
        tutorId: "t1",
        availabilitySlotId: "slot1",
        modality: "online",
        scheduledStartAt: "2025-01-01T10:00:00Z",
        scheduledEndAt: "2025-01-01T11:00:00Z",
        timezone: "Asia/Jakarta",
      };

      const result = await bookingHandlers.createSolo({ context, input });

      expect(createSolo).toHaveBeenCalledWith("u1", {
        tutorId: "t1",
        availabilitySlotId: "slot1",
        modality: "online",
        scheduledStartAt: new Date("2025-01-01T10:00:00Z"),
        scheduledEndAt: new Date("2025-01-01T11:00:00Z"),
        timezone: "Asia/Jakarta",
      });
      expect(result).toEqual({ id: "b1" });
    });
  });

  describe("get", () => {
    test("calls booking.getById with input.bookingId", async () => {
      const getById = mock(async () => ({ id: "b1" }));
      const context = {
        session: { user: { id: "u1" } },
        services: { booking: { getById } },
      };
      const input = { bookingId: "b1" };

      const result = await bookingHandlers.get({ context, input });

      expect(getById).toHaveBeenCalledWith("b1");
      expect(result).toEqual({ id: "b1" });
    });
  });

  describe("listMine", () => {
    test("calls booking.listMine with session user id and input", async () => {
      const listMine = mock(async () => ({ items: [] }));
      const context = {
        session: { user: { id: "u1" } },
        services: { booking: { listMine } },
      };
      const input = { status: "confirmed" };

      const result = await bookingHandlers.listMine({ context, input });

      expect(listMine).toHaveBeenCalledWith("u1", input);
      expect(result).toEqual({ items: [] });
    });
  });

  describe("cancel", () => {
    test("calls booking.cancel with session user id, bookingId, and cancellationReason", async () => {
      const cancel = mock(async () => ({ ok: true }));
      const context = {
        session: { user: { id: "u1" } },
        services: { booking: { cancel } },
      };
      const input = {
        bookingId: "b1",
        cancellationReason: "schedule conflict",
      };

      const result = await bookingHandlers.cancel({ context, input });

      expect(cancel).toHaveBeenCalledWith("u1", "b1", "schedule conflict");
      expect(result).toEqual({ ok: true });
    });
  });

  describe("proposeReschedule", () => {
    test("calls booking.proposeReschedule with session user id, bookingId, Date-converted times, and reason", async () => {
      const proposeReschedule = mock(async () => ({ ok: true }));
      const context = {
        session: { user: { id: "u1" } },
        services: { booking: { proposeReschedule } },
      };
      const input = {
        bookingId: "b1",
        proposedStartAt: "2025-02-01T10:00:00Z",
        proposedEndAt: "2025-02-01T11:00:00Z",
        reason: "time change",
      };

      const result = await bookingHandlers.proposeReschedule({
        context,
        input,
      });

      expect(proposeReschedule).toHaveBeenCalledWith(
        "u1",
        "b1",
        new Date("2025-02-01T10:00:00Z"),
        new Date("2025-02-01T11:00:00Z"),
        "time change",
      );
      expect(result).toEqual({ ok: true });
    });
  });

  describe("createGroup", () => {
    test("calls booking.createGroup with session user id and transformed input", async () => {
      const createGroup = mock(async () => ({ id: "bg1" }));
      const context = {
        session: { user: { id: "u1" } },
        services: { booking: { createGroup } },
      };
      const input = {
        tutorId: "t1",
        availabilitySlotId: "slot1",
        modality: "online",
        targetGroupSize: 5,
        inviteeUserIds: ["u2", "u3"],
        scheduledStartAt: "2025-01-01T10:00:00Z",
        scheduledEndAt: "2025-01-01T11:00:00Z",
        timezone: "Asia/Jakarta",
      };

      const result = await bookingHandlers.createGroup({ context, input });

      expect(createGroup).toHaveBeenCalledWith("u1", {
        tutorId: "t1",
        availabilitySlotId: "slot1",
        modality: "online",
        targetGroupSize: 5,
        inviteeUserIds: ["u2", "u3"],
        scheduledStartAt: new Date("2025-01-01T10:00:00Z"),
        scheduledEndAt: new Date("2025-01-01T11:00:00Z"),
        timezone: "Asia/Jakarta",
      });
      expect(result).toEqual({ id: "bg1" });
    });
  });

  describe("createSeries", () => {
    test("calls booking.createSeries with session user id and transformed input including session Date conversions", async () => {
      const createSeries = mock(async () => ({ id: "bs1" }));
      const context = {
        session: { user: { id: "u1" } },
        services: { booking: { createSeries } },
      };
      const input = {
        tutorId: "t1",
        availabilitySlotId: "slot1",
        modality: "online",
        sessions: [
          {
            scheduledStartAt: "2025-01-01T10:00:00Z",
            scheduledEndAt: "2025-01-01T11:00:00Z",
          },
          {
            scheduledStartAt: "2025-01-08T10:00:00Z",
            scheduledEndAt: "2025-01-08T11:00:00Z",
          },
        ],
        timezone: "Asia/Jakarta",
      };

      const result = await bookingHandlers.createSeries({ context, input });

      expect(createSeries).toHaveBeenCalledWith("u1", {
        tutorId: "t1",
        availabilitySlotId: "slot1",
        modality: "online",
        sessions: [
          {
            scheduledStartAt: new Date("2025-01-01T10:00:00Z"),
            scheduledEndAt: new Date("2025-01-01T11:00:00Z"),
          },
          {
            scheduledStartAt: new Date("2025-01-08T10:00:00Z"),
            scheduledEndAt: new Date("2025-01-08T11:00:00Z"),
          },
        ],
        timezone: "Asia/Jakarta",
      });
      expect(result).toEqual({ id: "bs1" });
    });
  });

  describe("confirmInvite", () => {
    test("calls booking.confirmInvite with session user id and bookingId", async () => {
      const confirmInvite = mock(async () => ({ ok: true }));
      const context = {
        session: { user: { id: "u1" } },
        services: { booking: { confirmInvite } },
      };
      const input = { bookingId: "b1" };

      const result = await bookingHandlers.confirmInvite({ context, input });

      expect(confirmInvite).toHaveBeenCalledWith("u1", "b1");
      expect(result).toEqual({ ok: true });
    });
  });

  describe("declineInvite", () => {
    test("calls booking.declineInvite with session user id, bookingId, and reason", async () => {
      const declineInvite = mock(async () => ({ ok: true }));
      const context = {
        session: { user: { id: "u1" } },
        services: { booking: { declineInvite } },
      };
      const input = { bookingId: "b1", reason: "busy" };

      const result = await bookingHandlers.declineInvite({ context, input });

      expect(declineInvite).toHaveBeenCalledWith("u1", "b1", "busy");
      expect(result).toEqual({ ok: true });
    });
  });

  describe("reconfirm", () => {
    test("calls booking.reconfirm with session user id, bookingId, and accept", async () => {
      const reconfirm = mock(async () => ({ ok: true }));
      const context = {
        session: { user: { id: "u1" } },
        services: { booking: { reconfirm } },
      };
      const input = { bookingId: "b1", accept: true };

      const result = await bookingHandlers.reconfirm({ context, input });

      expect(reconfirm).toHaveBeenCalledWith("u1", "b1", true);
      expect(result).toEqual({ ok: true });
    });
  });

  describe("withdraw", () => {
    test("calls booking.withdraw with session user id, bookingId, and reason", async () => {
      const withdraw = mock(async () => ({ ok: true }));
      const context = {
        session: { user: { id: "u1" } },
        services: { booking: { withdraw } },
      };
      const input = { bookingId: "b1", reason: "changed mind" };

      const result = await bookingHandlers.withdraw({ context, input });

      expect(withdraw).toHaveBeenCalledWith("u1", "b1", "changed mind");
      expect(result).toEqual({ ok: true });
    });
  });

  describe("listSessions", () => {
    test("calls booking.listSessions with input.bookingId", async () => {
      const listSessions = mock(async () => ({ items: [] }));
      const context = {
        session: { user: { id: "u1" } },
        services: { booking: { listSessions } },
      };
      const input = { bookingId: "b1" };

      const result = await bookingHandlers.listSessions({ context, input });

      expect(listSessions).toHaveBeenCalledWith("b1");
      expect(result).toEqual({ items: [] });
    });
  });
});

describe("tutorActionsHandlers", () => {
  describe("acceptBooking", () => {
    test("calls booking.tutorAccept with bookingId and session user id", async () => {
      const tutorAccept = mock(async () => ({ ok: true }));
      const context = {
        session: { user: { id: "t1" } },
        services: { booking: { tutorAccept } },
      };
      const input = { bookingId: "b1" };

      const result = await tutorActionsHandlers.acceptBooking({
        context,
        input,
      });

      expect(tutorAccept).toHaveBeenCalledWith("b1", "t1");
      expect(result).toEqual({ ok: true });
    });
  });

  describe("declineBooking", () => {
    test("calls booking.tutorDecline with bookingId, session user id, and reason", async () => {
      const tutorDecline = mock(async () => ({ ok: true }));
      const context = {
        session: { user: { id: "t1" } },
        services: { booking: { tutorDecline } },
      };
      const input = { bookingId: "b1", reason: "unavailable" };

      const result = await tutorActionsHandlers.declineBooking({
        context,
        input,
      });

      expect(tutorDecline).toHaveBeenCalledWith("b1", "t1", "unavailable");
      expect(result).toEqual({ ok: true });
    });
  });

  describe("completeSession", () => {
    test("calls booking.completeSession with bookingId, session user id, and sessionNote", async () => {
      const completeSession = mock(async () => ({ ok: true }));
      const context = {
        session: { user: { id: "t1" } },
        services: { booking: { completeSession } },
      };
      const input = { bookingId: "b1", sessionNote: "Great session" };

      const result = await tutorActionsHandlers.completeSession({
        context,
        input,
      });

      expect(completeSession).toHaveBeenCalledWith("b1", "t1", "Great session");
      expect(result).toEqual({ ok: true });
    });
  });
});
