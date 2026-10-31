import { PgDialect } from "drizzle-orm/pg-core";
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

function makeJoinSelectConn(rows: any[] = []) {
  const chain: any = {};
  const promise = Promise.resolve(rows);
  for (const method of ["from", "innerJoin", "leftJoin", "where", "orderBy"]) {
    chain[method] = mock(() => promise);
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
  test("empty booking aggregates and optimistic feedback updates have explicit zero/null results", async () => {
    const bound = createBookingRepo(makeSelectConn([]) as any);
    expect(
      await bound.countBookingsForAccess("admin1", { includeAll: true }),
    ).toEqual({
      action: 0,
      upcoming: 0,
      recurring: 0,
      history: 0,
      completed: 0,
      problem: 0,
      all: 0,
    });
    expect(
      await bound.findSessionById(makeSelectConn([]) as any, "missing"),
    ).toBeNull();
    const conn = makeUpdateConn([]) as any;
    expect(
      await bound.updateCompletionFeedback(conn, {
        id: "feedback1",
        expectedVersion: 1,
        version: 2,
        discussion: ["Discussion"],
        strengths: ["Strength"],
        improvements: ["Improve"],
      }),
    ).toBeNull();
    await bound.completeSession(conn, "session1");
    expect(conn.set).toHaveBeenLastCalledWith({
      currentState: "completed",
      completedAt: expect.any(Date),
    });
    expect(
      await bound.findCompletedBookingsByTutor(
        makeSelectConn([]) as any,
        "tutor1",
      ),
    ).toEqual([]);
    expect(
      await bound.findCompletedBookingsByTutor(
        makeSelectConn([]) as any,
        "tutor1",
        new Date(0),
        new Date(),
      ),
    ).toEqual([]);
  });
  test("empty lookup and payout allocation inputs avoid database calls", async () => {
    const repo = makeBookingRepo();
    const conn = { select: mock(), insert: mock() } as any;
    expect(await repo.findLedgerEventAmounts(conn, "b1", [])).toEqual(
      new Map(),
    );
    expect(await repo.findUserEmails(conn, [])).toEqual([]);
    expect(await repo.insertTutorPayoutAllocations(conn, [])).toEqual([]);
    expect(conn.select).not.toHaveBeenCalled();
    expect(conn.insert).not.toHaveBeenCalled();
  });

  test("headcount increment rejects a booking deleted before the update", async () => {
    await expect(
      makeBookingRepo().incrementBookingConfirmedHeadcount(
        makeUpdateConn([]) as any,
        "missing",
      ),
    ).rejects.toThrow("not found for headcount increment");
  });

  test.each(["missing", "tutor", "no-events"] as const)(
    "feedback entitlement excludes %s",
    async (scenario) => {
      const conn = makeSelectConn(
        scenario === "missing"
          ? []
          : [{ role: scenario === "tutor" ? "tutor" : "invitee" }],
      ) as any;
      expect(
        await makeBookingRepo().hasChargeableFeedbackEntitlement(
          conn,
          "b1",
          "u1",
          scenario === "no-events" ? [] : ["event1"],
        ),
      ).toBe(false);
      expect(conn.select).toHaveBeenCalledTimes(1);
    },
  );

  test("fee event retries return an exactly matching persisted source", async () => {
    const start = new Date();
    const input = {
      eventKey: "event1",
      bookingId: "b1",
      tutorId: "t1",
      grossHonorariumIdr: 50000,
      scheduledStartAt: start,
    };
    const existing = { ...input, bookingSessionId: null, priceSnapshot: null };
    const conn = {
      ...makeSelectConn([existing]),
      insert: () => ({
        values: () => ({
          onConflictDoNothing: () => ({ returning: async () => [] }),
        }),
      }),
    } as any;
    expect(
      await makeBookingRepo().insertTutorSessionFee(conn, input as any),
    ).toEqual(existing);
  });

  test("booking detail lookup returns null when the booking is absent", async () => {
    const conn = {
      ...makeSelectConn([]),
      query: { booking: { findFirst: mock(async () => null) } },
    } as any;
    expect(
      await createBookingRepo(conn).findBookingWithParticipants("missing"),
    ).toBeNull();
  });
  test("ledger and fee event keys preserve identities and short circuit empty requests", async () => {
    const repo = makeBookingRepo();
    const conn = makeSelectConn([{ eventKey: "event1" }]) as any;
    expect(await repo.findLedgerEventKeys(conn, "b1", [])).toEqual([]);
    expect(await repo.listTutorSessionFeeEventKeysByBookings(conn, [])).toEqual(
      [],
    );
    expect(conn.select).not.toHaveBeenCalled();
    expect(await repo.findLedgerEventKeys(conn, "b1", ["event1"])).toEqual([
      "event1",
    ]);
    expect(
      await repo.listTutorSessionFeeEventKeysByBookings(conn, ["b1"]),
    ).toEqual(["event1"]);
    expect(await repo.findUsersByIds(conn, [])).toEqual([]);
    expect(
      await repo.findUsersByIds(makeSelectConn([{ id: "u1" }]) as any, ["u1"]),
    ).toEqual([{ id: "u1" }]);
    expect(
      await repo.findPendingInvitees(
        makeSelectConn([{ id: "invite1" }]) as any,
        "b1",
      ),
    ).toEqual([{ id: "invite1" }]);
  });

  test("reschedule and tutor participant lookups return explicit null for missing rows", async () => {
    const repo = makeBookingRepo();
    for (const rows of [[], [{ id: "found" }]]) {
      const conn = makeSelectConn(rows) as any;
      expect(await repo.findPendingRescheduleProposal(conn, "b1")).toEqual(
        rows[0] ?? null,
      );
      expect(await repo.findTutorParticipant(conn, "b1")).toEqual(
        rows[0] ?? null,
      );
    }
  });

  test("persists booking and series schedules, pricing, and proposal decisions", async () => {
    const repo = makeBookingRepo();
    const conn = makeUpdateConn() as any;
    const schedule = {
      scheduledStartAt: new Date(),
      scheduledEndAt: new Date(),
    };
    const price = { priceSnapshot: {} as any, holdAmount: 10 };
    await repo.updateBookingSchedule(conn, "b1", schedule);
    expect(conn.set).toHaveBeenLastCalledWith(schedule);
    await repo.updateSessionSchedule(conn, "s1", schedule);
    expect(conn.set).toHaveBeenLastCalledWith(schedule);
    await repo.updateBookingPriceSnapshot(conn, "b1", price);
    expect(conn.set).toHaveBeenLastCalledWith(price);
    await repo.updateScheduledSeriesPriceSnapshot(conn, "b1", price);
    expect(conn.set).toHaveBeenLastCalledWith(price);
    const decisions = {
      status: "accepted",
      decisions: { u1: "accepted" as const },
    };
    await repo.updateRescheduleProposal(conn, "proposal1", decisions);
    expect(conn.set).toHaveBeenLastCalledWith(decisions);
    await repo.decrementBookingConfirmedHeadcount(conn, "b1");
    expect(conn.set).toHaveBeenLastCalledWith({
      confirmedHeadcount: expect.any(Object),
    });
  });

  test("session cancellation reports whether a scheduled session changed and notes return persisted rows", async () => {
    const repo = makeBookingRepo();
    expect(await repo.cancelSession(makeUpdateConn([]) as any, "s1")).toBe(
      false,
    );
    const conn = makeUpdateConn([{ id: "s1" }]) as any;
    expect(await repo.cancelSession(conn, "s1")).toBe(true);
    expect(conn.set).toHaveBeenCalledWith({
      currentState: "cancelled",
      holdAmount: 0,
    });
    const note = { bookingId: "b1", authorId: "u1", content: "Progress" };
    const insert = makeInsertConn([{ id: "note1", ...note }]) as any;
    expect(await repo.insertSessionNote(insert, note)).toMatchObject({
      id: "note1",
    });
    expect(insert.values).toHaveBeenCalledWith(note);
    expect(
      await repo.listSessionNotes(
        makeSelectConn([{ id: "note1" }]) as any,
        "b1",
      ),
    ).toEqual([{ id: "note1" }]);
  });

  test("returns private tutor fee breakdown and bounded meeting retry candidates", async () => {
    const repo = createBookingRepo(makeJoinSelectConn([{ id: "fee1" }]) as any);
    expect(await repo.findBookingTutorFees("b1", "t1")).toEqual([
      { id: "fee1" },
    ]);
    const conn = makeSelectConn([{ id: "retry1" }]) as any;
    expect(await repo.findConfirmedMeetingsPendingRetry(conn)).toEqual([
      { id: "retry1" },
    ]);
    expect(conn.limit).toHaveBeenLastCalledWith(50);
    expect(await repo.findConfirmedMeetingsPendingRetry(conn, 5)).toEqual([
      { id: "retry1" },
    ]);
    expect(conn.limit).toHaveBeenLastCalledWith(5);
  });
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

  test("lists payout profiles and paid records with optional date bounds", async () => {
    const profiles = [{ tutorId: "t1", tutorName: "Tutor One" }];
    const profileConn = makeJoinSelectConn(profiles) as any;
    const repo = createBookingRepo({} as any);

    await expect(repo.listTutorPayoutProfiles(profileConn)).resolves.toEqual(
      profiles,
    );
    expect(profileConn.innerJoin).toHaveBeenCalledTimes(1);
    expect(profileConn.orderBy).toHaveBeenCalledTimes(1);

    const records = [{ id: "p1", tutorId: "t1", status: "paid" }];
    const recordConn = makeJoinSelectConn(records) as any;
    const dateFrom = new Date("2026-08-01T00:00:00.000Z");
    const dateTo = new Date("2026-08-31T23:59:59.999Z");

    await expect(
      repo.listTutorPayoutRecords(recordConn, dateFrom, dateTo),
    ).resolves.toEqual(records);
    expect(recordConn.innerJoin).toHaveBeenCalledTimes(1);
    expect(recordConn.leftJoin).not.toHaveBeenCalled();
    expect(recordConn.where).toHaveBeenCalledTimes(1);

    const unboundedConn = makeJoinSelectConn(records) as any;
    await expect(repo.listTutorPayoutRecords(unboundedConn)).resolves.toEqual(
      records,
    );
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

  test("counts bookings for a viewer with participant access filters", async () => {
    const nestedWhere = mock(() => ({}));
    const nestedFrom = mock(() => ({ where: nestedWhere }));
    const countWhere = mock(async () => [
      {
        action: 1,
        upcoming: 2,
        recurring: 3,
        history: 4,
        completed: 5,
        problem: 6,
        all: 7,
      },
    ]);
    const countFrom = mock(() => ({ where: countWhere }));
    const select = mock()
      .mockImplementationOnce(() => ({ from: nestedFrom }))
      .mockImplementationOnce(() => ({ from: countFrom }));
    const repo = createBookingRepo({ select } as any);

    await expect(
      repo.countBookingsForAccess("student-1", { includeAll: false }),
    ).resolves.toEqual({
      action: 1,
      upcoming: 2,
      recurring: 3,
      history: 4,
      completed: 5,
      problem: 6,
      all: 7,
    });
    expect(select).toHaveBeenCalledTimes(2);
    expect(nestedWhere).toHaveBeenCalledTimes(1);
    expect(countWhere).toHaveBeenCalledTimes(1);
  });

  test("adds ended tutor completion sessions to the booking view and counts", async () => {
    const rows = [{ id: "booking-1" }];
    const nestedWhere = mock(() => ({}));
    const nestedFrom = mock(() => ({ where: nestedWhere }));
    const countWhere = mock(async () => [
      {
        action: 1,
        upcoming: 2,
        recurring: 3,
        history: 4,
        completed: 5,
        problem: 6,
        all: 7,
      },
    ]);
    const countFrom = mock(() => ({ where: countWhere }));
    const select = mock()
      .mockImplementationOnce(() => ({ from: nestedFrom }))
      .mockImplementationOnce(() => ({ from: nestedFrom }))
      .mockImplementationOnce(() => ({ from: countFrom }));
    const findMany = mock(async () => rows);
    const repo = createBookingRepo({
      select,
      query: { booking: { findMany } },
    } as any);

    await expect(
      repo.listBookingsForAccess("tutor-1", {
        limit: 10,
        includeAll: true,
        includeCompletionActions: true,
        view: "action",
      }),
    ).resolves.toEqual(rows);
    await expect(
      repo.countBookingsForAccess("tutor-1", {
        includeAll: true,
        includeCompletionActions: true,
      }),
    ).resolves.toEqual({
      action: 1,
      upcoming: 2,
      recurring: 3,
      history: 4,
      completed: 5,
      problem: 6,
      all: 7,
    });
    expect(select).toHaveBeenCalledTimes(3);
    expect(nestedWhere).toHaveBeenCalledTimes(2);
    expect(countWhere).toHaveBeenCalledTimes(1);
  });
});

describe("booking repository uncovered safety boundaries", () => {
  test("findBookingById requests a row lock only when explicitly requested and returns null for a missing locked row", async () => {
    const query: any = Promise.resolve([]);
    const forUpdate = mock(() => query);
    query.for = forUpdate;
    const select = mock(() => ({
      from: mock(() => ({ where: mock(() => ({ limit: mock(() => query) })) })),
    }));
    const repo = createBookingRepo({} as any);

    await expect(
      repo.findBookingById({ select } as any, "missing", { forUpdate: true }),
    ).resolves.toBeNull();
    expect(forUpdate).toHaveBeenCalledWith("update");
  });

  test("completed booking date bounds include scheduled fallback when completion timestamp is null", async () => {
    const rows = [{ id: "completed-without-timestamp", completedAt: null }];
    const conn = makeSelectConn(rows);
    const repo = makeBookingRepo();
    const from = new Date("2026-08-01T00:00:00.000Z");
    const to = new Date("2026-08-31T23:59:59.999Z");

    await expect(
      repo.findCompletedBookingsByTutor(
        conn as any,
        "tutor-1",
        from,
        to,
        "completedAt",
      ),
    ).resolves.toEqual(rows);
    expect(conn.select).toHaveBeenCalledTimes(1);
    expect(conn.where).toHaveBeenCalledTimes(1);
    expect(conn.where.mock.calls[0]?.[0]).toBeDefined();
  });

  test("invalid cursor timestamp remains invalid and does not silently become a valid page boundary", () => {
    const decoded = decodeBookingCursor("not-a-date|");
    expect(Number.isNaN(decoded.scheduledStartAt.getTime())).toBe(true);
    expect(decoded.id).toBeNull();
  });
});

function makeTrackedSelectConn(rows: unknown[]) {
  const query: any = Promise.resolve(rows);
  for (const name of [
    "from",
    "where",
    "limit",
    "orderBy",
    "leftJoin",
    "innerJoin",
    "for",
  ])
    query[name] = mock(() => query);
  return { select: mock(() => query), query };
}

function trackedWhere(conn: ReturnType<typeof makeTrackedSelectConn>) {
  return new PgDialect().sqlToQuery(conn.query.where.mock.calls.at(-1)[0]);
}

describe("booking repository payout and report reads", () => {
  test.each([undefined, { id: "default", version: 3 }])(
    "tax configuration returns the persisted default or null: %j",
    async (row) => {
      const findFirst = mock(async () => row);
      const repo = makeBookingRepo();
      await expect(
        repo.findTutorTaxConfig({
          query: { tutorTaxConfig: { findFirst } },
        } as any),
      ).resolves.toEqual(row ?? null);
      expect(
        new PgDialect().sqlToQuery(findFirst.mock.calls[0]![0].where).params,
      ).toEqual(["default"]);
    },
  );

  test.each([false, true])(
    "payout lookup returns a persisted row and locks only when requested: %s",
    async (locked) => {
      const row = { id: "payout1", status: "prepared" };
      const conn = makeTrackedSelectConn([row]);
      const repo = makeBookingRepo();
      if (locked)
        await expect(
          repo.findTutorPayoutById(conn as any, "payout1", true),
        ).resolves.toBe(row);
      else
        await expect(
          repo.findTutorPayoutById(conn as any, "payout1"),
        ).resolves.toBe(row);
      expect(conn.query.for).toHaveBeenCalledTimes(locked ? 1 : 0);
      if (locked) expect(conn.query.for).toHaveBeenCalledWith("update");
      expect(trackedWhere(conn).params).toEqual(["payout1"]);
    },
  );

  test("payout and idempotency lookups return null when no row survives", async () => {
    const repo = makeBookingRepo();
    const conn = makeTrackedSelectConn([]);
    await expect(
      repo.findTutorPayoutById(conn as any, "missing", true),
    ).resolves.toBeNull();
    await expect(
      repo.findTutorPayoutByIdempotencyKey(conn as any, "request1"),
    ).resolves.toBeNull();
    expect(trackedWhere(conn).params).toEqual(["request1"]);
    const row = { id: "payout1" };
    const found = makeTrackedSelectConn([row]);
    await expect(
      repo.findTutorPayoutByIdempotencyKey(found as any, "request1"),
    ).resolves.toBe(row);
  });

  test("payout history applies default and explicit limits to its tutor scope", async () => {
    const rows = [{ id: "payout1" }];
    const conn = makeTrackedSelectConn(rows);
    const repo = makeBookingRepo();
    await expect(
      repo.listTutorPayoutsByTutorId(conn as any, "tutor1"),
    ).resolves.toEqual(rows);
    expect(conn.query.limit).toHaveBeenLastCalledWith(100);
    await expect(
      repo.listTutorPayoutsByTutorId(conn as any, "tutor1", 5),
    ).resolves.toEqual(rows);
    expect(conn.query.limit).toHaveBeenLastCalledWith(5);
    expect(trackedWhere(conn).params).toEqual(["tutor1"]);
  });

  test("reconciliation sources include the tutor and outstanding reconciliation predicate", async () => {
    const rows = [{ sourceKey: "fee1", payoutId: "payout1" }];
    const conn = makeTrackedSelectConn(rows);
    await expect(
      makeBookingRepo().listTutorPayoutReconciliationSourceKeys(
        conn as any,
        "tutor1",
      ),
    ).resolves.toEqual(rows);
    expect(trackedWhere(conn).params).toEqual(["tutor1", "required"]);
    expect(conn.query.innerJoin).toHaveBeenCalledTimes(1);
  });

  test("active payout allocations return source keys and nonempty writes return allocations", async () => {
    const conn = makeTrackedSelectConn([
      { sourceKey: "fee1" },
      { sourceKey: "fee2" },
    ]);
    const repo = makeBookingRepo();
    await expect(
      repo.listTutorPayoutAllocatedSourceKeys(conn as any, "tutor1"),
    ).resolves.toEqual(["fee1", "fee2"]);
    expect(trackedWhere(conn).params).toEqual(["tutor1", true]);
    const rows = [{ payoutId: "payout1", sourceKey: "fee1", active: true }];
    const write = makeInsertConn(rows);
    await expect(
      repo.insertTutorPayoutAllocations(write as any, rows),
    ).resolves.toEqual(rows);
    expect(write.values).toHaveBeenCalledWith(rows);
  });

  test.each(["scheduledStartAt", "completedAt"] as const)(
    "session fee date bounds use %s",
    async (basis) => {
      const row = { eventKey: "fee1" };
      const conn = makeTrackedSelectConn([row]);
      const from = new Date("2026-08-01T00:00:00Z");
      const to = new Date("2026-09-01T00:00:00Z");
      const repo = makeBookingRepo();
      await expect(
        repo.findTutorSessionFeesByTutor(
          conn as any,
          "tutor1",
          from,
          to,
          basis,
        ),
      ).resolves.toEqual([row]);
      const where = trackedWhere(conn);
      expect(where.params).toEqual([
        "tutor1",
        from.toISOString(),
        to.toISOString(),
      ]);
      expect(where.sql).toContain(
        basis === "completedAt" ? '"earned_at"' : '"scheduled_start_at"',
      );
      expect(conn.query.leftJoin).toHaveBeenCalledTimes(3);
    },
  );

  test("session fee reads omit date bounds by default", async () => {
    const conn = makeTrackedSelectConn([]);
    await expect(
      makeBookingRepo().findTutorSessionFeesByTutor(conn as any, "tutor1"),
    ).resolves.toEqual([]);
    expect(trackedWhere(conn).params).toEqual(["tutor1"]);
  });

  test.each([null, "s1"])(
    "completion feedback lookup scopes nullable session %s and optional lock",
    async (sessionId) => {
      const row = { id: "report1", sessionId };
      const conn = makeTrackedSelectConn([row]);
      const repo = makeBookingRepo();
      await expect(
        repo.findCompletionFeedback(conn as any, "b1", sessionId),
      ).resolves.toBe(row);
      expect(conn.query.for).not.toHaveBeenCalled();
      const where = trackedWhere(conn);
      expect(where.params).toEqual(sessionId ? ["b1", sessionId] : ["b1"]);
      if (!sessionId) expect(where.sql).toContain("is null");
      const missing = makeTrackedSelectConn([]);
      await expect(
        repo.findCompletionFeedback(missing as any, "b1", sessionId, {
          forUpdate: true,
        }),
      ).resolves.toBeNull();
      expect(missing.query.for).toHaveBeenCalledWith("update");
    },
  );

  test("request-key history lookup distinguishes an absent report from a persisted replay", async () => {
    const repo = makeBookingRepo();
    const empty = makeTrackedSelectConn([]);
    await expect(
      repo.findCompletionFeedbackHistoryByRequestKey(empty as any, "request1"),
    ).resolves.toBeNull();
    const row = { id: "event1" };
    const conn = makeTrackedSelectConn([row]);
    await expect(
      repo.findCompletionFeedbackHistoryByRequestKey(conn as any, "request1"),
    ).resolves.toBe(row);
    expect(trackedWhere(conn).params).toEqual(["request1"]);
  });

  test("feedback and history listings scope to their booking or report", async () => {
    const rows = [{ id: "report1" }];
    const conn = makeTrackedSelectConn(rows);
    const repo = makeBookingRepo();
    await expect(
      repo.listCompletionFeedbackByBooking(conn as any, "b1"),
    ).resolves.toEqual(rows);
    expect(trackedWhere(conn).params).toEqual(["b1"]);
    await expect(
      repo.listCompletionFeedbackHistoryByBooking(conn as any, "b1"),
    ).resolves.toEqual(rows);
    expect(trackedWhere(conn).params).toEqual(["b1"]);
    await expect(
      repo.listCompletionFeedbackHistoryByFeedback(conn as any, "report1"),
    ).resolves.toEqual(rows);
    expect(trackedWhere(conn).params).toEqual(["report1"]);
  });
});

describe("booking repository financial integrity", () => {
  test.each([false, true])(
    "failed meeting detection scopes the provider and state: %s",
    async (exists) => {
      const conn = makeTrackedSelectConn(exists ? [{ id: "meeting1" }] : []);
      await expect(
        makeBookingRepo().hasFailedGoogleMeeting(conn as any, "b1"),
      ).resolves.toBe(exists);
      expect(trackedWhere(conn).params).toEqual([
        "b1",
        "google_meet",
        "failed",
      ]);
    },
  );

  test("ledger amount reads preserve event identity and booking scope", async () => {
    const conn = makeTrackedSelectConn([
      { eventKey: "deduct1", amount: 42 },
      { eventKey: "forfeit1", amount: 12 },
    ]);
    await expect(
      makeBookingRepo().findLedgerEventAmounts(conn as any, "b1", [
        "deduct1",
        "forfeit1",
      ]),
    ).resolves.toEqual(
      new Map([
        ["deduct1", 42],
        ["forfeit1", 12],
      ]),
    );
    expect(trackedWhere(conn).params).toEqual(["b1", "deduct1", "forfeit1"]);
  });

  test("recipient lookup uses only explicitly requested user ids", async () => {
    const rows = [{ id: "u1", email: "u1@example.test", name: "User" }];
    const conn = makeTrackedSelectConn(rows);
    await expect(
      makeBookingRepo().findUserEmails(conn as any, ["u1"]),
    ).resolves.toEqual(rows);
    expect(trackedWhere(conn).params).toEqual(["u1"]);
  });

  test("session and participant locks are explicit and confirmed participants lock in stable order", async () => {
    const rows = [{ id: "row1" }];
    const conn = makeTrackedSelectConn(rows);
    const repo = makeBookingRepo();
    await expect(
      repo.findSessionById(conn as any, "s1", { forUpdate: true }),
    ).resolves.toBe(rows[0]);
    await expect(
      repo.findParticipant(conn as any, "b1", "u1", { forUpdate: true }),
    ).resolves.toBe(rows[0]);
    await expect(
      repo.findConfirmedParticipants(conn as any, "b1", "excluded-user", {
        forUpdate: true,
      }),
    ).resolves.toEqual(rows);
    expect(conn.query.for).toHaveBeenCalledTimes(3);
    expect(conn.query.orderBy).toHaveBeenCalledTimes(1);
    expect(trackedWhere(conn).params).toContain("excluded-user");
  });

  test.each([false, true])(
    "feedback entitlement requires a matching deduction for the participant: %s",
    async (charged) => {
      const participant = makeTrackedSelectConn([{ role: "invitee" }]);
      const entry = makeTrackedSelectConn(charged ? [{ id: "entry1" }] : []);
      const select = mock()
        .mockImplementationOnce(participant.select)
        .mockImplementationOnce(entry.select);
      await expect(
        makeBookingRepo().hasChargeableFeedbackEntitlement(
          { select } as any,
          "b1",
          "u1",
          ["deduct1"],
        ),
      ).resolves.toBe(charged);
      expect(trackedWhere(entry).params).toEqual([
        "b1",
        "deduct",
        "u1",
        "deduct1",
      ]);
    },
  );

  test("report insert returns its persisted identity and copies only feedback columns", async () => {
    const values = {
      bookingId: "b1",
      sessionId: null,
      authorId: "t1",
      discussion: ["Discussed"],
      strengths: ["Clear"],
      improvements: ["Practise"],
    };
    const persisted = { ...values, id: "report1", version: 1 };
    const conn = makeInsertConn([persisted]);
    await expect(
      makeBookingRepo().insertCompletionFeedback(conn as any, values),
    ).resolves.toBe(persisted);
    expect(conn.values).toHaveBeenCalledWith(values);
  });

  test("report audit insertion returns its persisted identity", async () => {
    const input = {
      feedbackId: "report1",
      bookingId: "b1",
      sessionId: null,
      version: 1,
      status: "submitted",
      actorId: "admin1",
      actorRole: "admin",
      deliveryConfirmed: true,
      discussion: ["Discussed"],
      strengths: ["Clear"],
      improvements: ["Practise"],
    };
    const row = { ...input, id: "event1" };
    const conn = makeInsertConn([row]);
    await expect(
      makeBookingRepo().insertCompletionFeedbackHistory(
        conn as any,
        input as any,
      ),
    ).resolves.toBe(row);
    expect(conn.values).toHaveBeenCalledWith(input);
  });

  test("deadline updates retain booking scope and record update time", async () => {
    const conn = makeUpdateConn();
    const deadline = new Date("2026-09-01T00:00:00Z");
    await makeBookingRepo().updateBookingDeadline(conn as any, "b1", deadline);
    expect(conn.set).toHaveBeenCalledWith({
      deadlineAt: deadline,
      updatedAt: expect.any(Date),
    });
    expect(
      new PgDialect().sqlToQuery(conn.where.mock.calls[0]![0]).params,
    ).toEqual(["b1"]);
  });

  test("allocation details are restricted to the requested payout", async () => {
    const rows = [{ id: "allocation1", sourceKey: "fee1" }];
    const conn = makeTrackedSelectConn(rows);
    await expect(
      makeBookingRepo().listTutorPayoutAllocationsByPayoutId(
        conn as any,
        "payout1",
      ),
    ).resolves.toEqual(rows);
    expect(trackedWhere(conn).params).toEqual(["payout1"]);
    expect(conn.query.leftJoin).toHaveBeenCalledTimes(1);
  });

  test("new fee sources return the inserted row without a retry lookup", async () => {
    const row = { id: "fee1" };
    const returning = mock(async () => [row]);
    const select = mock();
    const conn = {
      select,
      insert: mock(() => ({
        values: mock(() => ({
          onConflictDoNothing: mock(() => ({ returning })),
        })),
      })),
    };
    await expect(
      makeBookingRepo().insertTutorSessionFee(conn as any, {} as any),
    ).resolves.toBe(row);
    expect(select).not.toHaveBeenCalled();
  });

  test.each([
    "missing",
    "booking",
    "session",
    "tutor",
    "amount",
    "start",
    "snapshot",
  ] as const)("fee retry rejects changed %s identity", async (difference) => {
    const input = {
      eventKey: "fee1",
      bookingId: "b1",
      bookingSessionId: "s1",
      tutorId: "t1",
      grossHonorariumIdr: 10000,
      scheduledStartAt: new Date("2026-08-01T00:00:00Z"),
      priceSnapshot: { engine: "v3", collectedMarks: 42 },
    };
    const existing = { ...input };
    if (difference === "booking") existing.bookingId = "other";
    if (difference === "session") existing.bookingSessionId = "other";
    if (difference === "tutor") existing.tutorId = "other";
    if (difference === "amount") existing.grossHonorariumIdr++;
    if (difference === "start") existing.scheduledStartAt = new Date(0);
    if (difference === "snapshot")
      existing.priceSnapshot = { engine: "v3", collectedMarks: 99 };
    const conn = {
      ...makeTrackedSelectConn(difference === "missing" ? [] : [existing]),
      insert: () => ({
        values: () => ({
          onConflictDoNothing: () => ({ returning: async () => [] }),
        }),
      }),
    };
    await expect(
      makeBookingRepo().insertTutorSessionFee(conn as any, input as any),
    ).rejects.toThrow("conflicts with an existing source");
  });
});
