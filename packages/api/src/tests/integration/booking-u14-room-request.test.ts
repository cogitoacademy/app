import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  wallet,
  tutorInvite,
  tutorProfile,
  availabilitySlot,
  roomBooking,
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
): Promise<{ tutorId: string; slotId: string }> {
  await signUpAndSignIn(email, "Test1234!", "Tutor U14");
  const tutorCtx = await createTestContext(
    (await signInAndGetCookie(email, "Test1234!")) ?? "",
  );
  if (!tutorCtx.session?.user) throw new Error("Tutor session missing");
  const tutorId = tutorCtx.session.user.id;
  await setUserRole(tutorId, "tutor");

  const [invite] = await db
    .insert(tutorInvite)
    .values({
      email,
      displayName: "Prof U14",
      token: `token-u14-${ts}`,
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
      displayName: "Prof U14",
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

  const start = new Date(Date.now() + 24 * 3600_000);
  const [slot] = await db
    .insert(availabilitySlot)
    .values({
      tutorId,
      startDate: start,
      endDate: new Date(start.getTime() + 6 * 3600_000),
      modality: "both",
    })
    .returning();

  return { tutorId, slotId: slot!.id };
}

describe("U14: room availability integrated into offline booking creation (FR-22/TC-20)", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();
  // Distinct slots per test: the createSolo idempotency key includes
  // user/tutor/start/end, so same-slot bookings would collide on the cache.
  const t1Start = new Date(Date.now() + 48 * 3600_000).toISOString();
  const t1End = new Date(Date.now() + 49 * 3600_000).toISOString();
  const t2Start = new Date(Date.now() + 54 * 3600_000).toISOString();
  const t2End = new Date(Date.now() + 55 * 3600_000).toISOString();
  const t3Start = new Date(Date.now() + 60 * 3600_000).toISOString();
  const t3End = new Date(Date.now() + 61 * 3600_000).toISOString();

  let adminClient: TestClient;
  let studentClient: TestClient;
  let studentId: string;
  let slotId: string;
  let roomAId: string;

  beforeAll(async () => {
    const adminRes = await signUpAndSignIn(
      `admin.u14.${ts}@cogito.test`,
      "Test1234!",
      "Admin U14",
    );
    const adminCtx = await createTestContext(adminRes.cookie);
    if (!adminCtx.session?.user) throw new Error("Admin session missing");
    await setUserRole(adminCtx.session.user.id, "admin");
    adminClient = createTestClient(await createTestContext(adminRes.cookie));

    const studentRes = await signUpAndSignIn(
      `student.u14.${ts}@cogito.test`,
      "Test1234!",
      "Student U14",
    );
    studentClient = createTestClient(
      await createTestContext(studentRes.cookie),
    );
    const studentCtx = await createTestContext(studentRes.cookie);
    if (!studentCtx.session?.user) throw new Error("Student session missing");
    studentId = studentCtx.session.user.id;
    await creditWallet(studentId, 200);

    const tutor = await createPublishedTutor(`tutor.u14.${ts}@cogito.test`, ts);
    slotId = tutor.slotId;

    const roomA = await adminClient.room.create({
      name: "Ruang U14 A",
      location: "Lantai 1",
      capacity: 10,
    });
    roomAId = roomA.id;
  });

  test("U14: offline booking with a free requested room creates a requested room booking", async () => {
    const b = await studentClient.booking.createSolo({
      tutorId: (await db.select().from(tutorProfile).limit(1))[0]!.userId,
      availabilitySlotId: slotId,
      modality: "offline",
      scheduledStartAt: t1Start,
      scheduledEndAt: t1End,
      timezone: "Asia/Jakarta",
      requestedRoomId: roomAId,
    });

    expect(b.roomRequested).toBe(true);
    expect(b.roomConflict).toBe(false);

    const rows = await db
      .select()
      .from(roomBooking)
      .where(eq(roomBooking.bookingId, b.id));
    expect(rows.length).toBe(1);
    expect(rows[0]!.roomId).toBe(roomAId);
    expect(rows[0]!.status).toBe("requested");
  });

  test("U14: offline booking with a taken room proceeds without room and flags the conflict", async () => {
    // Occupy room A for the same slot via the admin assign flow.
    const firstBooking = await studentClient.booking.createSolo({
      tutorId: (await db.select().from(tutorProfile).limit(1))[0]!.userId,
      availabilitySlotId: slotId,
      modality: "offline",
      scheduledStartAt: t2Start,
      scheduledEndAt: t2End,
      timezone: "Asia/Jakarta",
    });
    // Occupy room A for the t3 window (assign accepts arbitrary times).
    await adminClient.room.assign({
      bookingId: firstBooking.id,
      roomId: roomAId,
      startAt: t3Start,
      endAt: t3End,
    });

    const b = await studentClient.booking.createSolo({
      tutorId: (await db.select().from(tutorProfile).limit(1))[0]!.userId,
      availabilitySlotId: slotId,
      modality: "offline",
      scheduledStartAt: t3Start,
      scheduledEndAt: t3End,
      timezone: "Asia/Jakarta",
      requestedRoomId: roomAId,
    });

    // The booking proceeds normally (offline bookings start awaiting tutor
    // review, then await admin room approval) — without a room request — and
    // the response surfaces the conflict.
    expect(b.roomRequested).toBe(false);
    expect(b.roomConflict).toBe(true);
    expect(b.currentState).toBe("awaiting_tutor_review");

    const rows = await db
      .select()
      .from(roomBooking)
      .where(eq(roomBooking.bookingId, b.id));
    expect(rows.length).toBe(0);
  });

  test("U14: requestedRoomId is rejected for online bookings", async () => {
    await expect(
      studentClient.booking.createSolo({
        tutorId: (await db.select().from(tutorProfile).limit(1))[0]!.userId,
        availabilitySlotId: slotId,
        modality: "online",
        scheduledStartAt: t1Start,
        scheduledEndAt: t1End,
        timezone: "Asia/Jakarta",
        requestedRoomId: roomAId,
      }),
    ).rejects.toThrow(/validation/i);
  });
});
