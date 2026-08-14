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
  await signUpAndSignIn(email, "Test1234!", "Tutor Meet Lifecycle");
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
      displayName: "Prof Meet Lifecycle",
      token: `token-ml-${ts}`,
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
      displayName: "Prof Meet Lifecycle",
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

async function getMeetingStatus(bookingId: string) {
  const [row] = await db
    .select({ status: meetingEvent.status })
    .from(meetingEvent)
    .where(eq(meetingEvent.bookingId, bookingId));
  return row?.status ?? null;
}

describe("OQ-05: meeting event lifecycle follows the booking state", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();
  const studentEmail = `student.ml.${ts}@cogito.test`;
  const tutorEmail = `tutor.ml.${ts}@cogito.test`;
  let studentClient: TestClient;
  let tutorClient: TestClient;
  let slotId: string;
  let bookingId: string;

  beforeAll(async () => {
    const studentRes = await signUpAndSignIn(
      studentEmail,
      "Test1234!",
      "Student Meet Lifecycle",
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

  test("tutor accept creates a meeting row for the booking", async () => {
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

    await tutorClient.tutorActions.acceptBooking({ bookingId });

    // Test env uses the fallback (manual) provider.
    expect(await getMeetingStatus(bookingId)).toBe("manual");
  });

  test("cancelling the booking marks the meeting event cancelled (no leaked event)", async () => {
    await studentClient.booking.cancel({ bookingId });

    expect(await getMeetingStatus(bookingId)).toBe("cancelled");

    const fetched = await studentClient.booking.get({ bookingId });
    expect(fetched.currentState).toBe("cancelled");
    expect(fetched.meetingStatus).toBe("pending");
    expect(fetched.meetingUrl).toBeNull();
  });
});
