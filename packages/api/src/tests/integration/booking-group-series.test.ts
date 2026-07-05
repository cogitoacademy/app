import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  wallet,
  tutorInvite,
  tutorProfile,
  availabilitySlot,
  booking,
  bookingParticipant,
} from "@cogito-app/db/schema";

import {
  createTestContext,
  createTestClient,
  signUpAndSignIn,
  setUserRole,
  cleanUser,
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
  await signUpAndSignIn(email, "Test1234!", "Tutor Group");
  const tutorCookie = await signInAndGetCookie(email, "Test1234!");
  const tutorCtx = await createTestContext(tutorCookie ?? "");
  if (!tutorCtx.session?.user) throw new Error("Tutor session missing");
  const tutorId = tutorCtx.session.user.id;
  await setUserRole(tutorId, "tutor");

  const [invite] = await db
    .insert(tutorInvite)
    .values({
      email,
      displayName: "Prof Group",
      token: `token-grp-${ts}`,
      status: "accepted",
      invitedBy: tutorId,
      expiresAt: new Date(Date.now() + 86400000),
      acceptedBy: tutorId,
      acceptedAt: new Date(),
    })
    .returning();

  const [profile] = await db
    .insert(tutorProfile)
    .values({
      userId: tutorId,
      inviteId: invite!.id,
      displayName: "Prof Group",
      shortBio: "Bio",
      credentialsSummary: "Creds",
      expertise: ["Mathematics"],
      modality: "both",
      prices: { "1": 50, "2": 45, "3": 40, "4": 35, "5": 30, "6": 28 },
      availabilitySummary: "Flexible",
      onboardingStatus: "published",
      publishedAt: new Date(),
    })
    .returning();

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

  return { tutorId, profileId: profile!.id, slotId: slot!.id };
}

describe("Booking group flow", () => {
  const ts = Date.now();
  const tutorEmail = `tutor.grp.${ts}@cogito.test`;
  const proposerEmail = `proposer.grp.${ts}@cogito.test`;
  const invitee1Email = `invitee1.grp.${ts}@cogito.test`;
  const invitee2Email = `invitee2.grp.${ts}@cogito.test`;
  let proposerClient: TestClient;
  let invitee1Client: TestClient;
  let invitee2Client: TestClient;
  let tutorId: string;
  let slotId: string;
  let bookingId: string;

  beforeAll(async () => {
    const tutorData = await createPublishedTutor(tutorEmail, ts);
    tutorId = tutorData.tutorId;
    slotId = tutorData.slotId;

    const proposerRes = await signUpAndSignIn(
      proposerEmail,
      "Test1234!",
      "Proposer",
    );
    proposerClient = createTestClient(
      await createTestContext(proposerRes.cookie),
    );
    const proposerCtx = await createTestContext(proposerRes.cookie);
    if (proposerCtx.session?.user) {
      await creditWallet(proposerCtx.session.user.id, 300);
    }

    const invitee1Res = await signUpAndSignIn(
      invitee1Email,
      "Test1234!",
      "Invitee1",
    );
    invitee1Client = createTestClient(
      await createTestContext(invitee1Res.cookie),
    );
    const invitee1Ctx = await createTestContext(invitee1Res.cookie);
    if (invitee1Ctx.session?.user) {
      await creditWallet(invitee1Ctx.session.user.id, 100);
    }

    const invitee2Res = await signUpAndSignIn(
      invitee2Email,
      "Test1234!",
      "Invitee2",
    );
    invitee2Client = createTestClient(
      await createTestContext(invitee2Res.cookie),
    );
    const invitee2Ctx = await createTestContext(invitee2Res.cookie);
    if (invitee2Ctx.session?.user) {
      await creditWallet(invitee2Ctx.session.user.id, 100);
    }
  });

  afterAll(async () => {
    if (bookingId) {
      await db
        .delete(bookingParticipant)
        .where(eq(bookingParticipant.bookingId, bookingId))
        .catch(() => {});
      await db
        .delete(booking)
        .where(eq(booking.id, bookingId))
        .catch(() => {});
    }
    await cleanUser(proposerEmail);
    await cleanUser(invitee1Email);
    await cleanUser(invitee2Email);
    await cleanUser(tutorEmail);
  });

  test("TC-18: create group booking → awaiting_participant_confirmation", async () => {
    const start = new Date(Date.now() + 48 * 3600_000).toISOString();
    const end = new Date(Date.now() + 49 * 3600_000).toISOString();

    const invitee1Ctx = await createTestContext(
      (await signInAndGetCookie(invitee1Email, "Test1234!")) ?? "",
    );
    const invitee2Ctx = await createTestContext(
      (await signInAndGetCookie(invitee2Email, "Test1234!")) ?? "",
    );
    const invitee1Id = invitee1Ctx.session?.user.id!;
    const invitee2Id = invitee2Ctx.session?.user.id!;

    const b = await proposerClient.booking.createGroup({
      tutorId,
      availabilitySlotId: slotId,
      modality: "online",
      targetGroupSize: 3,
      inviteeUserIds: [invitee1Id, invitee2Id],
      scheduledStartAt: start,
      scheduledEndAt: end,
      timezone: "Asia/Jakarta",
    });

    bookingId = b.id;
    expect(b.currentState).toBe("awaiting_participant_confirmation");
    expect(b.type).toBe("group");
    expect(b.targetGroupSize).toBe(3);
    expect(b.confirmedHeadcount).toBe(1);
  });

  test("TC-19: invitee1 confirms → headcount 2", async () => {
    const result = await invitee1Client.booking.confirmInvite({
      bookingId,
    });
    expect(result.confirmedHeadcount).toBe(2);
  });

  test("TC-19: invitee2 confirms → full headcount → awaiting_tutor_review", async () => {
    const result = await invitee2Client.booking.confirmInvite({
      bookingId,
    });
    expect(result.confirmedHeadcount).toBe(3);

    const b = await proposerClient.booking.get({ bookingId });
    expect(b.currentState).toBe("awaiting_tutor_review");
  });
});

