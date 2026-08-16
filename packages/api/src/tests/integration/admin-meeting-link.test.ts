import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  wallet,
  tutorInvite,
  tutorProfile,
  availabilitySlot,
  meetingEvent,
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
): Promise<{ tutorId: string; slotId: string }> {
  await signUpAndSignIn(email, "Test1234!", "Tutor U1");
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
      displayName: "Prof U1",
      token: `token-u1-${ts}`,
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
      displayName: "Prof U1",
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
      endDate: new Date(start.getTime() + 240 * 3600_000),
      modality: "both",
    })
    .returning();

  return { tutorId, slotId: slot!.id };
}

describe("U1: admin manual meeting-link entry (FR-21/TC-36)", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();
  const MEET_URL = "https://meet.example.com/manual-abc123";

  let adminClient: TestClient;
  let studentClient: TestClient;
  let tutorClient: TestClient;
  let slotId: string;
  let bookedId: string;

  beforeAll(async () => {
    const adminRes = await signUpAndSignIn(
      `admin.u1.${ts}@cogito.test`,
      "Test1234!",
      "Admin U1",
    );
    const adminCtx = await createTestContext(adminRes.cookie);
    if (!adminCtx.session?.user) throw new Error("Admin session missing");
    await setUserRole(adminCtx.session.user.id, "admin");
    adminClient = createTestClient(await createTestContext(adminRes.cookie));

    const studentRes = await signUpAndSignIn(
      `student.u1.${ts}@cogito.test`,
      "Test1234!",
      "Student U1",
    );
    studentClient = createTestClient(
      await createTestContext(studentRes.cookie),
    );
    const studentCtx = await createTestContext(studentRes.cookie);
    if (studentCtx.session?.user) {
      await creditWallet(studentCtx.session.user.id, 200);
    }

    const tutor = await createPublishedTutor(`tutor.u1.${ts}@cogito.test`, ts);
    slotId = tutor.slotId;
    tutorClient = createTestClient(
      await createTestContext(
        (await signInAndGetCookie(`tutor.u1.${ts}@cogito.test`, "Test1234!")) ??
          "",
      ),
    );
  });

  test("U1: admin pastes a URL on a SCHEDULED booking → meetingEvent updated + participants notified", async () => {
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
    bookedId = b.id;

    // Test env uses the fallback (manual) provider: the booking is SCHEDULED
    // with a url-less manual row — the U1 precondition.
    await tutorClient.tutorActions.acceptBooking({ bookingId: b.id });

    const result = await adminClient.adminBooking.setMeetingLink({
      bookingId: b.id,
      url: MEET_URL,
    });
    expect(result.meetingUrl).toBe(MEET_URL);

    const rows = await db
      .select()
      .from(meetingEvent)
      .where(eq(meetingEvent.bookingId, b.id));
    const active = rows.find((r) => r.status === "created");
    expect(active).toBeDefined();
    expect(active!.provider).toBe("manual");
    expect(active!.meetingUrl).toBe(MEET_URL);

    // The booking GET surfaces the link as ready.
    const fetched = await studentClient.booking.get({ bookingId: b.id });
    expect(fetched.meetingStatus).toBe("ready");
    expect(fetched.meetingUrl).toBe(MEET_URL);

    // Participants are notified (matrix row "Online meeting link created").
    const notifs = await db
      .select()
      .from(notification)
      .where(eq(notification.bookingId, b.id));
    expect(notifs.some((n) => n.title === "Meeting link ready")).toBe(true);
  });

  test("U1: invalid URL is rejected by zod", async () => {
    await expect(
      adminClient.adminBooking.setMeetingLink({
        bookingId: bookedId,
        url: "not-a-url",
      }),
    ).rejects.toThrow(/validation/i);
  });

  test("U1: link cannot be set before the booking is scheduled", async () => {
    const start = new Date(Date.now() + 72 * 3600_000).toISOString();
    const end = new Date(Date.now() + 73 * 3600_000).toISOString();
    const b = await studentClient.booking.createSolo({
      tutorId: (await db.select().from(tutorProfile).limit(1))[0]!.userId,
      availabilitySlotId: slotId,
      modality: "online",
      scheduledStartAt: start,
      scheduledEndAt: end,
      timezone: "Asia/Jakarta",
    });

    await expect(
      adminClient.adminBooking.setMeetingLink({
        bookingId: b.id,
        url: MEET_URL,
      }),
    ).rejects.toThrow(/editable/i);
  });
});
