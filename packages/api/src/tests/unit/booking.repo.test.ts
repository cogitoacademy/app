import { describe, test, expect, mock } from "bun:test";
import { createBookingRepo } from "../../modules/booking/booking.repo";
import {
  encodeBookingCursor,
  decodeBookingCursor,
} from "../../modules/booking/booking.repo";

function makeSelectConn(rows: any[] = []) {
  const chain: any = {};
  const promise = Promise.resolve(rows);
  chain.from = mock(() => promise);
  chain.where = mock(() => promise);
  chain.limit = mock(() => promise);
  chain.orderBy = mock(() => promise);
  chain.offset = mock(() => promise);
  for (const method of ["from", "where", "limit", "orderBy", "offset"]) {
    (promise as any)[method] = chain[method];
  }
  const select = mock(() => promise);
  return { select, ...chain };
}

function makeUpdateConn(returningRows: any[] = []) {
  const returning = mock(() => Promise.resolve(returningRows));
  const where = mock(() => ({ returning }));
  const set = mock(() => ({ where }));
  const update = mock(() => ({ set }));
  return { update, set, where, returning };
}

function makeInsertConn(returningRows?: any[]) {
  if (returningRows) {
    const returning = mock(() => Promise.resolve(returningRows));
    const values = mock(() => ({ returning }));
    const insert = mock(() => ({ values, returning }));
    return { insert, values, returning };
  }
  const values = mock(async () => {});
  const insert = mock(() => ({ values }));
  return { insert, values };
}

function makeBookingRepo() {
  const db: any = {
    query: {
      booking: { findFirst: mock(() => {}), findMany: mock(() => {}) },
      tutorProfile: { findFirst: mock(() => {}) },
      availabilitySlot: { findFirst: mock(() => {}) },
    },
  };
  return createBookingRepo(db);
}

