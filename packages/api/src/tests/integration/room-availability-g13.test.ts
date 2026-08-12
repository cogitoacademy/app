import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  wallet,
  tutorInvite,
  tutorProfile,
  availabilitySlot,
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
  await signUpAndSignIn(email, "Test1234!", "Tutor Avail G13");
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
      displayName: "Prof Avail G13",
      token: `token-avail13-${ts}`,
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
      displayName: "Prof Avail G13",
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

  return { tutorId, slotId: slot!.id };
}

describe("G13 offline room availability", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();
  const adminEmail = `admin.avail.${ts}@cogito.test`;
  const studentEmail = `student.avail.${ts}@cogito.test`;
  const tutorEmail = `tutor.avail.${ts}@cogito.test`;

  let adminClient: TestClient;
  let studentClient: TestClient;
  let tutorClient: TestClient;
  let tutorId: string;
  let slotId: string;
  let roomId: string;
  let bookingId: string;

  const startISO = new Date(Date.now() + 24 * 3600_000).toISOString();
  const endISO = new Date(Date.now() + 25 * 3600_000).toISOString();
  const earlierStartISO = new Date(Date.now() + 20 * 3600_000).toISOString();
  const earlierEndISO = new Date(Date.now() + 21 * 3600_000).toISOString();

  beforeAll(async () => {
    const adminRes = await signUpAndSignIn(
      adminEmail,
      "Test1234!",
      "Admin Avail",
    );
    const adminCtx = await createTestContext(adminRes.cookie);
    if (!adminCtx.session?.user) throw new Error("Admin session missing");
    await setUserRole(adminCtx.session.user.id, "admin");
    adminClient = createTestClient(await createTestContext(adminRes.cookie));

    const studentRes = await signUpAndSignIn(
      studentEmail,
      "Test1234!",
      "Student Avail",
    );
    studentClient = createTestClient(
      await createTestContext(studentRes.cookie),
    );
    const studentCtx = await createTestContext(studentRes.cookie);
    if (studentCtx.session?.user) {
      await creditWallet(studentCtx.session.user.id, 200);
    }

    const tutorData = await createPublishedTutor(tutorEmail, ts);
    tutorId = tutorData.tutorId;
    slotId = tutorData.slotId;
    const tutorCookie = await signInAndGetCookie(tutorEmail, "Test1234!");
    tutorClient = createTestClient(await createTestContext(tutorCookie));
  });

  test("admin creates a room", async () => {
    const r = await adminClient.room.create({
      name: "Sesi B",
      location: "Lantai 1",
      capacity: 8,
    });
    expect(r.id).toBeDefined();
    roomId = r.id;
  });

  test("student creates offline booking and tutor accepts", async () => {
    const b = await studentClient.booking.createSolo({
      tutorId,
      availabilitySlotId: slotId,
      modality: "offline",
      scheduledStartAt: startISO,
      scheduledEndAt: endISO,
      timezone: "Asia/Jakarta",
    });
    bookingId = b.id;

    const updated = await tutorClient.tutorActions.acceptBooking({
      bookingId,
    });
    expect(updated.currentState).toBe("awaiting_admin_room_approval");
  });

  test("admin assigns room → slot is now occupied", async () => {
    const rb = await adminClient.room.assign({
      bookingId,
      roomId,
      startAt: startISO,
      endAt: endISO,
    });
    expect(rb.status).toBe("confirmed");
  });

  test("overlapping slot reports unavailable", async () => {
    const res = await studentClient.room.checkAvailability({
      roomId,
      startAt: startISO,
      endAt: endISO,
    });
    expect(res.available).toBe(false);
  });

  test("free slot reports available", async () => {
    const res = await studentClient.room.checkAvailability({
      roomId,
      startAt: earlierStartISO,
      endAt: earlierEndISO,
    });
    expect(res.available).toBe(true);
  });
});
