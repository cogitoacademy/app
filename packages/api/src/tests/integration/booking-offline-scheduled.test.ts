import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  booking,
  wallet,
  tutorInvite,
  tutorProfile,
  availabilitySlot,
} from "@cogito-app/db/schema";

import { services } from "@cogito-app/api/services";
import {
  createTestContext,
  createTestClient,
  signUpAndSignIn,
  setUserRole,
  resetDatabase,
  type TestClient,
} from "../helpers/test-client";
import {
  RESPONSE_WINDOW_MS,
  OFFLINE_SCHEDULED_GRACE_MS,
} from "../../shared/constants";
import { BOOKING_STATE } from "../../modules/booking/booking-state.types";

async function creditWallet(userId: string, amount: number) {
  const w = await services.wallet.getOrCreate(userId);
  await db
    .update(wallet)
    .set({ totalBalance: amount, availableBalance: amount })
    .where(eq(wallet.id, w.id));
}

async function signInAndGetCookie(email: string, password: string) {
  const { auth } = await import("@cogito-app/auth");
  const res = await auth.api.signInEmail({
    body: { email, password },
    headers: new Headers(),
    asResponse: true,
  });
  const setCookie = res.headers.getSetCookie();
  return setCookie
    .find((c: string) => c.includes("better-auth.session_token"))
    ?.split(";")[0];
}

async function createPublishedTutor(
  email: string,
  ts: number,
  name: string,
): Promise<{ tutorId: string; slotId: string; cookie: string }> {
  await signUpAndSignIn(email, "Test1234!", name);
  const cookie = (await signInAndGetCookie(email, "Test1234!")) ?? "";
  const tutorCtx = await createTestContext(cookie);
  if (!tutorCtx.session?.user) throw new Error("Tutor session missing");
  const tutorId = tutorCtx.session.user.id;
  await setUserRole(tutorId, "tutor");

  const [invite] = await db
    .insert(tutorInvite)
    .values({
      email,
      displayName: name,
      token: `token-offline-scheduled-${ts}-${email}`,
      status: "accepted",
      invitedBy: tutorId,
      expiresAt: new Date(Date.now() + 86400000),
      acceptedBy: tutorId,
      acceptedAt: new Date(),
    })
    .returning();

  await db
    .insert(tutorProfile)
    .values({
      userId: tutorId,
      inviteId: invite!.id,
      displayName: name,
      shortBio: "Bio",
      credentialsSummary: "Creds",
      expertise: ["Mathematics"],
      modality: "both",
      prices: { "1": 50, "2": 45, "3": 40, "4": 35, "5": 30, "6": 28 },
      availabilitySummary: "Flexible",
      onboardingStatus: "published",
      publishedAt: new Date(),
    })
    .execute();

  const start = new Date(Date.now() + 1 * 3600_000);
  const end = new Date(start.getTime() + 7 * 24 * 3600_000);
  const [slot] = await db
    .insert(availabilitySlot)
    .values({ tutorId, startDate: start, endDate: end, modality: "both" })
    .returning();

  return { tutorId, slotId: slot!.id, cookie };
}

async function getBookingRow(bookingId: string) {
  const [row] = await db
    .select()
    .from(booking)
    .where(eq(booking.id, bookingId));
  if (!row) throw new Error(`booking ${bookingId} not found`);
  return row;
}

