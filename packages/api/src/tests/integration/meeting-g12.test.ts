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
  await signUpAndSignIn(email, "Test1234!", "Tutor Meet G12");
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
      displayName: "Prof Meet G12",
      token: `token-meet12-${ts}`,
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
      displayName: "Prof Meet G12",
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

async function getMeetingAttendees(
  bookingId: string,
): Promise<string[] | null> {
  const [row] = await db
    .select({ attendeeEmails: meetingEvent.attendeeEmails })
    .from(meetingEvent)
    .where(eq(meetingEvent.bookingId, bookingId));
  return row?.attendeeEmails ?? null;
}

describe("G12 Google Meet attendee automation", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();

  describe("solo booking", () => {
    const studentEmail = `student.meet12s.${ts}@cogito.test`;
    const tutorEmail = `tutor.meet12s.${ts}@cogito.test`;
    let studentClient: TestClient;
    let tutorClient: TestClient;
    let slotId: string;
    let bookingId: string;

    beforeAll(async () => {
      const studentRes = await signUpAndSignIn(
        studentEmail,
        "Test1234!",
        "Student Meet G12S",
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

    test("tutor accept stores tutor + student emails as attendees", async () => {
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
      bookingId = b.id;

      await tutorClient.tutorActions.acceptBooking({ bookingId });

      const attendeeEmails = await getMeetingAttendees(bookingId);
      expect(attendeeEmails).toBeDefined();
      expect(attendeeEmails!.toSorted()).toEqual(
        [studentEmail, tutorEmail].toSorted(),
      );
    });
  });

  describe("group booking", () => {
    const proposerEmail = `student.meet12g.${ts}@cogito.test`;
    const inviteeEmail = `student.meet12g2.${ts}@cogito.test`;
    const tutorEmail = `tutor.meet12g.${ts}@cogito.test`;
    let proposerClient: TestClient;
    let inviteeClient: TestClient;
    let tutorClient: TestClient;
    let tutorId: string;
    let slotId: string;
    let inviteeId: string;
    let bookingId: string;

    beforeAll(async () => {
      const proposerRes = await signUpAndSignIn(
        proposerEmail,
        "Test1234!",
        "Proposer Meet G12G",
      );
      proposerClient = createTestClient(
        await createTestContext(proposerRes.cookie),
      );
      const proposerCtx = await createTestContext(proposerRes.cookie);
      if (proposerCtx.session?.user) {
        await creditWallet(proposerCtx.session.user.id, 300);
      }

      const inviteeRes = await signUpAndSignIn(
        inviteeEmail,
        "Test1234!",
        "Invitee Meet G12G",
      );
      inviteeClient = createTestClient(
        await createTestContext(inviteeRes.cookie),
      );
      const inviteeCtx = await createTestContext(inviteeRes.cookie);
      if (inviteeCtx.session?.user) {
        await creditWallet(inviteeCtx.session.user.id, 300);
        inviteeId = inviteeCtx.session.user.id;
      }

      const tutorData = await createPublishedTutor(tutorEmail, ts + 1);
      tutorId = tutorData.tutorId;
      slotId = tutorData.slotId;
      const tutorCookie = await signInAndGetCookie(tutorEmail, "Test1234!");
      tutorClient = createTestClient(await createTestContext(tutorCookie));
    });

    test("group with all confirmed — tutor accept stores tutor + all confirmed participants", async () => {
      const start = new Date(Date.now() + 72 * 3600_000).toISOString();
      const end = new Date(Date.now() + 73 * 3600_000).toISOString();

      const g = await proposerClient.booking.createGroup({
        tutorId,
        availabilitySlotId: slotId,
        modality: "online",
        targetGroupSize: 2,
        inviteeUserIds: [inviteeId],
        scheduledStartAt: start,
        scheduledEndAt: end,
        timezone: "Asia/Jakarta",
      });
      bookingId = g.id;

      await inviteeClient.booking.confirmInvite({ bookingId });
      const accepted = await tutorClient.tutorActions.acceptBooking({
        bookingId,
      });
      expect(accepted.currentState).toBe("scheduled");

      const attendeeEmails = await getMeetingAttendees(bookingId);
      expect(attendeeEmails).toBeDefined();
      expect(attendeeEmails!.toSorted()).toEqual(
        [proposerEmail, inviteeEmail, tutorEmail].toSorted(),
      );
    });
  });
});
