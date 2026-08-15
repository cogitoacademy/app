import { describe, test, expect, beforeAll } from "bun:test";
import { eq, desc } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  wallet,
  tutorInvite,
  tutorProfile,
  availabilitySlot,
  roomBooking,
  notification,
} from "@cogito-app/db/schema";

import {
  createTestContext,
  createTestClient,
  signUpAndSignIn,
  setUserRole,
  resetDatabase,
  type TestClient,
} from "../helpers/test-client";

async function creditWallet(userId: string, amount: number) {
  const { services } = await import("@cogito-app/api/services");
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
      token: `token-g14-${ts}-${email}`,
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

  const start = new Date(Date.now() + 48 * 3600_000);
  const end = new Date(Date.now() + 49 * 3600_000);
  const [slot] = await db
    .insert(availabilitySlot)
    .values({ tutorId, startDate: start, endDate: end, modality: "both" })
    .returning();

  return { tutorId, slotId: slot!.id, cookie };
}

async function listRoomBookings(bookingId: string) {
  return db
    .select()
    .from(roomBooking)
    .where(eq(roomBooking.bookingId, bookingId))
    .orderBy(desc(roomBooking.createdAt));
}

describe("G14 admin room relocate and cancel", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();
  const adminEmail = `admin.g14.${ts}@cogito.test`;

  let adminClient: TestClient;
  let student1Client: TestClient;
  let student2Client: TestClient;
  let tutor1Client: TestClient;
  let tutor2Client: TestClient;
  let tutor1Id: string;
  let tutor2Id: string;
  let student1Id: string;
  let slot1Id: string;
  let slot2Id: string;
  let roomAId: string;
  let roomBId: string;
  let roomCId: string;
  let booking1Id: string;
  let booking2Id: string;

  const startISO = new Date(Date.now() + 24 * 3600_000).toISOString();
  const endISO = new Date(Date.now() + 25 * 3600_000).toISOString();

  beforeAll(async () => {
    const adminRes = await signUpAndSignIn(
      adminEmail,
      "Test1234!",
      "Admin G14",
    );
    const adminCtx = await createTestContext(adminRes.cookie);
    if (!adminCtx.session?.user) throw new Error("Admin session missing");
    await setUserRole(adminCtx.session.user.id, "admin");
    adminClient = createTestClient(await createTestContext(adminRes.cookie));

    async function setupStudent(email: string, name: string) {
      const res = await signUpAndSignIn(email, "Test1234!", name);
      const client = createTestClient(await createTestContext(res.cookie));
      const ctx = await createTestContext(res.cookie);
      if (ctx.session?.user) {
        await creditWallet(ctx.session.user.id, 200);
      }
      return { client, userId: ctx.session?.user.id! };
    }

    const s1 = await setupStudent(
      `student1.g14.${ts}@cogito.test`,
      "Student G14 One",
    );
    student1Client = s1.client;
    student1Id = s1.userId;
    const s2 = await setupStudent(
      `student2.g14.${ts}@cogito.test`,
      "Student G14 Two",
    );
    student2Client = s2.client;

    const t1 = await createPublishedTutor(
      `tutor1.g14.${ts}@cogito.test`,
      ts,
      "Prof G14 One",
    );
    tutor1Id = t1.tutorId;
    slot1Id = t1.slotId;
    tutor1Client = createTestClient(await createTestContext(t1.cookie));
    const t2 = await createPublishedTutor(
      `tutor2.g14.${ts}@cogito.test`,
      ts,
      "Prof G14 Two",
    );
    tutor2Id = t2.tutorId;
    slot2Id = t2.slotId;
    tutor2Client = createTestClient(await createTestContext(t2.cookie));
  });

  test("admin creates three rooms", async () => {
    const a = await adminClient.room.create({
      name: "Sesi A",
      location: "Lantai 1",
      capacity: 10,
    });
    roomAId = a.id;
    const b = await adminClient.room.create({
      name: "Sesi B",
      location: "Lantai 2",
      capacity: 12,
    });
    roomBId = b.id;
    const c = await adminClient.room.create({
      name: "Sesi C",
      location: "Lantai 3",
      capacity: 14,
    });
    roomCId = c.id;
  });

  test("two offline bookings accepted", async () => {
    const b1 = await student1Client.booking.createSolo({
      tutorId: tutor1Id,
      availabilitySlotId: slot1Id,
      modality: "offline",
      scheduledStartAt: startISO,
      scheduledEndAt: endISO,
      timezone: "Asia/Jakarta",
    });
    booking1Id = b1.id;
    const accepted1 = await tutor1Client.tutorActions.acceptBooking({
      bookingId: booking1Id,
    });
    expect(accepted1.currentState).toBe("awaiting_admin_room_approval");

    const b2 = await student2Client.booking.createSolo({
      tutorId: tutor2Id,
      availabilitySlotId: slot2Id,
      modality: "offline",
      scheduledStartAt: startISO,
      scheduledEndAt: endISO,
      timezone: "Asia/Jakarta",
    });
    booking2Id = b2.id;
    const accepted2 = await tutor2Client.tutorActions.acceptBooking({
      bookingId: booking2Id,
    });
    expect(accepted2.currentState).toBe("awaiting_admin_room_approval");
  });

  test("admin assigns room A to booking1 → confirmed and booking moves to scheduled", async () => {
    const rb = await adminClient.room.assign({
      bookingId: booking1Id,
      roomId: roomAId,
      startAt: startISO,
      endAt: endISO,
    });
    expect(rb.status).toBe("confirmed");

    const rows = await listRoomBookings(booking1Id);
    expect(rows.length).toBe(1);
    expect(rows[0]!.roomId).toBe(roomAId);
    expect(rows[0]!.status).toBe("confirmed");

    const booking = await student1Client.booking.get({ bookingId: booking1Id });
    expect(booking.currentState).toBe("scheduled");
    expect(booking.scheduledEndAt.toISOString()).toBe(endISO);
  });

  test("admin assigns room B to booking2 → confirmed and booking moves to scheduled", async () => {
    const rb = await adminClient.room.assign({
      bookingId: booking2Id,
      roomId: roomBId,
      startAt: startISO,
      endAt: endISO,
    });
    expect(rb.status).toBe("confirmed");

    const booking = await student2Client.booking.get({ bookingId: booking2Id });
    expect(booking.currentState).toBe("scheduled");
  });

  test("relocate booking2 into occupied room A is rejected", async () => {
    await expect(
      adminClient.room.relocate({
        bookingId: booking2Id,
        roomId: roomAId,
        startAt: startISO,
        endAt: endISO,
      }),
    ).rejects.toThrow(/already booked/i);

    const rows = await listRoomBookings(booking2Id);
    expect(rows.length).toBe(1);
    expect(rows[0]!.status).toBe("confirmed");
    expect(rows[0]!.roomId).toBe(roomBId);
  });

  test("relocate booking1 to room C succeeds → room A freed", async () => {
    const rb = await adminClient.room.relocate({
      bookingId: booking1Id,
      roomId: roomCId,
      startAt: startISO,
      endAt: endISO,
    });
    expect(rb.status).toBe("confirmed");
    expect(rb.roomId).toBe(roomCId);

    const rows = await listRoomBookings(booking1Id);
    expect(rows.length).toBe(2);
    const oldRow = rows.find((r) => r.roomId === roomAId);
    const newRow = rows.find((r) => r.roomId === roomCId);
    expect(oldRow!.status).toBe("relocated");
    expect(newRow!.status).toBe("confirmed");
  });

  test("offline room assign/relocate write in-app+email notifications to tutor and student (P1-3)", async () => {
    const notifs = await db
      .select()
      .from(notification)
      .where(eq(notification.bookingId, booking1Id));
    const titles = notifs.map((n) => n.title);
    expect(titles).toContain("Offline session confirmed");
    expect(titles).toContain("Offline session relocated");

    const recipients = [...new Set(notifs.map((n) => n.userId))];
    expect(recipients).toContain(tutor1Id);
    expect(recipients).toContain(student1Id);

    const dispatchEligible = notifs.filter((n) => n.severity === "action");
    expect(dispatchEligible.length).toBeGreaterThan(0);
  });

  test("admin cancels booking2 room → booking continues without room", async () => {
    const rb = await adminClient.room.cancelBooking({ bookingId: booking2Id });
    expect(rb.status).toBe("cancelled");

    const rows = await listRoomBookings(booking2Id);
    const active = rows.find((r) => r.status !== "cancelled");
    expect(active).toBeUndefined();

    const booking = await student2Client.booking.get({ bookingId: booking2Id });
    expect(booking.currentState).toBe("scheduled");
  });

  test("G14 regression: cancel after relocate leaves no active row; second cancel and relocate are rejected", async () => {
    const rb = await adminClient.room.cancelBooking({ bookingId: booking1Id });
    expect(rb.status).toBe("cancelled");

    const rows = await listRoomBookings(booking1Id);
    const active = rows.find((r) => r.status === "confirmed");
    expect(active).toBeUndefined();

    await expect(
      adminClient.room.cancelBooking({ bookingId: booking1Id }),
    ).rejects.toThrow(/no active room assignment/i);

    await expect(
      adminClient.room.relocate({
        bookingId: booking1Id,
        roomId: roomCId,
        startAt: startISO,
        endAt: endISO,
      }),
    ).rejects.toThrow(/no active room assignment/i);
  });
});
