import { describe, expect, test, beforeAll } from "bun:test";
import { db } from "@cogito-app/db";
import { booking } from "@cogito-app/db/schema";

import { services } from "../../services";
import { URGENCY_RANK } from "../../modules/admin-booking/admin-booking.repo";
import {
  createTestContext,
  signUpAndSignIn,
  setUserRole,
  resetDatabase,
} from "../helpers/test-client";

async function createUser(
  email: string,
  name: string,
  role: string,
): Promise<string> {
  const res = await signUpAndSignIn(email, "Test1234!", name);
  const ctx = await createTestContext(res.cookie);
  const userId = ctx.session!.user!.id;
  await setUserRole(userId, role);
  return userId;
}

async function insertBooking(
  tutorId: string,
  proposerId: string,
  overrides: Omit<
    Partial<typeof booking.$inferInsert>,
    "type" | "modality" | "tutorId" | "proposerId" | "targetGroupSize"
  > & {
    currentState: string;
    scheduledStartAt: Date;
  },
) {
  const { scheduledStartAt } = overrides;
  const [row] = await db
    .insert(booking)
    .values({
      type: "solo",
      modality: "online",
      tutorId,
      proposerId,
      targetGroupSize: 1,
      minConfirmedHeadcount: 1,
      confirmedHeadcount: 1,
      currentState: "confirmed",
      scheduledStartAt,
      scheduledEndAt: new Date(scheduledStartAt.getTime() + 90 * 60 * 1000),
      timezone: "Asia/Jakarta",
      originalMarks: 42,
      holdAmount: 42,
      refundedAmount: 0,
      version: 1,
      ...overrides,
    })
    .returning();
  return row!;
}