describe("createBookingRepo", () => {
  test("resolves active tutor subject topics and rejects inactive relations", async () => {
    const repo = createBookingRepo({} as any);
    const active = {
      subject: {
        id: "s1",
        slug: "speech",
        name: "Speech",
        parentId: "c1",
        isActive: true,
        parent: { id: "c1", slug: "mun", name: "MUN", isActive: true },
      },
    };
    const conn = {
      query: {
        tutorProfile: {
          findFirst: mock(async () => ({
            subjects: [{ subject: null }, active],
          })),
        },
      },
    } as any;
    await expect(
      repo.findTutorSubjectTopic(conn, "t1", "s1"),
    ).resolves.toMatchObject({ subcategoryId: "s1", categoryId: "c1" });
    await expect(
      repo.findTutorSubjectTopic(conn, "t1", "missing"),
    ).resolves.toBeNull();
    await expect(
      repo.findTutorSubjectTopic(
        {
          query: { tutorProfile: { findFirst: mock(async () => null) } },
        } as any,
        "t1",
      ),
    ).resolves.toBeNull();
  });

  test("filters completed payouts by completion dates", async () => {
    const repo = createBookingRepo({} as any);
    const conn = makeSelectConn([]) as any;
    await repo.findCompletedBookingsByTutor(
      conn,
      "t1",
      new Date("2026-08-01"),
      new Date("2026-08-31"),
      "completedAt",
    );
    expect(conn.where).toHaveBeenCalledTimes(1);
  });

  test("inserts and returns a tutor payout", async () => {
    const row = { id: "p1" };
    const conn = makeInsertConn([row]) as any;
    const repo = createBookingRepo({} as any);
    await expect(
      repo.insertTutorPayout(conn, { tutorId: "t1" } as any),
    ).resolves.toBe(row);
  });

  test("returns object with all repo methods", () => {
    const repo = makeBookingRepo();

    expect(repo).toHaveProperty("findBookingById");
    expect(repo).toHaveProperty("findBookingWithParticipants");
    expect(repo).toHaveProperty("listBookingsByProposer");
    expect(repo).toHaveProperty("listBookingsByTutor");
    expect(repo).toHaveProperty("findTutorProfile");
    expect(repo).toHaveProperty("findAvailabilitySlot");
    expect(repo).toHaveProperty("findParticipant");
    expect(repo).toHaveProperty("findConfirmedParticipants");
    expect(repo).toHaveProperty("findReconfirmedParticipants");
    expect(repo).toHaveProperty("resetReconfirmedParticipants");
    expect(repo).toHaveProperty("insertBooking");
    expect(repo).toHaveProperty("updateBookingCancellationReason");
    expect(repo).toHaveProperty("updateBookingHoldAmount");
    expect(repo).toHaveProperty("incrementBookingConfirmedHeadcount");
    expect(repo).toHaveProperty("insertParticipant");
    expect(repo).toHaveProperty("updateParticipantState");
    expect(repo).toHaveProperty("insertStateHistory");
    expect(repo).toHaveProperty("insertRescheduleProposal");
    expect(repo).toHaveProperty("insertBookingSession");
    expect(repo).toHaveProperty("listSessionsBySeriesId");
    expect(repo).toHaveProperty("findBookingsExpiringByDeadline");
    expect(repo).toHaveProperty("findOverlappingBookings");
    expect(repo).toHaveProperty("updateBookingVersioned");
  });

  describe("findBookingById", () => {
    test("returns row when found", async () => {
      const row = {
        id: "b1",
        currentState: "confirmed",
        priceSnapshot: {
          perStudent: 42000,
          baseline: 42000,
          tutorShare: 33600,
          cogitoTake: 8400,
          baselineCogitoTake: 12000,
          baselineTutorShare: 30000,
          extraTotal: 0,
          cogitoExtraTake: 0,
          tutorExtraShare: 0,
        },
      };
      const conn: any = { ...makeSelectConn([row]) };
      const repo = makeBookingRepo();

      const result = await repo.findBookingById(conn, "b1");

      expect(result).toEqual(row);
      expect(result?.id).toBe("b1");
      expect(result?.currentState).toBe("confirmed");
      expect(result?.priceSnapshot).toEqual(row.priceSnapshot);
      expect(conn.from).toHaveBeenCalledTimes(1);
      expect(conn.where).toHaveBeenCalledTimes(1);
    });

    test("returns null when not found", async () => {
      const conn: any = { ...makeSelectConn([]) };
      const repo = makeBookingRepo();

      const result = await repo.findBookingById(conn, "missing");

      expect(result).toBeNull();
    });
  });

  describe("findTutorProfile", () => {
    test("returns profile when found with publishedOnly", async () => {
      const profile = { userId: "t1", onboardingStatus: "published" };
      const findFirst = mock(() => Promise.resolve(profile));
      const conn: any = { query: { tutorProfile: { findFirst } } };
      const repo = makeBookingRepo();

      const result = await repo.findTutorProfile(conn, "t1", {
        publishedOnly: true,
      });

      expect(result).toEqual(profile);
      expect(findFirst).toHaveBeenCalledTimes(1);
    });

    test("returns profile without publishedOnly filter", async () => {
      const profile = { userId: "t1", onboardingStatus: "draft" };
      const findFirst = mock(() => Promise.resolve(profile));
      const conn: any = { query: { tutorProfile: { findFirst } } };
      const repo = makeBookingRepo();

      const result = await repo.findTutorProfile(conn, "t1");

      expect(result).toEqual(profile);
      expect(findFirst).toHaveBeenCalledTimes(1);
    });

    test("returns null when not found", async () => {
      const findFirst = mock(() => Promise.resolve(undefined));
      const conn: any = { query: { tutorProfile: { findFirst } } };
      const repo = makeBookingRepo();

      const result = await repo.findTutorProfile(conn, "nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("findAvailabilitySlot", () => {
    test("finds slot without futureOnly", async () => {
      const slot = { id: "s1", tutorId: "t1", isActive: true };
      const findFirst = mock(() => Promise.resolve(slot));
      const conn: any = { query: { availabilitySlot: { findFirst } } };
      const repo = makeBookingRepo();

      const result = await repo.findAvailabilitySlot(conn, "s1", "t1");

      expect(result).toEqual(slot);
      expect(findFirst).toHaveBeenCalledTimes(1);
    });

    test("finds slot with futureOnly true", async () => {
      const slot = { id: "s1", tutorId: "t1", isActive: true };
      const findFirst = mock(() => Promise.resolve(slot));
      const conn: any = { query: { availabilitySlot: { findFirst } } };
      const repo = makeBookingRepo();

      const result = await repo.findAvailabilitySlot(conn, "s1", "t1", {
        futureOnly: true,
      });

      expect(result).toEqual(slot);
      expect(findFirst).toHaveBeenCalledTimes(1);
    });
  });

  describe("listActiveTutorAvailability", () => {
    test("lists active future availability ordered by start date", async () => {
      const slots = [{ id: "slot-1", tutorId: "t1", isActive: true }];
      const findMany = mock(() => Promise.resolve(slots));
      const conn: any = { query: { availabilitySlot: { findMany } } };
      const repo = makeBookingRepo();

      const result = await repo.listActiveTutorAvailability(conn, "t1");

      expect(result).toEqual(slots);
      expect(findMany).toHaveBeenCalledTimes(1);
      expect(findMany.mock.calls[0]?.[0].limit).toBe(100);
    });
  });

  describe("findParticipant", () => {
    test("returns participant when found", async () => {
      const participant = {
        id: "p1",
        bookingId: "b1",
        userId: "u1",
        confirmationState: "pending",
      };
      const conn: any = { ...makeSelectConn([participant]) };
      const repo = makeBookingRepo();

      const result = await repo.findParticipant(conn, "b1", "u1");

      expect(result).toEqual(participant);
      expect(result?.id).toBe("p1");
      expect(result?.bookingId).toBe("b1");
      expect(result?.userId).toBe("u1");
      expect(result?.confirmationState).toBe("pending");
      expect(conn.from).toHaveBeenCalledTimes(1);
    });

    test("returns null when not found", async () => {
      const conn: any = { ...makeSelectConn([]) };
      const repo = makeBookingRepo();

      const result = await repo.findParticipant(conn, "b1", "unknown");

      expect(result).toBeNull();
    });
  });

  describe("findConfirmedParticipants", () => {
    test("returns confirmed and reconfirmed participants", async () => {
      const rows = [
        { id: "p1", confirmationState: "confirmed" },
        { id: "p2", confirmationState: "reconfirmed" },
      ];
      const conn: any = { ...makeSelectConn(rows) };
      const repo = makeBookingRepo();

      const result = await repo.findConfirmedParticipants(conn, "b1");

      expect(result).toEqual(rows);
      expect(result[0]).toHaveProperty("id", "p1");
      expect(result[0]).toHaveProperty("confirmationState", "confirmed");
      expect(result[1]).toHaveProperty("confirmationState", "reconfirmed");
      expect(conn.from).toHaveBeenCalledTimes(1);
      expect(conn.where).toHaveBeenCalledTimes(1);
    });

    test("excludes specified user when excludeUserId provided", async () => {
      const rows = [{ id: "p2", confirmationState: "confirmed" }];
      const conn: any = { ...makeSelectConn(rows) };
      const repo = makeBookingRepo();

      const result = await repo.findConfirmedParticipants(conn, "b1", "u1");

      expect(result).toEqual(rows);
      expect(result[0]).toHaveProperty("id", "p2");
      expect(result[0]).toHaveProperty("confirmationState", "confirmed");
      expect(conn.from).toHaveBeenCalledTimes(1);
      expect(conn.where).toHaveBeenCalledTimes(1);
    });

    test("F8: never includes the tutor attendance row (role = 'tutor') in the headcount", async () => {
      const conn: any = { ...makeSelectConn([]) };
      const repo = makeBookingRepo();

      await repo.findConfirmedParticipants(conn, "b1");

      const conditions = conn.where.mock.calls[0]![0] as any;
      const renderChunk = (c: unknown): string => {
        if (typeof c === "string") return c;
        if (Array.isArray(c)) return c.map(renderChunk).join("");
        const chunk = c as {
          queryChunks?: unknown[];
          value?: unknown;
          name?: string;
        };
        if (chunk.value !== undefined) return String(chunk.value);
        if (chunk.name !== undefined) return chunk.name;
        if (chunk.queryChunks)
          return chunk.queryChunks.map(renderChunk).join("");
        return "";
      };
      const sqlText = renderChunk(conditions).replace(/\s+/g, " ");

      expect(sqlText).toContain("role");
      expect(sqlText).toContain("tutor");
    });
  });

  describe("findReconfirmedParticipants", () => {
    test("returns reconfirmed participants", async () => {
      const rows = [{ id: "p1", confirmationState: "reconfirmed" }];
      const conn: any = { ...makeSelectConn(rows) };
      const repo = makeBookingRepo();

      const result = await repo.findReconfirmedParticipants(conn, "b1");

      expect(result).toEqual(rows);
      expect(result[0]).toHaveProperty("id", "p1");
      expect(result[0]).toHaveProperty("confirmationState", "reconfirmed");
      expect(conn.from).toHaveBeenCalledTimes(1);
      expect(conn.where).toHaveBeenCalledTimes(1);
    });
  });

  describe("resetReconfirmedParticipants", () => {
    test("resets reconfirmed participants to confirmed and clears timestamps", async () => {
      const updateConn = makeUpdateConn();
      updateConn.where.mockReturnValue(Promise.resolve(undefined));
      const conn: any = { ...updateConn };
      const repo = makeBookingRepo();

      await repo.resetReconfirmedParticipants(conn, "b1");

      expect(updateConn.update).toHaveBeenCalledTimes(1);
      expect(updateConn.set).toHaveBeenCalledWith({
        confirmationState: "confirmed",
        reconfirmedAt: null,
      });
      expect(updateConn.where).toHaveBeenCalledTimes(1);
    });
  });

  describe("insertBooking", () => {
    test("inserts and returns the booking row", async () => {
      const row = { id: "b1", currentState: "draft" };
      const { insert, values } = makeInsertConn([row]);
      const conn: any = { insert };
      const repo = makeBookingRepo();

      const result = await repo.insertBooking(conn, {
        id: "b1",
        currentState: "draft",
      });

      expect(result).toEqual(row);
      expect(insert).toHaveBeenCalledTimes(1);
      expect(values).toHaveBeenCalledTimes(1);
    });
  });

  describe("updateBookingCancellationReason", () => {
    test("updates cancellation reason without returning", async () => {
      const updateConn = makeUpdateConn();
      updateConn.where.mockReturnValue(Promise.resolve(undefined));
      const conn: any = { ...updateConn };
      const repo = makeBookingRepo();

      await repo.updateBookingCancellationReason(conn, "b1", "sick");

      expect(updateConn.update).toHaveBeenCalledTimes(1);
      expect(updateConn.set).toHaveBeenCalledWith({
        cancellationReason: "sick",
      });
    });

    test("sets reason to null", async () => {
      const updateConn = makeUpdateConn();
      updateConn.where.mockReturnValue(Promise.resolve(undefined));
      const conn: any = { ...updateConn };
      const repo = makeBookingRepo();

      await repo.updateBookingCancellationReason(conn, "b1", null);

      expect(updateConn.set).toHaveBeenCalledWith({ cancellationReason: null });
    });
  });

  describe("updateBookingHoldAmount", () => {
    test("updates hold amount without returning", async () => {
      const updateConn = makeUpdateConn();
      updateConn.where.mockReturnValue(Promise.resolve(undefined));
      const conn: any = { ...updateConn };
      const repo = makeBookingRepo();

      await repo.updateBookingHoldAmount(conn, "b1", 50000);

      expect(updateConn.update).toHaveBeenCalledTimes(1);
      expect(updateConn.set).toHaveBeenCalledWith({ holdAmount: 50000 });
    });
  });

  describe("incrementBookingConfirmedHeadcount", () => {
    test("increments confirmed headcount atomically and returns the row", async () => {
      const updated = { id: "b1", confirmedHeadcount: 3 };
      const updateConn = makeUpdateConn([updated]);
      const conn: any = { ...updateConn };
      const repo = makeBookingRepo();

      const result = await repo.incrementBookingConfirmedHeadcount(conn, "b1");

      expect(updateConn.update).toHaveBeenCalledTimes(1);
      expect(result).toEqual(updated);
    });
  });

  describe("insertParticipant", () => {
    test("inserts participant without returning", async () => {
      const { insert, values } = makeInsertConn();
      const conn: any = { insert };
      const repo = makeBookingRepo();

      await repo.insertParticipant(conn, {
        bookingId: "b1",
        userId: "u1",
        confirmationState: "pending",
      });

      expect(insert).toHaveBeenCalledTimes(1);
      expect(values).toHaveBeenCalledTimes(1);
    });
  });

  describe("updateParticipantState", () => {
    test("updates participant state", async () => {
      const updateConn = makeUpdateConn();
      updateConn.where.mockReturnValue(Promise.resolve(undefined));
      const conn: any = { ...updateConn };
      const repo = makeBookingRepo();

      await repo.updateParticipantState(conn, "p1", {
        confirmationState: "confirmed",
      });

      expect(updateConn.update).toHaveBeenCalledTimes(1);
      expect(updateConn.set).toHaveBeenCalledWith({
        confirmationState: "confirmed",
      });
    });
  });

  describe("insertStateHistory", () => {
    test("inserts state history entry", async () => {
      const { insert, values } = makeInsertConn();
      const conn: any = { insert };
      const repo = makeBookingRepo();

      await repo.insertStateHistory(conn, {
        bookingId: "b1",
        fromState: null,
        toState: "draft",
        reason: null,
        actorId: "u1",
        actorType: "student",
      });

      expect(insert).toHaveBeenCalledTimes(1);
      expect(values).toHaveBeenCalledTimes(1);
    });

    test("inserts state history with metadata", async () => {
      const { insert, values } = makeInsertConn();
      const conn: any = { insert };
      const repo = makeBookingRepo();

      await repo.insertStateHistory(conn, {
        bookingId: "b1",
        fromState: "draft",
        toState: "confirmed",
        reason: "approved",
        actorId: "u1",
        actorType: "tutor",
        metadata: { note: "good" },
      });

      expect(insert).toHaveBeenCalledTimes(1);
      expect(values).toHaveBeenCalledTimes(1);
    });
  });

  describe("insertRescheduleProposal", () => {
    test("inserts reschedule proposal", async () => {
      const { insert, values } = makeInsertConn();
      const conn: any = { insert };
      const repo = makeBookingRepo();

      await repo.insertRescheduleProposal(conn, {
        bookingId: "b1",
        proposedBy: "u1",
        proposedStartAt: new Date("2026-01-01"),
        proposedEndAt: new Date("2026-01-01T01:30:00"),
        status: "pending",
      });

      expect(insert).toHaveBeenCalledTimes(1);
      expect(values).toHaveBeenCalledTimes(1);
    });
  });

  describe("insertBookingSession", () => {
    test("inserts booking session", async () => {
      const { insert, values } = makeInsertConn();
      const conn: any = { insert };
      const repo = makeBookingRepo();

      await repo.insertBookingSession(conn, {
        seriesBookingId: "sb1",
        scheduledStartAt: new Date("2026-01-01"),
        scheduledEndAt: new Date("2026-01-01T01:30:00"),
        currentState: "scheduled",
        holdAmount: 50000,
        priceSnapshot: {
          perStudent: 42000,
          baseline: 42000,
          tutorShare: 33600,
          cogitoTake: 8400,
          baselineCogitoTake: 12000,
          baselineTutorShare: 30000,
          extraTotal: 0,
          cogitoExtraTake: 0,
          tutorExtraShare: 0,
        },
      });

      expect(insert).toHaveBeenCalledTimes(1);
      expect(values).toHaveBeenCalledTimes(1);
    });
  });

  describe("listSessionsBySeriesId", () => {
    test("returns sessions ordered by scheduledStartAt", async () => {
      const rows = [
        { id: "s1", currentState: "scheduled" },
        { id: "s2", currentState: "scheduled" },
      ];
      const conn: any = { ...makeSelectConn(rows) };
      const repo = makeBookingRepo();

      const result = await repo.listSessionsBySeriesId(conn, "sb1");

      expect(result).toEqual(rows);
      expect(result[0]).toHaveProperty("id", "s1");
      expect(result[0]).toHaveProperty("currentState", "scheduled");
      expect(conn.from).toHaveBeenCalledTimes(1);
      expect(conn.where).toHaveBeenCalledTimes(1);
      expect(conn.orderBy).toHaveBeenCalledTimes(1);
    });
  });

  describe("findOverlappingBookings", () => {
    test("finds overlapping bookings without excluding booking id", async () => {
      const rows = [{ id: "b2" }];
      const conn: any = { ...makeSelectConn(rows) };
      const repo = makeBookingRepo();

      await repo.findOverlappingBookings(
        conn,
        "t1",
        new Date("2026-01-01"),
        new Date("2026-01-01T01:30:00"),
      );

      expect(conn.from).toHaveBeenCalledTimes(1);
      expect(conn.where).toHaveBeenCalledTimes(1);
    });

    test("finds overlapping bookings excluding specific booking id", async () => {
      const conn: any = { ...makeSelectConn([]) };
      const repo = makeBookingRepo();

      await repo.findOverlappingBookings(
        conn,
        "t1",
        new Date("2026-01-01"),
        new Date("2026-01-01T01:30:00"),
        { excludeBookingId: "b1" },
      );

      expect(conn.from).toHaveBeenCalledTimes(1);
      expect(conn.where).toHaveBeenCalledTimes(1);
    });

    test("finds overlapping bookings excluding terminal states", async () => {
      const rows = [{ id: "b2" }];
      const conn: any = { ...makeSelectConn(rows) };
      const repo = makeBookingRepo();

      await repo.findOverlappingBookings(
        conn,
        "t1",
        new Date("2026-01-01"),
        new Date("2026-01-01T01:30:00"),
        { excludeStates: ["declined", "cancelled", "completed"] },
      );

      expect(conn.from).toHaveBeenCalledTimes(1);
      expect(conn.where).toHaveBeenCalledTimes(1);
    });

    test("finds overlapping bookings with both excludeBookingId and excludeStates", async () => {
      const conn: any = { ...makeSelectConn([]) };
      const repo = makeBookingRepo();

      await repo.findOverlappingBookings(
        conn,
        "t1",
        new Date("2026-01-01"),
        new Date("2026-01-01T01:30:00"),
        { excludeBookingId: "b1", excludeStates: ["declined", "cancelled"] },
      );

      expect(conn.from).toHaveBeenCalledTimes(1);
      expect(conn.where).toHaveBeenCalledTimes(1);
    });
  });

  describe("findBookingsExpiringByDeadline", () => {
    test("finds bookings past deadline with given states", async () => {
      const rows = [
        { id: "b1", currentState: "awaiting_participant_confirmation" },
        { id: "b2", currentState: "awaiting_participant_confirmation" },
      ];
      const conn: any = { ...makeSelectConn(rows) };
      const repo = makeBookingRepo();

      const result = await repo.findBookingsExpiringByDeadline(conn, [
        "awaiting_participant_confirmation",
      ]);

      expect(result).toEqual(rows);
      expect(result[0]).toHaveProperty("id", "b1");
      expect(result[0]).toHaveProperty(
        "currentState",
        "awaiting_participant_confirmation",
      );
      expect(conn.from).toHaveBeenCalledTimes(1);
      expect(conn.where).toHaveBeenCalledTimes(1);
    });

    test("applies limit of 100 to bound each scheduler run", async () => {
      const rows = [{ id: "b1" }];
      const conn: any = { ...makeSelectConn(rows) };
      const repo = makeBookingRepo();

      await repo.findBookingsExpiringByDeadline(conn, [
        "awaiting_participant_confirmation",
      ]);

      expect(conn.limit).toHaveBeenCalledWith(100);
    });
  });

  describe("findBookingsWithTutorLateness", () => {
    test("F9: candidate query has no modality filter (offline bookings are flagged too)", async () => {
      const conn: any = { ...makeSelectConn([]) };
      const repo = makeBookingRepo();

      await repo.findBookingsWithTutorLateness(conn);

      const calls = conn.where.mock.calls;
      // The tutor-attendance subquery calls where() first; the main booking
      // predicate is the last call.
      const predicate = calls[calls.length - 1]![0] as any;
      const renderChunk = (c: unknown): string => {
        if (typeof c === "string") return c;
        if (Array.isArray(c)) return c.map(renderChunk).join("");
        const chunk = c as {
          queryChunks?: unknown[];
          value?: unknown;
          name?: string;
        };
        if (chunk.value !== undefined) return String(chunk.value);
        if (chunk.name !== undefined) return chunk.name;
        if (chunk.queryChunks)
          return chunk.queryChunks.map(renderChunk).join("");
        return "";
      };
      const sqlText = renderChunk(predicate).replace(/\s+/g, " ");

      expect(sqlText).toContain("current_state");
      expect(sqlText).toContain("scheduled");
      expect(sqlText).not.toContain("modality");
    });
  });

  describe("updateBookingVersioned", () => {
    test("returns updated row when version matches", async () => {
      const updated = { id: "b1", currentState: "confirmed", version: 2 };
      const updateConn = makeUpdateConn([updated]);
      const conn: any = { ...updateConn };
      const repo = makeBookingRepo();

      const result = await repo.updateBookingVersioned(conn, "b1", 1, {
        currentState: "confirmed",
      });

      expect(result).toEqual({ updated, newVersion: 2 });
      expect(updateConn.update).toHaveBeenCalledTimes(1);
      expect(updateConn.set).toHaveBeenCalledTimes(1);
    });

    test("returns null when version does not match", async () => {
      const updateConn = makeUpdateConn([]);
      const conn: any = { ...updateConn };
      const repo = makeBookingRepo();

      const result = await repo.updateBookingVersioned(conn, "b1", 5, {
        currentState: "confirmed",
      });

      expect(result).toBeNull();
    });
  });

  describe("findBookingWithParticipants", () => {
    test("delegates to db.query.booking.findFirst and attaches newest meeting row", async () => {
      const meetingRow = { id: "me1", bookingId: "b1", status: "manual" };
      const bookingRow = {
        id: "b1",
        participants: [],
        stateHistory: [],
        roomBookings: [],
      };
      const limit = mock(async () => [meetingRow]);
      const orderBy = mock(() => ({ limit }));
      const where = mock(() => ({ orderBy }));
      const from = mock(() => ({ where }));
      const select = mock(() => ({ from }));
      const findFirst = mock(() => Promise.resolve(bookingRow));
      const findMany = mock(() => Promise.resolve([]));
      const db: any = { select, query: { booking: { findFirst, findMany } } };
      const repo = createBookingRepo(db);

      const result = await repo.findBookingWithParticipants("b1");

      expect(select).toHaveBeenCalledTimes(1);
      expect(findFirst).toHaveBeenCalledTimes(1);
      expect(result!.meeting).toEqual(meetingRow);
    });

    test("attaches null meeting when no meeting row exists", async () => {
      const bookingRow = {
        id: "b1",
        participants: [],
        stateHistory: [],
        roomBookings: [],
      };
      const limit = mock(async () => []);
      const orderBy = mock(() => ({ limit }));
      const where = mock(() => ({ orderBy }));
      const from = mock(() => ({ where }));
      const select = mock(() => ({ from }));
      const findFirst = mock(() => Promise.resolve(bookingRow));
      const findMany = mock(() => Promise.resolve([]));
      const db: any = { select, query: { booking: { findFirst, findMany } } };
      const repo = createBookingRepo(db);

      const result = await repo.findBookingWithParticipants("b1");

      expect(result!.meeting).toBeNull();
    });
  });

  describe("listBookingsByProposer", () => {
    test("delegates to db.query.booking.findMany", async () => {
      const rows = [{ id: "b1" }];
      const findMany = mock(() => Promise.resolve(rows));
      const findFirst = mock(() => Promise.resolve(null));
      const db: any = { query: { booking: { findFirst, findMany } } };
      const repo = createBookingRepo(db);

      await repo.listBookingsByProposer("u1", { limit: 10 });

      expect(findMany).toHaveBeenCalledTimes(1);
    });

    test("passes states when provided", async () => {
      const findMany = mock(() => Promise.resolve([]));
      const findFirst = mock(() => Promise.resolve(null));
      const db: any = { query: { booking: { findFirst, findMany } } };
      const repo = createBookingRepo(db);

      await repo.listBookingsByProposer("u1", {
        limit: 10,
        states: ["confirmed", "scheduled"],
      });

      expect(findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe("listBookingsByTutor", () => {
    test("delegates to db.query.booking.findMany", async () => {
      const rows = [{ id: "b1" }];
      const findMany = mock(() => Promise.resolve(rows));
      const findFirst = mock(() => Promise.resolve(null));
      const db: any = { query: { booking: { findFirst, findMany } } };
      const repo = createBookingRepo(db);

      const result = await repo.listBookingsByTutor("t1", { limit: 10 });

      expect(result).toEqual(rows);
      expect(findMany).toHaveBeenCalledTimes(1);
    });

    test("accepts state and cursor filters", async () => {
      const findMany = mock(() => Promise.resolve([]));
      const findFirst = mock(() => Promise.resolve(null));
      const db: any = { query: { booking: { findFirst, findMany } } };
      const repo = createBookingRepo(db);

      await repo.listBookingsByTutor("t1", {
        limit: 5,
        states: ["awaiting_tutor_review", "scheduled"],
        cursor: "2026-08-16T03:00:00.000Z",
      });

      expect(findMany).toHaveBeenCalledTimes(1);
      expect(findMany.mock.calls[0]?.[0]).toMatchObject({ limit: 6 });
    });
  });

  describe("booking cursor (M3)", () => {
    test("encodeBookingCursor round-trips through decodeBookingCursor", () => {
      const start = new Date("2026-08-16T03:00:00.000Z");
      const cursor = encodeBookingCursor(start, "b-123");
      expect(cursor).toBe("2026-08-16T03:00:00.000Z|b-123");
      expect(decodeBookingCursor(cursor)).toEqual({
        scheduledStartAt: start,
        id: "b-123",
      });
    });

    test("decodeBookingCursor accepts a legacy bare-ISO cursor with null id", () => {
      const decoded = decodeBookingCursor("2026-08-16T03:00:00.000Z");
      expect(decoded.scheduledStartAt.toISOString()).toBe(
        "2026-08-16T03:00:00.000Z",
      );
      expect(decoded.id).toBeNull();
    });

    test("listBookingsByProposer passes a composite cursor through to findMany", async () => {
      const findMany = mock(() => Promise.resolve([]));
      const findFirst = mock(() => Promise.resolve(null));
      const db: any = { query: { booking: { findFirst, findMany } } };
      const repo = createBookingRepo(db);

      await repo.listBookingsByProposer("u1", {
        limit: 10,
        cursor: "2026-08-16T03:00:00.000Z|b-123",
      });

      expect(findMany).toHaveBeenCalledTimes(1);
      expect(findMany.mock.calls[0]?.[0]).toMatchObject({ limit: 11 });
    });
  });
});

describe("createBookingRepo additional query paths", () => {
  test("finds an availability window containing the requested session", async () => {
    const slot = { id: "slot-1", tutorId: "tutor-1" };
    const findFirst = mock(async () => slot);
    const repo = createBookingRepo({
      query: { availabilitySlot: { findFirst } },
    } as any);
    const start = new Date("2026-08-24T10:00:00.000Z");
    const end = new Date("2026-08-24T11:30:00.000Z");

    await expect(
      repo.findAvailabilityWindowContaining(
        { query: { availabilitySlot: { findFirst } } } as any,
        "tutor-1",
        start,
        end,
      ),
    ).resolves.toEqual(slot);
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findFirst.mock.calls[0]?.[0]).toHaveProperty("where");
  });

  test("updates booking session times", async () => {
    const updateConn = makeUpdateConn();
    updateConn.where.mockReturnValue(Promise.resolve(undefined));
    const repo = makeBookingRepo();
    const start = new Date("2026-08-24T10:00:00.000Z");
    const end = new Date("2026-08-24T11:30:00.000Z");

    await repo.updateBookingSessionTimes(updateConn as any, "session-1", {
      scheduledStartAt: start,
      scheduledEndAt: end,
    });

    expect(updateConn.update).toHaveBeenCalledTimes(1);
    expect(updateConn.set).toHaveBeenCalledWith(
      expect.objectContaining({ scheduledStartAt: start, scheduledEndAt: end }),
    );
    expect(updateConn.where).toHaveBeenCalledTimes(1);
  });

  test("cancels scheduled sessions belonging to a series", async () => {
    const updateConn = makeUpdateConn();
    updateConn.where.mockReturnValue(Promise.resolve(undefined));
    const repo = makeBookingRepo();

    await repo.cancelAllSessions(updateConn as any, "series-1");

    expect(updateConn.update).toHaveBeenCalledTimes(1);
    expect(updateConn.set).toHaveBeenCalledWith({ currentState: "cancelled" });
    expect(updateConn.where).toHaveBeenCalledTimes(1);
  });

  test("lists bookings for a viewer with participant access filters", async () => {
    const rows = [{ id: "booking-1" }];
    const nestedWhere = mock(async () => []);
    const nestedFrom = mock(() => ({ where: nestedWhere }));
    const select = mock(() => ({ from: nestedFrom }));
    const findMany = mock(async () => rows);
    const repo = createBookingRepo({
      select,
      query: { booking: { findMany } },
    } as any);

    await expect(
      repo.listBookingsForAccess("student-1", {
        limit: 10,
        states: ["confirmed"],
        cursor: "2026-08-24T10:00:00.000Z|booking-0",
      }),
    ).resolves.toEqual(rows);
    expect(select).toHaveBeenCalledTimes(1);
    expect(nestedFrom).toHaveBeenCalledTimes(1);
    expect(nestedWhere).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0]?.[0]).toHaveProperty("limit", 11);
  });

  test("lists all bookings for an admin without a relation subquery", async () => {
    const rows = [{ id: "booking-1" }];
    const select = mock(() => ({
      from: mock(() => ({ where: mock(async () => []) })),
    }));
    const findMany = mock(async () => rows);
    const repo = createBookingRepo({
      select,
      query: { booking: { findMany } },
    } as any);

    await expect(
      repo.listBookingsForAccess("admin-1", {
        limit: 20,
        includeAll: true,
      }),
    ).resolves.toEqual(rows);
    expect(select).not.toHaveBeenCalled();
    expect(findMany.mock.calls[0]?.[0].where).toBeUndefined();
  });
});
