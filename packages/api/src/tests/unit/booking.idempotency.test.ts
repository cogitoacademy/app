import { describe, test, expect, mock, beforeEach } from "bun:test";
import { createBookingHandler } from "../../modules/booking/booking.handler";
import { bookingIdempotency } from "../../lib/idempotency";

function makeBookingService() {
  return {
    createSolo: mock(async () => ({ id: "b1" })),
    getById: mock(async () => ({ id: "b1" })),
    listMine: mock(async () => ({ items: [] })),
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

function makeContext(userId = "u1", headers?: Headers) {
  return {
    session: { user: { id: userId } },
    services: {} as any,
    headers: headers ?? makeHeaders(),
  } as any;
}

const soloInput = {
  tutorId: "t1",
  availabilitySlotId: "slot1",
  modality: "online" as const,
  scheduledStartAt: new Date("2025-01-01T10:00:00Z"),
  scheduledEndAt: new Date("2025-01-01T11:00:00Z"),
  timezone: "Asia/Jakarta",
};

const groupInput = {
  tutorId: "t1",
  availabilitySlotId: "slot1",
  modality: "online" as const,
  targetGroupSize: 5,
  inviteeUserIds: ["u2", "u3"],
  scheduledStartAt: new Date("2025-01-01T10:00:00Z"),
  scheduledEndAt: new Date("2025-01-01T11:00:00Z"),
  timezone: "Asia/Jakarta",
};

const seriesInput = {
  tutorId: "t1",
  availabilitySlotId: "slot1",
  modality: "online" as const,
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

describe("booking idempotency", () => {
  beforeEach(() => {
    bookingIdempotency.disconnectRedis();
    bookingIdempotency.clear();
  });

  describe("createSolo", () => {
    test("same Idempotency-Key returns same booking — service called once", async () => {
      const booking = makeBookingService();
      const handler = createBookingHandler(booking as any);
      const headers = makeHeaders("key-1");
      const ctx = makeContext("u1", headers);

      const result1 = await handler.createSolo({
        context: ctx,
        input: soloInput as any,
      });
      const result2 = await handler.createSolo({
        context: ctx,
        input: soloInput as any,
      });

      expect(booking.createSolo).toHaveBeenCalledTimes(1);
      expect(result1).toEqual(result2);
    });

    test("no header — each attempt gets a fresh booking (no stale natural-key dedup, L2)", async () => {
      // The frontend previously sent no idempotency-key header, so the cache
      // key collapsed to `booking:{user}:{tutor}:{start}:`. After a cancel +
      // re-book of the identical tutor+slot within the 24h TTL, the stale
      // cached id was returned instead of a fresh booking. The server must
      // not reuse a natural key across distinct attempts: when no header is
      // present, generate a fresh per-attempt nonce so a re-book is a new
      // request (double-submit protection requires a client nonce header).
      const booking = makeBookingService();
      // Simulate a fresh booking row id per creation (as the service would).
      let n = 0;
      booking.createSolo.mockImplementation(async () => ({ id: `b${++n}` }));
      const handler = createBookingHandler(booking as any);
      const ctx1 = makeContext("u1", makeHeaders());
      const ctx2 = makeContext("u1", makeHeaders());

      const result1 = await handler.createSolo({
        context: ctx1,
        input: soloInput as any,
      });
      const result2 = await handler.createSolo({
        context: ctx2,
        input: soloInput as any,
      });

      expect(booking.createSolo).toHaveBeenCalledTimes(2);
      expect(result1.id).not.toEqual(result2.id);
    });

    test("cancel + re-book same tutor+slot within TTL returns a fresh booking (L2)", async () => {
      const booking = makeBookingService();
      booking.createSolo.mockImplementation(async () => ({ id: "b-fresh" }));
      const handler = createBookingHandler(booking as any);

      // First attempt (original booking request), then the user cancels it.
      const attempt1 = makeContext("u1", makeHeaders("attempt-1"));
      await handler.createSolo({ context: attempt1, input: soloInput as any });

      // Re-book the identical tutor + slot within the TTL. A fresh nonce
      // (a new attempt) must produce a NEW booking, not the cached id.
      const attempt2 = makeContext("u1", makeHeaders("attempt-2"));
      const result2 = await handler.createSolo({
        context: attempt2,
        input: soloInput as any,
      });

      expect(booking.createSolo).toHaveBeenCalledTimes(2);
      expect(result2.id).toEqual("b-fresh");
    });

    test("double-submit of the same request (same nonce header) — single booking (L2)", async () => {
      const booking = makeBookingService();
      const handler = createBookingHandler(booking as any);
      const headers = makeHeaders("same-attempt");
      const ctx = makeContext("u1", headers);

      const result1 = await handler.createSolo({
        context: ctx,
        input: soloInput as any,
      });
      const result2 = await handler.createSolo({
        context: ctx,
        input: soloInput as any,
      });

      expect(booking.createSolo).toHaveBeenCalledTimes(1);
      expect(result1).toEqual(result2);
    });

    test("different Idempotency-Key — two bookings created", async () => {
      const booking = makeBookingService();
      const handler = createBookingHandler(booking as any);

      const ctx1 = makeContext("u1", makeHeaders("key-a"));
      const ctx2 = makeContext("u1", makeHeaders("key-b"));

      await handler.createSolo({ context: ctx1, input: soloInput as any });
      await handler.createSolo({ context: ctx2, input: soloInput as any });

      expect(booking.createSolo).toHaveBeenCalledTimes(2);
    });

    test("different input (different tutorId) — two bookings even with same header", async () => {
      const booking = makeBookingService();
      const handler = createBookingHandler(booking as any);
      const headers = makeHeaders("same-key");
      const ctx = makeContext("u1", headers);

      const input1 = { ...soloInput, tutorId: "t1" };
      const input2 = { ...soloInput, tutorId: "t2" };

      await handler.createSolo({ context: ctx, input: input1 as any });
      await handler.createSolo({ context: ctx, input: input2 as any });

      expect(booking.createSolo).toHaveBeenCalledTimes(2);
    });

    test("service failure not marked processed — retry can succeed", async () => {
      const booking = makeBookingService();
      booking.createSolo.mockImplementationOnce(() => {
        throw new Error("db error");
      });
      const handler = createBookingHandler(booking as any);
      const headers = makeHeaders("retry-key");
      const ctx = makeContext("u1", headers);

      await expect(
        handler.createSolo({ context: ctx, input: soloInput as any }),
      ).rejects.toThrow("db error");

      expect(
        await bookingIdempotency.isProcessed(
          `booking:u1:t1:${soloInput.scheduledStartAt.toISOString()}:retry-key`,
        ),
      ).toBe(false);

      booking.createSolo.mockImplementationOnce(async () => ({ id: "b2" }));
      const result = await handler.createSolo({
        context: ctx,
        input: soloInput as any,
      });
      expect(result).toEqual({ id: "b2" });
      expect(booking.createSolo).toHaveBeenCalledTimes(2);
    });
  });

  describe("createGroup", () => {
    test("same Idempotency-Key returns same group booking", async () => {
      const booking = makeBookingService();
      const handler = createBookingHandler(booking as any);
      const headers = makeHeaders("grp-key-1");
      const ctx = makeContext("u1", headers);

      const result1 = await handler.createGroup({
        context: ctx,
        input: groupInput as any,
      });
      const result2 = await handler.createGroup({
        context: ctx,
        input: groupInput as any,
      });

      expect(booking.createGroup).toHaveBeenCalledTimes(1);
      expect(result1).toEqual(result2);
    });
  });

  describe("createSeries", () => {
    test("same Idempotency-Key returns same series booking", async () => {
      const booking = makeBookingService();
      const handler = createBookingHandler(booking as any);
      const headers = makeHeaders("series-key-1");
      const ctx = makeContext("u1", headers);

      const result1 = await handler.createSeries({
        context: ctx,
        input: seriesInput as any,
      });
      const result2 = await handler.createSeries({
        context: ctx,
        input: seriesInput as any,
      });

      expect(booking.createSeries).toHaveBeenCalledTimes(1);
      expect(result1).toEqual(result2);
    });
  });
});