describe("Admin override queue (G8)", () => {
  const ts = Date.now();

  let studentId: string;
  let tutorId: string;

  beforeAll(async () => {
    await resetDatabase();
    await createUser(`g8.admin.${ts}@cogito.test`, "G8 Admin", "admin");
    studentId = await createUser(
      `g8.student.${ts}@cogito.test`,
      "G8 Student",
      "student",
    );
    tutorId = await createUser(
      `g8.tutor.${ts}@cogito.test`,
      "G8 Tutor",
      "tutor",
    );
  });

  test("listBookings sorts by urgency: pending-action first, then scheduled, terminal last, soonest session first within band", async () => {
    const now = Date.now();
    const ids = {
      awaiting: (await insertBooking(tutorId, studentId, {
        currentState: "awaiting_tutor_review",
        scheduledStartAt: new Date(now + 7 * 3600_000),
      }))!.id,
      scheduledSoon: (await insertBooking(tutorId, studentId, {
        currentState: "scheduled",
        scheduledStartAt: new Date(now + 8 * 3600_000),
      }))!.id,
      scheduledLater: (await insertBooking(tutorId, studentId, {
        currentState: "scheduled",
        scheduledStartAt: new Date(now + 10 * 3600_000),
      }))!.id,
      completed: (await insertBooking(tutorId, studentId, {
        currentState: "completed",
        scheduledStartAt: new Date(now + 5 * 3600_000),
      }))!.id,
    };

    const result = await services.adminBooking.listBookings({ limit: 20 });
    const order = result.items.map((i) => i.id);
    expect(order).toEqual([
      ids.awaiting,
      ids.scheduledSoon,
      ids.scheduledLater,
      ids.completed,
    ]);
    expect(order.length).toBe(4);

    const target = result.items.find((item) => item.id === ids.scheduledSoon)!;
    const numberSearch = await services.adminBooking.listBookings({
      search: `#${target.bookingNumber}`,
      limit: 20,
    });
    expect(numberSearch.items.map((item) => item.id)).toEqual([
      ids.scheduledSoon,
    ]);
    expect(numberSearch.items[0]?.bookingNumber).toBe(target.bookingNumber);
  });

  test("escalated flag is true after the OQ-04 SLA deadline", async () => {
    const staleId = (await insertBooking(tutorId, studentId, {
      currentState: "confirmed",
      scheduledStartAt: new Date(Date.now() + 6 * 3600_000),
      overrideMeta: {
        category: "force_cancel",
        overriddenAt: new Date(Date.now() - 13 * 3600_000).toISOString(),
      },
    }))!.id;
    const freshId = (await insertBooking(tutorId, studentId, {
      currentState: "scheduled",
      scheduledStartAt: new Date(Date.now() + 9 * 3600_000),
      overrideMeta: {
        category: "medical_emergency",
        overriddenAt: new Date().toISOString(),
      },
    }))!.id;

    const result = await services.adminBooking.listBookings({ limit: 20 });
    const byId = Object.fromEntries(result.items.map((i) => [i.id, i]));
    expect(byId[staleId]!.escalated).toBe(true);
    expect(byId[freshId]!.escalated).toBe(false);
    expect(byId[staleId]!.overrideMeta).toMatchObject({
      category: "force_cancel",
    });
  });

  test("filter by override category returns only matching bookings", async () => {
    const result = await services.adminBooking.listBookings({
      limit: 20,
      category: "force_cancel",
    });
    expect(result.items.length).toBeGreaterThan(0);
    for (const item of result.items) {
      expect(
        (item.overrideMeta as Record<string, unknown> | null)?.category,
      ).toBe("force_cancel");
    }
  });

  test("filter by urgency level returns only bookings in that band", async () => {
    const result = await services.adminBooking.listBookings({
      limit: 20,
      urgency: "high",
    });
    expect(result.items.length).toBeGreaterThan(0);
    for (const item of result.items) {
      expect([
        "awaiting_tutor_review",
        "awaiting_participant_confirmation",
        "awaiting_reconfirmation",
        "reschedule_proposed",
        "awaiting_admin_room_approval",
      ]).toContain(item.currentState);
    }
  });

  test("filter by escalated=true returns only escalated bookings", async () => {
    const result = await services.adminBooking.listBookings({
      limit: 20,
      escalated: true,
    });
    expect(result.items.length).toBeGreaterThan(0);
    for (const item of result.items) {
      expect(item.escalated).toBe(true);
    }
  });
});

