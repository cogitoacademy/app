import { describe, test, expect, mock, beforeEach } from "bun:test";
import {
  createBookingHandler,
  createTutorActionsHandler,
} from "../../modules/booking/booking.handler";
import { bookingIdempotency } from "../../lib/idempotency";

function makeBookingService() {
  return {
    createSolo: mock(async () => ({ id: "b1" })),
    getById: mock(async () => ({ id: "b1" })),
    listMine: mock(async () => ({ items: [] })),
    listForTutor: mock(async () => ({ items: [], nextCursor: null })),
    cancel: mock(async () => ({ id: "b1", currentState: "cancelled" })),
    proposeReschedule: mock(async () => ({
      id: "b1",
      currentState: "reschedule_proposed",
    })),
    createGroup: mock(async () => ({ id: "bg1" })),
    createSeries: mock(async () => ({ id: "bs1" })),
    confirmInvite: mock(async () => ({ id: "b1", currentState: "confirmed" })),
    declineInvite: mock(async () => ({ id: "b1", currentState: "declined" })),
    reconfirm: mock(async () => ({ reconfirmed: true })),
    withdraw: mock(async () => ({ id: "b1", currentState: "cancelled" })),
    listSessions: mock(async () => ({ items: [] })),
    tutorAccept: mock(async () => ({ id: "b1", currentState: "confirmed" })),
    tutorDecline: mock(async () => ({ id: "b1", currentState: "declined" })),
    completeSession: mock(async () => ({
      id: "b1",
      currentState: "completed",
    })),
  };
}

function makeHeaders(idempotencyKey?: string) {
  const headers = new Headers();
  if (idempotencyKey !== undefined) {
    headers.set("idempotency-key", idempotencyKey);
  }
  return headers;
}

function makeContext(userId = "u1") {
  return {
    session: { user: { id: userId } },
    services: {} as any,
    headers: makeHeaders(),
  } as any;
}

