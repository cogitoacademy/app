import { describe, test, expect, beforeAll } from "bun:test";
import { eq, and } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  wallet,
  tutorInvite,
  tutorProfile,
  availabilitySlot,
  room,
  roomBooking,
  booking,
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
): Promise<{ tutorId: string; tutorClient: TestClient; slotId: string }> {
  await signUpAndSignIn(email, "Test1234!", "Tutor Room");
  const tutorCookie = await signInAndGetCookie(email, "Test1234!");
  const tutorCtx = await createTestContext(tutorCookie ?? "");
  if (!tutorCtx.session?.user) throw new Error("Tutor session missing");
  const tutorId = tutorCtx.session.user.id;
  await setUserRole(tutorId, "tutor");

  const [invite] = await db
    .insert(tutorInvite)
    .values({
      email,
      displayName: "Prof Room",
      token: `token-room-${ts}`,
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
      displayName: "Prof Room",
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
    .values({
      tutorId,
      startDate: start,
      endDate: end,
      modality: "both",
    })
    .returning();

  return {
    tutorId,
    tutorClient: createTestClient(await createTestContext(tutorCookie ?? "")),
    slotId: slot!.id,
  };
}

describe("Room assignment flow", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();
  const adminEmail = `admin.room.${ts}@cogito.test`;
  const student1Email = `student.room1.${ts}@cogito.test`;
  const student2Email = `student.room2.${ts}@cogito.test`;
  const tutor1Email = `tutor.room1.${ts}@cogito.test`;
  const tutor2Email = `tutor.room2.${ts}@cogito.test`;

  let adminClient: TestClient;
  let student1Client: TestClient;
  let student2Client: TestClient;
  let tutor1Client: TestClient;
  let tutor2Client: TestClient;
  let tutor1Id: string;
  let tutor2Id: string;
  let roomId: string;
  let booking1Id: string;
  let booking2Id: string;

  const startISO = new Date(Date.now() + 24 * 3600_000).toISOString();
  const endISO = new Date(Date.now() + 25 * 3600_000).toISOString();

  beforeAll(async () => {
    const adminRes = await signUpAndSignIn(
      adminEmail,
      "Test1234!",
      "Admin Room",
    );
    const adminCtx = await createTestContext(adminRes.cookie);
    if (!adminCtx.session?.user) throw new Error("Admin session missing");
    await setUserRole(adminCtx.session.user.id, "admin");
    adminClient = createTestClient(await createTestContext(adminRes.cookie));

    const student1Res = await signUpAndSignIn(
      student1Email,
      "Test1234!",
      "Student Room1",
    );
    student1Client = createTestClient(
      await createTestContext(student1Res.cookie),
    );
    const student1Ctx = await createTestContext(student1Res.cookie);
    if (student1Ctx.session?.user) {
      await creditWallet(student1Ctx.session.user.id, 200);
    }

    const student2Res = await signUpAndSignIn(
      student2Email,
      "Test1234!",
      "Student Room2",
    );
    student2Client = createTestClient(
      await createTestContext(student2Res.cookie),
    );
    const student2Ctx = await createTestContext(student2Res.cookie);
    if (student2Ctx.session?.user) {
      await creditWallet(student2Ctx.session.user.id, 200);
    }

    const tutor1 = await createPublishedTutor(tutor1Email, ts);
    tutor1Id = tutor1.tutorId;
    tutor1Client = tutor1.tutorClient;

    const tutor2 = await createPublishedTutor(tutor2Email, ts + 1000);
    tutor2Id = tutor2.tutorId;
    tutor2Client = tutor2.tutorClient;
  });

  test("admin creates a room", async () => {
    const r = await adminClient.room.create({
      name: "Sesi A",
      location: "Lantai 2",
      capacity: 12,
    });
    expect(r.id).toBeDefined();
    expect(r.isActive).toBe(true);
    roomId = r.id;

    const [row] = await db.select().from(room).where(eq(room.id, roomId));
    expect(row).toBeDefined();
    expect(row!.name).toBe("Sesi A");
    expect(row!.capacity).toBe(12);
  });

  test("student1 creates an offline booking → awaiting_tutor_review", async () => {
    const b = await student1Client.booking.createSolo({
      tutorId: tutor1Id,
      availabilitySlotId: (
        await db
          .select()
          .from(availabilitySlot)
          .where(eq(availabilitySlot.tutorId, tutor1Id))
          .limit(1)
      )[0]!.id,
      modality: "offline",
      scheduledStartAt: startISO,
      scheduledEndAt: endISO,
      timezone: "Asia/Jakarta",
    });
    booking1Id = b.id;
    expect(b.currentState).toBe("awaiting_tutor_review");
    expect(b.holdAmount).toBeGreaterThan(0);
  });

  test("tutor1 accepts offline booking → awaiting_admin_room_approval", async () => {
    const updated = await tutor1Client.tutorActions.acceptBooking({
      bookingId: booking1Id,
    });
    expect(updated.currentState).toBe("awaiting_admin_room_approval");
  });

  test("student2 creates a second offline booking with the same slot", async () => {
    const b = await student2Client.booking.createSolo({
      tutorId: tutor2Id,
      availabilitySlotId: (
        await db
          .select()
          .from(availabilitySlot)
          .where(eq(availabilitySlot.tutorId, tutor2Id))
          .limit(1)
      )[0]!.id,
      modality: "offline",
      scheduledStartAt: startISO,
      scheduledEndAt: endISO,
      timezone: "Asia/Jakarta",
    });
    booking2Id = b.id;
    expect(b.currentState).toBe("awaiting_tutor_review");
  });

  test("tutor2 accepts offline booking → awaiting_admin_room_approval", async () => {
    const updated = await tutor2Client.tutorActions.acceptBooking({
      bookingId: booking2Id,
    });
    expect(updated.currentState).toBe("awaiting_admin_room_approval");
  });

  test("admin assigns room to booking1 → roomBooking row confirmed", async () => {
    const rb = await adminClient.room.assign({
      bookingId: booking1Id,
      roomId,
      startAt: startISO,
      endAt: endISO,
    });
    expect(rb.status).toBe("confirmed");

    const rows = await db
      .select()
      .from(roomBooking)
      .where(
        and(
          eq(roomBooking.roomId, roomId),
          eq(roomBooking.bookingId, booking1Id),
        ),
      );
    expect(rows.length).toBe(1);
    expect(rows[0]!.status).toBe("confirmed");
    expect(rows[0]!.startAt.toISOString()).toBe(startISO);
    expect(rows[0]!.endAt.toISOString()).toBe(endISO);
  });

  test("conflicting assign to overlapping slot is rejected", async () => {
    await expect(
      adminClient.room.assign({
        bookingId: booking2Id,
        roomId,
        startAt: startISO,
        endAt: endISO,
      }),
    ).rejects.toThrow(/already booked/i);

    const [booking2Row] = await db
      .select()
      .from(booking)
      .where(eq(booking.id, booking2Id));
    expect(booking2Row).toBeDefined();
    expect(booking2Row!.currentState).toBe("awaiting_admin_room_approval");

    const conflicting = await db
      .select()
      .from(roomBooking)
      .where(eq(roomBooking.bookingId, booking2Id));
    expect(conflicting.length).toBe(0);
  });
});