describe("Admin override queue composite-cursor pagination (G8)", () => {
  const ts = Date.now();
  const LIMIT = 3;

  let studentId: string;
  let tutorId: string;

  beforeAll(async () => {
    await resetDatabase();
    await createUser(`g8.pg.admin.${ts}@cogito.test`, "G8 Pag Admin", "admin");
    studentId = await createUser(
      `g8.pg.student.${ts}@cogito.test`,
      "G8 Pag Student",
      "student",
    );
    tutorId = await createUser(
      `g8.pg.tutor.${ts}@cogito.test`,
      "G8 Pag Tutor",
      "tutor",
    );
  });

  test("composite-cursor pagination covers every band — no overlap, no skips, exact urgency order", async () => {
    const now = Date.now();
    const HOUR = 3600_000;
    const rankOf = (state: string) => URGENCY_RANK[state] ?? 2;

    // Band 1 (scheduled/confirmed) is created FIRST, so the later-created
    // band-0 bookings sort ahead purely because of state urgency — an id-only
    // cursor would paginate these in the wrong order.
    const scheduled = [
      await insertBooking(tutorId, studentId, {
        currentState: "confirmed",
        scheduledStartAt: new Date(now + 30 * HOUR),
      }),
      await insertBooking(tutorId, studentId, {
        currentState: "scheduled",
        scheduledStartAt: new Date(now + 40 * HOUR),
      }),
      await insertBooking(tutorId, studentId, {
        currentState: "confirmed",
        scheduledStartAt: new Date(now + 40 * HOUR),
      }),
      await insertBooking(tutorId, studentId, {
        currentState: "scheduled",
        scheduledStartAt: new Date(now + 55 * HOUR),
      }),
      await insertBooking(tutorId, studentId, {
        currentState: "confirmed",
        scheduledStartAt: new Date(now + 60 * HOUR),
      }),
      await insertBooking(tutorId, studentId, {
        currentState: "scheduled",
        scheduledStartAt: new Date(now + 70 * HOUR),
      }),
    ];

    // Band 0 (pending action) is created SECOND — still sorts before band 1.
    const pending = [
      await insertBooking(tutorId, studentId, {
        currentState: "awaiting_tutor_review",
        scheduledStartAt: new Date(now + 10 * HOUR),
      }),
      await insertBooking(tutorId, studentId, {
        currentState: "awaiting_participant_confirmation",
        scheduledStartAt: new Date(now + 20 * HOUR),
      }),
      await insertBooking(tutorId, studentId, {
        currentState: "awaiting_reconfirmation",
        scheduledStartAt: new Date(now + 35 * HOUR),
      }),
    ];

    // Band 2 (terminal) is created LAST — even the soonest terminal session
    // (now + 5h) sorts after every pending/scheduled booking.
    const terminal = [
      await insertBooking(tutorId, studentId, {
        currentState: "completed",
        scheduledStartAt: new Date(now + 5 * HOUR),
      }),
      await insertBooking(tutorId, studentId, {
        currentState: "cancelled",
        scheduledStartAt: new Date(now + 15 * HOUR),
      }),
      await insertBooking(tutorId, studentId, {
        currentState: "completed",
        scheduledStartAt: new Date(now + 45 * HOUR),
      }),
      await insertBooking(tutorId, studentId, {
        currentState: "no_show",
        scheduledStartAt: new Date(now + 65 * HOUR),
      }),
    ];

    const rows = [...pending, ...scheduled, ...terminal];
    const itemById = new Map(rows.map((r) => [r.id, r]));
    const expected = [...rows]
      .toSorted(
        (a, b) =>
          rankOf(a.currentState) - rankOf(b.currentState) ||
          a.scheduledStartAt.getTime() - b.scheduledStartAt.getTime() ||
          a.id.localeCompare(b.id),
      )
      .map((r) => r.id);
    expect(expected).toHaveLength(13);

    // Page through the whole queue, echoing nextCursor back verbatim.
    const pages: string[][] = [];
    let cursor: string | undefined;
    let guard = 0;
    do {
      const page = await services.adminBooking.listBookings({
        limit: LIMIT,
        cursor,
      });
      pages.push(page.items.map((i) => i.id));
      cursor = page.nextCursor ?? undefined;
      guard += 1;
    } while (cursor && guard < 20);

    // Exhausted in exactly ceil(13/3) pages with no dangling cursor.
    expect(pages).toHaveLength(Math.ceil(expected.length / LIMIT));
    expect(cursor).toBeUndefined();

    // Every page is the exact next slice of the urgency-sorted list.
    pages.forEach((page, i) => {
      expect(page).toEqual(expected.slice(i * LIMIT, (i + 1) * LIMIT));
    });

    // Union of all pages == full expected list: no skips, no overlap.
    const flat = pages.flat();
    expect(flat).toEqual(expected);
    expect(new Set(flat).size).toBe(flat.length);

    // The composite cursor moves across bands between pages — an id-only
    // cursor would never reproduce these boundaries at these offsets.
    const firstRank = (i: number) =>
      rankOf(itemById.get(pages[i]![0]!)!.currentState);
    const lastRank = (i: number) =>
      rankOf(itemById.get(pages[i]![pages[i]!.length - 1]!)!.currentState);
    expect(lastRank(0)).toBe(0); // page 1 ends in band 0
    expect(firstRank(1)).toBe(1); // page 2 starts in band 1
    expect(lastRank(2)).toBe(1); // page 3 ends in band 1
    expect(firstRank(3)).toBe(2); // page 4 starts in band 2
  });
});
