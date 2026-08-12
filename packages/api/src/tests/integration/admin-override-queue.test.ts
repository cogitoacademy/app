import { describe, expect, test, beforeAll } from "bun:test";
import { db } from "@cogito-app/db";
import { booking } from "@cogito-app/db/schema";

import { services } from "../../services";
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
  });

  test("escalated flag is true for stale override requests (overriddenAt older than 12h)", async () => {
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