describe("bookingHandler", () => {
  beforeEach(() => {
    bookingIdempotency["store"].clear();
  });

  describe("createSolo", () => {
    test("calls booking.createSolo with session user id and transformed input", async () => {
      const booking = makeBookingService();
      const handler = createBookingHandler(booking as any);
      const context = makeContext("u1");
      const input = {
        tutorId: "t1",
        availabilitySlotId: "slot1",
        modality: "online",
        scheduledStartAt: new Date("2025-01-01T10:00:00Z"),
        scheduledEndAt: new Date("2025-01-01T11:00:00Z"),
        timezone: "Asia/Jakarta",
      };

      const result = await handler.createSolo({
        context: context as any,
        input: input as any,
      });

      expect(booking.createSolo).toHaveBeenCalledWith("u1", {
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
      const booking = makeBookingService();
      const handler = createBookingHandler(booking as any);
      const context = makeContext("u1");
      const input = { bookingId: "b1" };

      const result = await handler.get({
        context: context as any,
        input: input as any,
      });

      expect(booking.getById).toHaveBeenCalledWith("b1", "u1");
      expect(result).toEqual({ id: "b1" });
    });
  });

  describe("listMine", () => {
    test("calls booking.listMine with session user id and input", async () => {
      const booking = makeBookingService();
      const handler = createBookingHandler(booking as any);
      const context = makeContext("u1");
      const input = { status: "confirmed" };

      const result = await handler.listMine({
        context: context as any,
        input: input as any,
      });

      expect(booking.listMine).toHaveBeenCalledWith("u1", input);
      expect(result).toEqual({ items: [] });
    });
  });

  describe("cancel", () => {
    test("calls booking.cancel with session user id, bookingId, and cancellationReason", async () => {
      const booking = makeBookingService();
      const handler = createBookingHandler(booking as any);
      const context = makeContext("u1");
      const input = {
        bookingId: "b1",
        cancellationReason: "schedule conflict",
      };

      const result = await handler.cancel({
        context: context as any,
        input: input as any,
      });

      expect(booking.cancel).toHaveBeenCalledWith(
        "u1",
        "b1",
        "schedule conflict",
      );
      expect(result).toEqual({ id: "b1", currentState: "cancelled" });
    });
  });

  describe("proposeReschedule", () => {
    test("calls booking.proposeReschedule with session user id, bookingId, Date-converted times, and reason", async () => {
      const booking = makeBookingService();
      const handler = createBookingHandler(booking as any);
      const context = makeContext("u1");
      const input = {
        bookingId: "b1",
        proposedStartAt: new Date("2025-02-01T10:00:00Z"),
        proposedEndAt: new Date("2025-02-01T11:00:00Z"),
        reason: "time change",
      };

      const result = await handler.proposeReschedule({
        context: context as any,
        input: input as any,
      });

      expect(booking.proposeReschedule).toHaveBeenCalledWith(
        "u1",
        "b1",
        new Date("2025-02-01T10:00:00Z"),
        new Date("2025-02-01T11:00:00Z"),
        "time change",
      );
      expect(result).toEqual({
        id: "b1",
        currentState: "reschedule_proposed",
      });
    });
  });

  describe("createGroup", () => {
    test("calls booking.createGroup with session user id and transformed input", async () => {
      const booking = makeBookingService();
      const handler = createBookingHandler(booking as any);
      const context = makeContext("u1");
      const input = {
        tutorId: "t1",
        availabilitySlotId: "slot1",
        modality: "online",
        targetGroupSize: 5,
        inviteeUserIds: ["u2", "u3"],
        scheduledStartAt: new Date("2025-01-01T10:00:00Z"),
        scheduledEndAt: new Date("2025-01-01T11:00:00Z"),
        timezone: "Asia/Jakarta",
      };

      const result = await handler.createGroup({
        context: context as any,
        input: input as any,
      });

      expect(booking.createGroup).toHaveBeenCalledWith("u1", {
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
      const booking = makeBookingService();
      const handler = createBookingHandler(booking as any);
      const context = makeContext("u1");
      const input = {
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
      };

      const result = await handler.createSeries({
        context: context as any,
        input: input as any,
      });

      expect(booking.createSeries).toHaveBeenCalledWith("u1", {
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
      const booking = makeBookingService();
      const handler = createBookingHandler(booking as any);
      const context = makeContext("u1");
      const input = { bookingId: "b1" };

      const result = await handler.confirmInvite({
        context: context as any,
        input: input as any,
      });

      expect(booking.confirmInvite).toHaveBeenCalledWith("u1", "b1");
      expect(result).toEqual({ id: "b1", currentState: "confirmed" });
    });
  });

  describe("declineInvite", () => {
    test("calls booking.declineInvite with session user id, bookingId, and reason", async () => {
      const booking = makeBookingService();
      const handler = createBookingHandler(booking as any);
      const context = makeContext("u1");
      const input = { bookingId: "b1", reason: "busy" };

      const result = await handler.declineInvite({
        context: context as any,
        input: input as any,
      });

      expect(booking.declineInvite).toHaveBeenCalledWith("u1", "b1", "busy");
      expect(result).toEqual({ id: "b1", currentState: "declined" });
    });
  });

  describe("reconfirm", () => {
    test("calls booking.reconfirm with session user id, bookingId, and accept", async () => {
      const booking = makeBookingService();
      const handler = createBookingHandler(booking as any);
      const context = makeContext("u1");
      const input = { bookingId: "b1", accept: true };

      const result = await handler.reconfirm({
        context: context as any,
        input: input as any,
      });

      expect(booking.reconfirm).toHaveBeenCalledWith("u1", "b1", true);
      expect(result).toEqual({ reconfirmed: true });
    });
  });

  describe("withdraw", () => {
    test("calls booking.withdraw with session user id, bookingId, and reason", async () => {
      const booking = makeBookingService();
      const handler = createBookingHandler(booking as any);
      const context = makeContext("u1");
      const input = { bookingId: "b1", reason: "changed mind" };

      const result = await handler.withdraw({
        context: context as any,
        input: input as any,
      });

      expect(booking.withdraw).toHaveBeenCalledWith("u1", "b1", "changed mind");
      expect(result).toEqual({ id: "b1", currentState: "cancelled" });
    });
  });

  describe("listSessions", () => {
    test("calls booking.listSessions with input.bookingId", async () => {
      const booking = makeBookingService();
      const handler = createBookingHandler(booking as any);
      const context = makeContext("u1");
      const input = { bookingId: "b1" };

      const result = await handler.listSessions({
        context: context as any,
        input: input as any,
      });

      expect(booking.listSessions).toHaveBeenCalledWith("b1", "u1");
      expect(result).toEqual({ items: [] });
    });
  });
});

describe("tutorActionsHandler", () => {
  beforeEach(() => {
    bookingIdempotency["store"].clear();
  });

  describe("listBookings", () => {
    test("lists bookings assigned to the signed-in tutor", async () => {
      const booking = makeBookingService();
      const handler = createTutorActionsHandler(booking as any);
      const context = makeContext("t1");
      const input = { states: ["awaiting_tutor_review"], limit: 10 };

      const result = await handler.listBookings({
        context: context as any,
        input: input as any,
      });

      expect(booking.listForTutor).toHaveBeenCalledWith("t1", input);
      expect(result).toEqual({ items: [], nextCursor: null });
    });
  });

  describe("acceptBooking", () => {
    test("calls booking.tutorAccept with bookingId and session user id", async () => {
      const booking = makeBookingService();
      const handler = createTutorActionsHandler(booking as any);
      const context = makeContext("t1");
      const input = { bookingId: "b1" };

      const result = await handler.acceptBooking({
        context: context as any,
        input: input as any,
      });

      expect(booking.tutorAccept).toHaveBeenCalledWith("b1", "t1");
      expect(result).toEqual({ id: "b1", currentState: "confirmed" });
    });
  });

  describe("declineBooking", () => {
    test("calls booking.tutorDecline with bookingId, session user id, and reason", async () => {
      const booking = makeBookingService();
      const handler = createTutorActionsHandler(booking as any);
      const context = makeContext("t1");
      const input = { bookingId: "b1", reason: "unavailable" };

      const result = await handler.declineBooking({
        context: context as any,
        input: input as any,
      });

      expect(booking.tutorDecline).toHaveBeenCalledWith(
        "b1",
        "t1",
        "unavailable",
      );
      expect(result).toEqual({ id: "b1", currentState: "declined" });
    });
  });

  describe("completeSession", () => {
    test("calls booking.completeSession with bookingId and session user id", async () => {
      const booking = makeBookingService();
      const handler = createTutorActionsHandler(booking as any);
      const context = makeContext("t1");
      const input = { bookingId: "b1", sessionNote: "Great session" };

      const result = await handler.completeSession({
        context: context as any,
        input: input as any,
      });

      expect(booking.completeSession).toHaveBeenCalledWith("b1", "t1");
      expect(result).toEqual({ id: "b1", currentState: "completed" });
    });
  });
});