describe("B1/U12: offline bookings do not auto-NO_SHOW at session start", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();
  const adminEmail = `admin.offline.${ts}@cogito.test`;

  let adminClient: TestClient;
  let studentClient: TestClient;
  let tutorClient: TestClient;
  let studentId: string;
  let tutorId: string;
  let slotId: string;
  let roomId: string;

  beforeAll(async () => {
    const adminRes = await signUpAndSignIn(adminEmail, "Test1234!", "Admin");
    const adminCtx = await createTestContext(adminRes.cookie);
    if (!adminCtx.session?.user) throw new Error("Admin session missing");
    await setUserRole(adminCtx.session.user.id, "admin");
    adminClient = createTestClient(await createTestContext(adminRes.cookie));

    const studentRes = await signUpAndSignIn(
      `student.offline.${ts}@cogito.test`,
      "Test1234!",
      "Student",
    );
    const studentCtx = await createTestContext(studentRes.cookie);
    if (!studentCtx.session?.user) throw new Error("Student session missing");
    studentId = studentCtx.session.user.id;
    await creditWallet(studentId, 200);
    studentClient = createTestClient(
      await createTestContext(studentRes.cookie),
    );

    const t = await createPublishedTutor(
      `tutor.offline.${ts}@cogito.test`,
      ts,
      "Prof Offline",
    );
    tutorId = t.tutorId;
    slotId = t.slotId;
    tutorClient = createTestClient(await createTestContext(t.cookie));

    const room = await adminClient.room.create({
      name: "Ruang Offline",
      location: "Lantai 1",
      capacity: 10,
    });
    roomId = room.id;
  });

  test("U12: offline tutor accept caps the room-approval deadline at 12h when the session is farther out", async () => {
    const start = new Date(Date.now() + 24 * 3600_000);
    const end = new Date(Date.now() + 25 * 3600_000);
    const b = await studentClient.booking.createSolo({
      tutorId,
      availabilitySlotId: slotId,
      modality: "offline",
      scheduledStartAt: start.toISOString(),
      scheduledEndAt: end.toISOString(),
      timezone: "Asia/Jakarta",
    });
    await tutorClient.tutorActions.acceptBooking({ bookingId: b.id });

    const row = await getBookingRow(b.id);
    expect(row.currentState).toBe(BOOKING_STATE.AWAITING_ADMIN_ROOM_APPROVAL);
    const expectedCap = Date.now() + RESPONSE_WINDOW_MS;
    expect(row.deadlineAt!.getTime()).toBeGreaterThan(expectedCap - 60_000);
    expect(row.deadlineAt!.getTime()).toBeLessThan(expectedCap + 60_000);
  });

  test("U12: offline tutor accept caps the deadline at session start when it is sooner than 12h", async () => {
    const start = new Date(Date.now() + 6 * 3600_000);
    const end = new Date(Date.now() + 7 * 3600_000);
    const b = await studentClient.booking.createSolo({
      tutorId,
      availabilitySlotId: slotId,
      modality: "offline",
      scheduledStartAt: start.toISOString(),
      scheduledEndAt: end.toISOString(),
      timezone: "Asia/Jakarta",
    });
    await tutorClient.tutorActions.acceptBooking({ bookingId: b.id });

    const row = await getBookingRow(b.id);
    expect(row.currentState).toBe(BOOKING_STATE.AWAITING_ADMIN_ROOM_APPROVAL);
    expect(row.deadlineAt!.getTime()).toBeGreaterThan(
      row.scheduledStartAt.getTime() - 60_000,
    );
    expect(row.deadlineAt!.getTime()).toBeLessThan(
      row.scheduledStartAt.getTime() + 60_000,
    );
  });

  test("B1: room assignment bumps the deadline past session end, so expireBookings never NO_SHOWs an offline SCHEDULED booking", async () => {
    const start = new Date(Date.now() + 30 * 3600_000);
    const end = new Date(Date.now() + 31 * 3600_000);
    const b = await studentClient.booking.createSolo({
      tutorId,
      availabilitySlotId: slotId,
      modality: "offline",
      scheduledStartAt: start.toISOString(),
      scheduledEndAt: end.toISOString(),
      timezone: "Asia/Jakarta",
    });
    await tutorClient.tutorActions.acceptBooking({ bookingId: b.id });

    await adminClient.room.assign({
      bookingId: b.id,
      roomId,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
    });

    let row = await getBookingRow(b.id);
    expect(row.currentState).toBe(BOOKING_STATE.SCHEDULED);
    // Deadline was bumped to scheduledEndAt + grace (was scheduledStartAt before).
    expect(row.deadlineAt!.getTime()).toBe(
      row.scheduledEndAt.getTime() + OFFLINE_SCHEDULED_GRACE_MS,
    );

    // Simulate the session being in progress: start already passed.
    const now = Date.now();
    await db
      .update(booking)
      .set({
        scheduledStartAt: new Date(now - 10 * 60_000),
        scheduledEndAt: new Date(now + 50 * 60_000),
      })
      .where(eq(booking.id, b.id));

    const result = await services.booking.expireBookings();
    expect(result.failed).toBe(0);

    row = await getBookingRow(b.id);
    expect(row.currentState).toBe(BOOKING_STATE.SCHEDULED);
    expect(row.holdAmount).toBe(50);
    expect(row.deadlineAt!.getTime()).toBeGreaterThan(now);

    const completed = await tutorClient.tutorActions.completeSession({
      bookingId: b.id,
    });
    expect(completed.currentState).toBe(BOOKING_STATE.COMPLETED);
  });
});
