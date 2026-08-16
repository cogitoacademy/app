import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  wallet,
  tutorInvite,
  tutorProfile,
  availabilitySlot,
  meetingEvent,
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
  await signUpAndSignIn(email, "Test1234!", "Tutor Meet G11");
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
      displayName: "Prof Meet G11",
      token: `token-meet11-${ts}`,
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
      displayName: "Prof Meet G11",
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

  return { tutorId, slotId: slot!.id };
}

describe("G11 meeting link visibility gating", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();
  const studentEmail = `student.meet11.${ts}@cogito.test`;
  const tutorEmail = `tutor.meet11.${ts}@cogito.test`;
  let studentClient: TestClient;
  let tutorClient: TestClient;
  let slotId: string;
  let bookingId: string;

  beforeAll(async () => {
    const studentRes = await signUpAndSignIn(
      studentEmail,
      "Test1234!",
      "Student Meet G11",
    );
    studentClient = createTestClient(
      await createTestContext(studentRes.cookie),
    );
    const studentCtx = await createTestContext(studentRes.cookie);
    if (studentCtx.session?.user) {
      await creditWallet(studentCtx.session.user.id, 200);
    }

    const tutorData = await createPublishedTutor(tutorEmail, ts);
    slotId = tutorData.slotId;
    const tutorCookie = await signInAndGetCookie(tutorEmail, "Test1234!");
    tutorClient = createTestClient(await createTestContext(tutorCookie));
  });

  test("before tutor accept, booking GET reports pending meeting with no url", async () => {
    const start = new Date(Date.now() + 48 * 3600_000).toISOString();
    const end = new Date(Date.now() + 49 * 3600_000).toISOString();

    const b = await studentClient.booking.createSolo({
      tutorId: (await db.select().from(tutorProfile).limit(1))[0]!.userId,
      availabilitySlotId: slotId,
      modality: "online",
      scheduledStartAt: start,
      scheduledEndAt: end,
      timezone: "Asia/Jakarta",
    });
    bookingId = b.id;
    expect(b.currentState).toBe("awaiting_tutor_review");

    const fetched = await studentClient.booking.get({ bookingId });
    expect(fetched.meetingStatus).toBe("pending");
    expect(fetched.meetingUrl).toBeNull();
    expect(fetched.meeting).toBeNull();
  });

  test("after tutor accept, meetingEvent row exists and status surfaces", async () => {
    const updated = await tutorClient.tutorActions.acceptBooking({ bookingId });
    expect(updated.currentState).toBe("scheduled");

    const [meetingRow] = await db
      .select()
      .from(meetingEvent)
      .where(eq(meetingEvent.bookingId, bookingId));
    expect(meetingRow).toBeDefined();

    const fetched = await studentClient.booking.get({ bookingId });
    expect(fetched.meeting?.id).toBe(meetingRow!.id);
    // Fallback provider creates a manual meeting (no link) in test env.
    expect(fetched.meetingStatus).toBe("pending");
    expect(fetched.meetingUrl).toBeNull();
  });

  test("created meeting row with url maps to ready + url", async () => {
    await db
      .update(meetingEvent)
      .set({ status: "created", meetingUrl: "https://meet.google.com/g11" })
      .where(eq(meetingEvent.bookingId, bookingId));

    const fetched = await studentClient.booking.get({ bookingId });
    expect(fetched.meetingStatus).toBe("ready");
    expect(fetched.meetingUrl).toBe("https://meet.google.com/g11");
  });

  test("failed meeting row maps to failed with no url", async () => {
    await db
      .update(meetingEvent)
      .set({ status: "failed", meetingUrl: null })
      .where(eq(meetingEvent.bookingId, bookingId));

    const fetched = await studentClient.booking.get({ bookingId });
    expect(fetched.meetingStatus).toBe("failed");
    expect(fetched.meetingUrl).toBeNull();
  });

  test("stale failed row does not flip meeting status when a newer manual row exists (G12 regression)", async () => {
    await db.delete(meetingEvent).where(eq(meetingEvent.bookingId, bookingId));

    const [failedRow] = await db
      .insert(meetingEvent)
      .values({
        bookingId,
        provider: "google_meet",
        status: "failed",
        errorReason: "Error: Google API error",
        meetingUrl: null,
        externalEventId: null,
        createdAt: new Date(Date.now() - 60_000),
      })
      .returning();
    expect(failedRow).toBeDefined();

    const [manualRow] = await db
      .insert(meetingEvent)
      .values({
        bookingId,
        provider: "manual",
        status: "manual",
        meetingUrl: null,
        externalEventId: null,
      })
      .returning();
    expect(manualRow).toBeDefined();

    const fetched = await studentClient.booking.get({ bookingId });
    expect(fetched.meeting?.id).toBe(manualRow!.id);
    expect(fetched.meetingStatus).toBe("pending");
    expect(fetched.meetingUrl).toBeNull();
  });
});
