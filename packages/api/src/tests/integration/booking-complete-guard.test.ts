import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  wallet,
  tutorInvite,
  tutorProfile,
  availabilitySlot,
  booking as bookingTable,
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

async function createPublishedTutor(email: string, ts: number, tag: string) {
  await signUpAndSignIn(email, "Test1234!", tag);
  const tutorCookie = await signInAndGetCookie(email, "Test1234!");
  const tutorCtx = await createTestContext(tutorCookie ?? "");
  if (!tutorCtx.session?.user) throw new Error("Tutor session missing");
  const tutorId = tutorCtx.session.user.id;
  await setUserRole(tutorId, "tutor");

  const [invite] = await db
    .insert(tutorInvite)
    .values({
      email,
      displayName: tag,
      token: `token-guard-${tag}-${ts}`,
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
      displayName: tag,
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

  const start = new Date(Date.now() + 1 * 3600_000);
  const end = new Date(start.getTime() + 7 * 24 * 3600_000);
  const [slot] = await db
    .insert(availabilitySlot)
    .values({ tutorId, startDate: start, endDate: end, modality: "both" })
    .returning();

  return { tutorId, profileId: profile!.id, slotId: slot!.id };
}

describe("completeSession start-time guard (C3)", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();
  const studentEmail = `student.guard.${ts}@cogito.test`;
  const inviteeEmail = `invitee.guard.${ts}@cogito.test`;
  const tutorAEmail = `tutor.a.guard.${ts}@cogito.test`;
  const tutorBEmail = `tutor.b.guard.${ts}@cogito.test`;

  let studentClient: TestClient;
  let inviteeClient: TestClient;
  let tutorAClient: TestClient;
  let studentId: string;
  let inviteeId: string;
  let tutorAId: string;
  let slotAId: string;

  let soloLateId: string;
  let groupId: string;

  beforeAll(async () => {
    const studentRes = await signUpAndSignIn(
      studentEmail,
      "Test1234!",
      "Student Guard",
    );
    studentClient = createTestClient(
      await createTestContext(studentRes.cookie),
    );
    const studentCtx = await createTestContext(studentRes.cookie);
    studentId = studentCtx.session!.user.id;
    await creditWallet(studentId, 500);

    const inviteeRes = await signUpAndSignIn(
      inviteeEmail,
      "Test1234!",
      "Invitee Guard",
    );
    inviteeClient = createTestClient(
      await createTestContext(inviteeRes.cookie),
    );
    const inviteeCtx = await createTestContext(inviteeRes.cookie);
    inviteeId = inviteeCtx.session!.user.id;
    await creditWallet(inviteeId, 500);

    const tutorA = await createPublishedTutor(tutorAEmail, ts, "Tutor Guard A");
    const tutorACookie = await signInAndGetCookie(tutorAEmail, "Test1234!");
    tutorAClient = createTestClient(await createTestContext(tutorACookie));
    tutorAId = tutorA.tutorId;
    slotAId = tutorA.slotId;

    await createPublishedTutor(tutorBEmail, ts, "Tutor Guard B");
  });

  test("rejects completing a solo booking before its session starts", async () => {
    const start = new Date(Date.now() + 24 * 3600_000);
    const end = new Date(start.getTime() + 3600_000);
    const b = await studentClient.booking.createSolo({
      tutorId: tutorAId,
      availabilitySlotId: slotAId,
      modality: "online",
      scheduledStartAt: start.toISOString(),
      scheduledEndAt: end.toISOString(),
      timezone: "Asia/Jakarta",
    });

    const accepted = await tutorAClient.tutorActions.acceptBooking({
      bookingId: b.id,
    });
    expect(accepted.currentState).toBe("scheduled");
    expect(accepted.holdAmount).toBeGreaterThan(0);

    await expect(
      tutorAClient.tutorActions.completeSession({ bookingId: b.id }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const [row] = await db
      .select()
      .from(bookingTable)
      .where(eq(bookingTable.id, b.id));
    expect(row!.currentState).toBe("scheduled");
    expect(row!.holdAmount).toBe(accepted.holdAmount);

    const w = await studentClient.wallet.get({});
    expect(w.heldBalance).toBe(accepted.holdAmount);
  });

  test("completes a solo booking after start: deducts hold and transitions to completed", async () => {
    const start = new Date(Date.now() + 32 * 3600_000);
    const end = new Date(start.getTime() + 3600_000);
    const b = await studentClient.booking.createSolo({
      tutorId: tutorAId,
      availabilitySlotId: slotAId,
      modality: "online",
      scheduledStartAt: start.toISOString(),
      scheduledEndAt: end.toISOString(),
      timezone: "Asia/Jakarta",
    });

    const accepted = await tutorAClient.tutorActions.acceptBooking({
      bookingId: b.id,
    });
    expect(accepted.currentState).toBe("scheduled");
    expect(accepted.holdAmount).toBeGreaterThan(0);

    const heldAfterAccept = (await studentClient.wallet.get({})).heldBalance;

    await db
      .update(bookingTable)
      .set({ scheduledStartAt: new Date(Date.now() - 5 * 60_000) })
      .where(eq(bookingTable.id, b.id));

    const completed = await tutorAClient.tutorActions.completeSession({
      bookingId: b.id,
    });
    expect(completed.currentState).toBe("completed");

    const [row] = await db
      .select()
      .from(bookingTable)
      .where(eq(bookingTable.id, b.id));
    expect(row!.currentState).toBe("completed");
    expect(row!.holdAmount).toBe(0);

    const w = await studentClient.wallet.get({});
    expect(w.heldBalance).toBe(heldAfterAccept - accepted.holdAmount);
  });

  test("start+15min lateness edge still completes the session", async () => {
    const start = new Date(Date.now() + 40 * 3600_000);
    const end = new Date(start.getTime() + 3600_000);
    const b = await studentClient.booking.createSolo({
      tutorId: tutorAId,
      availabilitySlotId: slotAId,
      modality: "online",
      scheduledStartAt: start.toISOString(),
      scheduledEndAt: end.toISOString(),
      timezone: "Asia/Jakarta",
    });
    soloLateId = b.id;

    const accepted = await tutorAClient.tutorActions.acceptBooking({
      bookingId: b.id,
    });
    expect(accepted.currentState).toBe("scheduled");

    await db
      .update(bookingTable)
      .set({ scheduledStartAt: new Date(Date.now() - 15 * 60_000) })
      .where(eq(bookingTable.id, b.id));

    const completed = await tutorAClient.tutorActions.completeSession({
      bookingId: b.id,
    });
    expect(completed.currentState).toBe("completed");

    const [row] = await db
      .select()
      .from(bookingTable)
      .where(eq(bookingTable.id, b.id));
    expect(row!.currentState).toBe("completed");
    expect(row!.holdAmount).toBe(0);
  });

  test("rejects completing a group booking before its session starts", async () => {
    const start = new Date(Date.now() + 44 * 3600_000).toISOString();
    const end = new Date(Date.now() + 45 * 3600_000).toISOString();

    const b = await studentClient.booking.createGroup({
      tutorId: tutorAId,
      availabilitySlotId: slotAId,
      modality: "online",
      targetGroupSize: 2,
      inviteeUserIds: [inviteeId],
      scheduledStartAt: start,
      scheduledEndAt: end,
      timezone: "Asia/Jakarta",
    });
    groupId = b.id;

    const confirmed = await inviteeClient.booking.confirmInvite({
      bookingId: b.id,
    });
    expect(confirmed.confirmedHeadcount).toBe(2);

    const accepted = await tutorAClient.tutorActions.acceptBooking({
      bookingId: b.id,
    });
    expect(accepted.currentState).toBe("scheduled");
    expect(accepted.holdAmount).toBeGreaterThan(0);

    await expect(
      tutorAClient.tutorActions.completeSession({ bookingId: b.id }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const [row] = await db
      .select()
      .from(bookingTable)
      .where(eq(bookingTable.id, b.id));
    expect(row!.currentState).toBe("scheduled");
    expect(row!.holdAmount).toBe(accepted.holdAmount);

    for (const userId of [studentId, inviteeId]) {
      const [w] = await db
        .select()
        .from(wallet)
        .where(eq(wallet.userId, userId));
      expect(w!.heldBalance).toBeGreaterThan(0);
    }
  });

  test("group booking completes once started: deducts each participant hold", async () => {
    await db
      .update(bookingTable)
      .set({ scheduledStartAt: new Date(Date.now() - 30 * 60_000) })
      .where(eq(bookingTable.id, groupId));

    const completed = await tutorAClient.tutorActions.completeSession({
      bookingId: groupId,
    });
    expect(completed.currentState).toBe("completed");

    const [row] = await db
      .select()
      .from(bookingTable)
      .where(eq(bookingTable.id, groupId));
    expect(row!.currentState).toBe("completed");
    expect(row!.holdAmount).toBe(0);

    // Invitee's only hold was the group share: cleared by the completion.
    const [inviteeWallet] = await db
      .select()
      .from(wallet)
      .where(eq(wallet.userId, inviteeId));
    expect(inviteeWallet!.heldBalance).toBe(0);

    // The proposer still holds the earlier still-scheduled solo booking.
    const [proposerWallet] = await db
      .select()
      .from(wallet)
      .where(eq(wallet.userId, studentId));
    expect(proposerWallet!.heldBalance).toBeGreaterThan(0);
  });

  test("series future session completion is still rejected (series guard regression)", async () => {
    const sessions = [
      {
        scheduledStartAt: new Date(Date.now() + 48 * 3600_000).toISOString(),
        scheduledEndAt: new Date(Date.now() + 49 * 3600_000).toISOString(),
      },
      {
        scheduledStartAt: new Date(Date.now() + 72 * 3600_000).toISOString(),
        scheduledEndAt: new Date(Date.now() + 73 * 3600_000).toISOString(),
      },
    ];
    const b = await studentClient.booking.createSeries({
      tutorId: tutorAId,
      availabilitySlotId: slotAId,
      modality: "online",
      sessions,
      timezone: "Asia/Jakarta",
    });

    await tutorAClient.tutorActions.acceptBooking({ bookingId: b.id });

    const listed = await studentClient.booking.listSessions({
      bookingId: b.id,
    });

    await expect(
      tutorAClient.tutorActions.completeSession({
        bookingId: b.id,
        sessionId: listed[0]!.id,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const [row] = await db
      .select()
      .from(bookingTable)
      .where(eq(bookingTable.id, b.id));
    expect(row!.currentState).toBe("scheduled");
  });

  test("a non-owning tutor cannot complete a booking (ownership still enforced)", async () => {
    const tutorBCookie = await signInAndGetCookie(tutorBEmail, "Test1234!");
    const tutorBClient = createTestClient(
      await createTestContext(tutorBCookie),
    );

    await expect(
      tutorBClient.tutorActions.completeSession({ bookingId: soloLateId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("completing a non-SCHEDULED booking is still rejected (state check enforced)", async () => {
    await expect(
      tutorAClient.tutorActions.completeSession({ bookingId: soloLateId }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
