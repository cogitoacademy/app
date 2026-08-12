import { describe, expect, test, beforeAll } from "bun:test";
import { db } from "@cogito-app/db";
import { booking } from "@cogito-app/db/schema";

import { resetDatabase } from "../helpers/test-client";
import { createTestUser } from "../helpers/factories";
import { createBookingRepo } from "../../modules/booking/booking.repo";

const repo = createBookingRepo(db);

type BookingInsert = typeof booking.$inferInsert;

function makeBooking(overrides: Partial<BookingInsert> = {}): BookingInsert {
  const start = new Date(Date.now() + 2 * 3600_000);
  return {
    type: "solo",
    modality: "online",
    targetGroupSize: 1,
    scheduledStartAt: start,
    scheduledEndAt: new Date(start.getTime() + 3600_000),
    originalMarks: 100,
    ...overrides,
  } as BookingInsert;
}

describe("booking repo (real DB)", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  let tutorId: string;
  let proposerId: string;

  beforeAll(async () => {
    const tutor = await createTestUser(
      `repo.tutor.${crypto.randomUUID()}@cogito.test`,
      "tutor",
    );
    const proposer = await createTestUser(
      `repo.proposer.${crypto.randomUUID()}@cogito.test`,
    );
    tutorId = tutor.id;
    proposerId = proposer.id;
  });

  test("insertBooking + findBookingById round-trips explicit columns", async () => {
    const start = new Date(Date.now() + 2 * 3600_000);
    const b = await repo.insertBooking(
      db,
      makeBooking({
        tutorId,
        proposerId,
        scheduledStartAt: start,
        scheduledEndAt: new Date(start.getTime() + 3600_000),
        currentState: "awaiting_tutor_review",
        holdAmount: 50,
        confirmedHeadcount: 0,
      }),
    );

    const found = await repo.findBookingById(db, b.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(b.id);
    expect(found!.type).toBe("solo");
    expect(found!.modality).toBe("online");
    expect(found!.tutorId).toBe(tutorId);
    expect(found!.proposerId).toBe(proposerId);
    expect(found!.targetGroupSize).toBe(1);
    expect(found!.originalMarks).toBe(100);
    expect(found!.holdAmount).toBe(50);
    expect(found!.confirmedHeadcount).toBe(0);
    expect(found!.version).toBe(1);
    expect(found!.currentState).toBe("awaiting_tutor_review");
    expect(new Date(found!.scheduledStartAt).getTime()).toBe(start.getTime());
  });

  test("updateBookingVersioned rejects a stale version", async () => {
    const b = await repo.insertBooking(
      db,
      makeBooking({ tutorId, proposerId }),
    );
    const stale = await repo.updateBookingVersioned(db, b.id, 99, {
      currentState: "confirmed",
    });
    expect(stale).toBeNull();
  });

  test("updateBookingVersioned updates and bumps the version on a matching version", async () => {
    const b = await repo.insertBooking(
      db,
      makeBooking({ tutorId, proposerId }),
    );
    const result = await repo.updateBookingVersioned(db, b.id, 1, {
      currentState: "confirmed",
    });
    expect(result).not.toBeNull();
    expect(result!.newVersion).toBe(2);
    expect(result!.updated.version).toBe(2);
    expect(result!.updated.currentState).toBe("confirmed");

    const again = await repo.updateBookingVersioned(db, b.id, 2, {
      currentState: "completed",
      previousState: "confirmed",
    });
    expect(again).not.toBeNull();
    expect(again!.newVersion).toBe(3);
    expect(again!.updated.currentState).toBe("completed");
    expect(again!.updated.previousState).toBe("confirmed");
  });

  test("findOverlappingBookings detects overlapping time ranges", async () => {
    const base = Date.now() + 24 * 3600_000;
    const start = new Date(base);
    const b1 = await repo.insertBooking(
      db,
      makeBooking({
        tutorId,
        proposerId,
        scheduledStartAt: start,
        scheduledEndAt: new Date(base + 3600_000),
      }),
    );

    const overlapping = await repo.findOverlappingBookings(
      db,
      tutorId,
      new Date(base + 1800_000),
      new Date(base + 5400_000),
    );
    expect(overlapping.some((r) => r.id === b1.id)).toBe(true);
  });

  test("findOverlappingBookings returns none for non-overlapping ranges", async () => {
    const base = Date.now() + 24 * 3600_000;
    const start = new Date(base);
    await repo.insertBooking(
      db,
      makeBooking({
        tutorId,
        proposerId,
        scheduledStartAt: start,
        scheduledEndAt: new Date(base + 3600_000),
      }),
    );

    const none = await repo.findOverlappingBookings(
      db,
      tutorId,
      new Date(base + 7200_000),
      new Date(base + 10800_000),
    );
    expect(none).toEqual([]);
  });

  test("listBookingsByProposer cursor pagination returns disjoint pages", async () => {
    const proposer = await createTestUser(
      `repo.proposer.page.${crypto.randomUUID()}@cogito.test`,
    );
    const base = Date.now() + 48 * 3600_000;
    const times = [0, 1, 2].map((h) => new Date(base + h * 3600_000));
    const ids: string[] = [];
    for (const t of times) {
      const b = await repo.insertBooking(
        db,
        makeBooking({
          tutorId,
          proposerId: proposer.id,
          scheduledStartAt: t,
          scheduledEndAt: new Date(t.getTime() + 3600_000),
        }),
      );
      ids.push(b.id);
    }

    const page1Rows = await repo.listBookingsByProposer(proposer.id, {
      limit: 2,
    });
    expect(page1Rows.length).toBe(3);
    const page1 = page1Rows.slice(0, 2);
    const nextCursor =
      page1Rows.length > 2 ? page1[1]!.scheduledStartAt.toISOString() : null;
    expect(nextCursor).not.toBeNull();

    const page1Ids = page1.map((r) => r.id);
    expect(new Set(page1Ids).size).toBe(2);
    expect(page1Rows[0]!.id).toBe(ids[2]!);
    expect(page1Rows[1]!.id).toBe(ids[1]!);

    const page2Rows = await repo.listBookingsByProposer(proposer.id, {
      limit: 2,
      cursor: nextCursor!,
    });
    const page2 = page2Rows.slice(0, 2);
    const page2Ids = page2.map((r) => r.id);
    expect(page2Ids).toContain(ids[0]!);
    for (const id of page2Ids) {
      expect(page1Ids).not.toContain(id);
    }
  });
});