describe("Booking series flow", () => {
  const ts = Date.now() + 5000;
  const tutorEmail = `tutor.srs.${ts}@cogito.test`;
  const studentEmail = `student.srs.${ts}@cogito.test`;
  let studentClient: TestClient;
  let tutorId: string;
  let slotId: string;
  let bookingId: string;

  beforeAll(async () => {
    const tutorData = await createPublishedTutor(tutorEmail, ts);
    tutorId = tutorData.tutorId;
    slotId = tutorData.slotId;

    const studentRes = await signUpAndSignIn(
      studentEmail,
      "Test1234!",
      "Student Series",
    );
    studentClient = createTestClient(
      await createTestContext(studentRes.cookie),
    );
    const studentCtx = await createTestContext(studentRes.cookie);
    if (studentCtx.session?.user) {
      await creditWallet(studentCtx.session.user.id, 500);
    }
  });

  afterAll(async () => {
    if (bookingId) {
      await db
        .delete(bookingParticipant)
        .where(eq(bookingParticipant.bookingId, bookingId))
        .catch(() => {});
      await db
        .delete(booking)
        .where(eq(booking.id, bookingId))
        .catch(() => {});
    }
    await cleanUser(studentEmail);
    await cleanUser(tutorEmail);
  });

  test("TC-23: create series with 3 sessions → awaiting_tutor_review", async () => {
    const sessions = [
      {
        scheduledStartAt: new Date(Date.now() + 48 * 3600_000).toISOString(),
        scheduledEndAt: new Date(Date.now() + 49 * 3600_000).toISOString(),
      },
      {
        scheduledStartAt: new Date(Date.now() + 72 * 3600_000).toISOString(),
        scheduledEndAt: new Date(Date.now() + 73 * 3600_000).toISOString(),
      },
      {
        scheduledStartAt: new Date(Date.now() + 96 * 3600_000).toISOString(),
        scheduledEndAt: new Date(Date.now() + 97 * 3600_000).toISOString(),
      },
    ];

    const b = await studentClient.booking.createSeries({
      tutorId,
      availabilitySlotId: slotId,
      modality: "online",
      sessions,
      timezone: "Asia/Jakarta",
    });

    bookingId = b.id;
    expect(b.currentState).toBe("awaiting_tutor_review");
    expect(b.type).toBe("series");
  });

  test("TC-24: list sessions returns 3 children", async () => {
    const sessions = await studentClient.booking.listSessions({
      bookingId,
    });
    expect(sessions.length).toBe(3);
  });
});
