import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  wallet,
  tutorInvite,
  tutorProfile,
  availabilitySlot,
  notification as notificationTable,
  notificationDispatch,
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

async function createPublishedTutor(email: string, ts: number) {
  const res = await signUpAndSignIn(email, "Test1234!", "Prof Notif");
  const signupCtx = await createTestContext(res.cookie);
  const tutorId = signupCtx.session!.user.id;
  await setUserRole(tutorId, "tutor");

  const tutorCookie = await signInAndGetCookie(email, "Test1234!");
  const tutorClient = createTestClient(await createTestContext(tutorCookie ?? ""));

  const [invite] = await db
    .insert(tutorInvite)
    .values({
      email,
      displayName: "Prof Notif",
      token: `token-notif-${ts}`,
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
      displayName: "Prof Notif",
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

  return { tutorId, tutorClient, slotId: slot!.id };
}

describe("Notification email matrix (G17)", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();
  const studentEmail = `student.notifmail.${ts}@cogito.test`;
  const tutorEmail = `tutor.notifmail.${ts}@cogito.test`;

  let studentClient: TestClient;
  let tutorClient: TestClient;
  let studentId: string;
  let tutorId: string;
  let slotId: string;
  let bookingId: string;

  beforeAll(async () => {
    const studentRes = await signUpAndSignIn(
      studentEmail,
      "Test1234!",
      "Student NotifMail",
    );
    studentClient = createTestClient(await createTestContext(studentRes.cookie));
    const studentCtx = await createTestContext(studentRes.cookie);
    studentId = studentCtx.session!.user.id;
    await creditWallet(studentId, 500);

    const tutorData = await createPublishedTutor(tutorEmail, ts);
    tutorId = tutorData.tutorId;
    tutorClient = tutorData.tutorClient;
    slotId = tutorData.slotId;
  });

  test("booking request → tutor notification row + email dispatch row", async () => {
    const start = new Date(Date.now() + 48 * 3600_000).toISOString();
    const end = new Date(Date.now() + 49 * 3600_000).toISOString();

    const b = await studentClient.booking.createSolo({
      tutorId,
      availabilitySlotId: slotId,
      modality: "online",
      scheduledStartAt: start,
      scheduledEndAt: end,
      timezone: "Asia/Jakarta",
    });
    bookingId = b.id;

    const [notif] = await db
      .select()
      .from(notificationTable)
      .where(eq(notificationTable.eventKey, `booking.${bookingId}.tutor_request`));
    expect(notif).toBeDefined();
    expect(notif!.severity).toBe("action");

    const [dispatch] = await db
      .select()
      .from(notificationDispatch)
      .where(eq(notificationDispatch.notificationId, notif!.id));
    expect(dispatch).toBeDefined();
    expect(dispatch!.channel).toBe("email");
    expect(dispatch!.recipientEmail).toBe(tutorEmail);
  });

  test("booking accept → student notification row + email dispatch row", async () => {
    await tutorClient.tutorActions.acceptBooking({ bookingId });

    const [notif] = await db
      .select()
      .from(notificationTable)
      .where(eq(notificationTable.eventKey, `booking.${bookingId}.accepted`));
    expect(notif).toBeDefined();
    expect(notif!.userId).toBe(studentId);
    expect(notif!.severity).toBe("action");

    const [dispatch] = await db
      .select()
      .from(notificationDispatch)
      .where(eq(notificationDispatch.notificationId, notif!.id));
    expect(dispatch).toBeDefined();
    expect(dispatch!.recipientEmail).toBe(studentEmail);

    const [tutorScheduled] = await db
      .select()
      .from(notificationTable)
      .where(
        eq(notificationTable.eventKey, `booking.${bookingId}.scheduled.tutor`),
      );
    expect(tutorScheduled).toBeDefined();
    const [tutorDispatch] = await db
      .select()
      .from(notificationDispatch)
      .where(eq(notificationDispatch.notificationId, tutorScheduled!.id));
    expect(tutorDispatch).toBeDefined();
    expect(tutorDispatch!.recipientEmail).toBe(tutorEmail);
  });

  test("achievement submit → in-app notification row, NO email dispatch row", async () => {
    const created = await studentClient.achievement.create({
      eventName: "Math Olympiad",
      category: "academic",
      award: "Gold",
      level: "national",
      description: "Won gold in the national olympiad",
    });

    const [notif] = await db
      .select()
      .from(notificationTable)
      .where(eq(notificationTable.eventKey, `achievement.${created.id}.submitted`));
    expect(notif).toBeDefined();
    expect(notif!.category).toBe("achievement");
    expect(notif!.severity).toBe("info");

    const dispatches = await db
      .select()
      .from(notificationDispatch)
      .where(eq(notificationDispatch.notificationId, notif!.id));
    expect(dispatches.length).toBe(0);
  });

  test("info-severity event (session completed) → in-app only, NO email dispatch row", async () => {
    await tutorClient.tutorActions.completeSession({ bookingId });

    const [notif] = await db
      .select()
      .from(notificationTable)
      .where(eq(notificationTable.eventKey, `booking.${bookingId}.completed`));
    expect(notif).toBeDefined();
    expect(notif!.severity).toBe("info");

    const dispatches = await db
      .select()
      .from(notificationDispatch)
      .where(eq(notificationDispatch.notificationId, notif!.id));
    expect(dispatches.length).toBe(0);
  });
});
