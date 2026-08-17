import { describe, test, expect, beforeAll } from "bun:test";
import { eq, desc } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  booking,
  wallet,
  tutorInvite,
  tutorProfile,
  availabilitySlot,
  roomBooking,
  notification,
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
      token: `token-relocate-${ts}-${email}`,
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

async function listRoomBookings(bookingId: string) {
  return db
    .select()
    .from(roomBooking)
    .where(eq(roomBooking.bookingId, bookingId))
    .orderBy(desc(roomBooking.createdAt));
}

describe("H3: relocateRoom transitions AWAITING_ADMIN_ROOM_APPROVAL → SCHEDULED", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();

  let adminClient: TestClient;
  let studentClient: TestClient;
  let tutorClient: TestClient;
  let studentId: string;
  let tutorId: string;
  let slotId: string;
  let roomAId: string;
  let roomBId: string;

  beforeAll(async () => {
    const adminRes = await signUpAndSignIn(
      `admin.relocate.${ts}@cogito.test`,
      "Test1234!",
      "Admin Relocate",
    );
    const adminCtx = await createTestContext(adminRes.cookie);
    if (!adminCtx.session?.user) throw new Error("Admin session missing");
    await setUserRole(adminCtx.session.user.id, "admin");
    adminClient = createTestClient(await createTestContext(adminRes.cookie));

    const studentRes = await signUpAndSignIn(
      `student.relocate.${ts}@cogito.test`,
      "Test1234!",
      "Student Relocate",
    );
    const studentCtx = await createTestContext(studentRes.cookie);
    if (!studentCtx.session?.user) throw new Error("Student session missing");
    studentId = studentCtx.session.user.id;
    await creditWallet(studentId, 200);
    studentClient = createTestClient(
      await createTestContext(studentRes.cookie),
    );

    const t = await createPublishedTutor(
      `tutor.relocate.${ts}@cogito.test`,
      ts,
      "Prof Relocate",
    );
    tutorId = t.tutorId;
    slotId = t.slotId;
    tutorClient = createTestClient(await createTestContext(t.cookie));

    const roomA = await adminClient.room.create({
      name: "Ruang Relocate A",
      location: "Lantai 1",
      capacity: 10,
    });
    roomAId = roomA.id;
    const roomB = await adminClient.room.create({
      name: "Ruang Relocate B",
      location: "Lantai 2",
      capacity: 12,
    });
    roomBId = roomB.id;
  });

  test("relocate from awaiting_admin_room_approval → booking becomes SCHEDULED with deadline = scheduledEnd + grace", async () => {
    const startISO = new Date(Date.now() + 24 * 3600_000).toISOString();
    const endISO = new Date(Date.now() + 25 * 3600_000).toISOString();
    const proposedStartISO = new Date(Date.now() + 48 * 3600_000).toISOString();
    const proposedEndISO = new Date(Date.now() + 49 * 3600_000).toISOString();

    const created = await studentClient.booking.createSolo({
      tutorId,
      availabilitySlotId: slotId,
      modality: "offline",
      scheduledStartAt: startISO,
      scheduledEndAt: endISO,
      timezone: "Asia/Jakarta",
    });
    const accepted = await tutorClient.tutorActions.acceptBooking({
      bookingId: created.id,
    });
    expect(accepted.currentState).toBe(
      BOOKING_STATE.AWAITING_ADMIN_ROOM_APPROVAL,
    );

    // Reachability of the H3 state: a booking awaiting admin room approval
    // that still holds a CONFIRMED roomBooking row. The only public path is a
    // reschedule proposal outstanding while the admin assigns a room (the
    // transition no-ops on RESCHEDULE_PROPOSED), then the proposal is accepted
    // and returns the booking to AWAITING_ADMIN_ROOM_APPROVAL with the
    // confirmed room row intact.
    await studentClient.booking.proposeReschedule({
      bookingId: created.id,
      proposedStartAt: proposedStartISO,
      proposedEndAt: proposedEndISO,
      reason: "Pindah jadwal sambil nunggu ruangan",
      availabilitySlotId: slotId,
    });
    await adminClient.room.assign({
      bookingId: created.id,
      roomId: roomAId,
      startAt: proposedStartISO,
      endAt: proposedEndISO,
    });
    const rescheduled = await tutorClient.booking.acceptReschedule({
      bookingId: created.id,
    });
    expect(rescheduled.currentState).toBe(
      BOOKING_STATE.AWAITING_ADMIN_ROOM_APPROVAL,
    );

    let row = await getBookingRow(created.id);
    expect(row.currentState).toBe(BOOKING_STATE.AWAITING_ADMIN_ROOM_APPROVAL);
    const rowsBefore = await listRoomBookings(created.id);
    expect(rowsBefore.filter((r) => r.status === "confirmed").length).toBe(1);
    const deadlineBefore = row.deadlineAt!.getTime();
    expect(
      Math.abs(deadlineBefore - (Date.now() + RESPONSE_WINDOW_MS)),
    ).toBeLessThan(60_000);

    const relocated = await adminClient.room.relocate({
      bookingId: created.id,
      roomId: roomBId,
      startAt: proposedStartISO,
      endAt: proposedEndISO,
    });
    expect(relocated.status).toBe("confirmed");
    expect(relocated.roomId).toBe(roomBId);

    const rows = await listRoomBookings(created.id);
    const oldRow = rows.find((r) => r.roomId === roomAId);
    const newRow = rows.find((r) => r.roomId === roomBId);
    expect(oldRow!.status).toBe("relocated");
    expect(newRow!.status).toBe("confirmed");

    row = await getBookingRow(created.id);
    expect(row.currentState).toBe(BOOKING_STATE.SCHEDULED);
    expect(row.holdAmount).toBeGreaterThan(0);
    expect(row.deadlineAt!.getTime()).toBe(
      row.scheduledEndAt.getTime() + OFFLINE_SCHEDULED_GRACE_MS,
    );
  });

  test("relocate from scheduled → booking stays SCHEDULED and deadline unchanged (no-op guard)", async () => {
    const startISO = new Date(Date.now() + 50 * 3600_000).toISOString();
    const endISO = new Date(Date.now() + 51 * 3600_000).toISOString();

    const created = await studentClient.booking.createSolo({
      tutorId,
      availabilitySlotId: slotId,
      modality: "offline",
      scheduledStartAt: startISO,
      scheduledEndAt: endISO,
      timezone: "Asia/Jakarta",
    });
    await tutorClient.tutorActions.acceptBooking({ bookingId: created.id });
    await adminClient.room.assign({
      bookingId: created.id,
      roomId: roomAId,
      startAt: startISO,
      endAt: endISO,
    });

    let row = await getBookingRow(created.id);
    expect(row.currentState).toBe(BOOKING_STATE.SCHEDULED);
    const deadlineBefore = row.deadlineAt!.getTime();

    await adminClient.room.relocate({
      bookingId: created.id,
      roomId: roomBId,
      startAt: startISO,
      endAt: endISO,
    });

    row = await getBookingRow(created.id);
    expect(row.currentState).toBe(BOOKING_STATE.SCHEDULED);
    expect(row.deadlineAt!.getTime()).toBe(deadlineBefore);

    const rows = await listRoomBookings(created.id);
    const oldRow = rows.find((r) => r.roomId === roomAId);
    const newRow = rows.find((r) => r.roomId === roomBId);
    expect(oldRow!.status).toBe("relocated");
    expect(newRow!.status).toBe("confirmed");
  });

  test("relocate notifies tutor and student (P1-3)", async () => {
    const notifs = await db
      .select()
      .from(notification)
      .where(eq(notification.title, "Offline session relocated"));
    expect(notifs.length).toBeGreaterThanOrEqual(2);
    const recipients = [...new Set(notifs.map((n) => n.userId))];
    expect(recipients).toContain(tutorId);
    expect(recipients).toContain(studentId);
  });

  test("expireBookings sweep does not cancel/no-show the relocated SCHEDULED booking", async () => {
    const startISO = new Date(Date.now() + 52 * 3600_000).toISOString();
    const endISO = new Date(Date.now() + 53 * 3600_000).toISOString();

    const created = await studentClient.booking.createSolo({
      tutorId,
      availabilitySlotId: slotId,
      modality: "offline",
      scheduledStartAt: startISO,
      scheduledEndAt: endISO,
      timezone: "Asia/Jakarta",
    });
    await tutorClient.tutorActions.acceptBooking({ bookingId: created.id });
    await studentClient.booking.proposeReschedule({
      bookingId: created.id,
      proposedStartAt: startISO,
      proposedEndAt: endISO,
      reason: "Pindah ruangan",
      availabilitySlotId: slotId,
    });
    await adminClient.room.assign({
      bookingId: created.id,
      roomId: roomAId,
      startAt: startISO,
      endAt: endISO,
    });
    await tutorClient.booking.acceptReschedule({ bookingId: created.id });

    let row = await getBookingRow(created.id);
    expect(row.currentState).toBe(BOOKING_STATE.AWAITING_ADMIN_ROOM_APPROVAL);

    await adminClient.room.relocate({
      bookingId: created.id,
      roomId: roomBId,
      startAt: startISO,
      endAt: endISO,
    });

    row = await getBookingRow(created.id);
    expect(row.currentState).toBe(BOOKING_STATE.SCHEDULED);

    const result = await services.booking.expireBookings();
    expect(result.failed).toBe(0);

    row = await getBookingRow(created.id);
    expect(row.currentState).toBe(BOOKING_STATE.SCHEDULED);
    expect(row.holdAmount).toBeGreaterThan(0);
    expect(row.deadlineAt!.getTime()).toBeGreaterThan(Date.now());
  });
});
