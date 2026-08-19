import { describe, test, expect, beforeAll } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  wallet,
  ledgerEntry,
  tutorInvite,
  tutorProfile,
  availabilitySlot,
  booking,
  bookingSession,
  bookingParticipant,
} from "@cogito-app/db/schema";

import {
  createTestContext,
  createTestClient,
  signUpAndSignIn,
  setUserRole,
  resetDatabase,
  type TestClient,
} from "../helpers/test-client";
import { services } from "../../services";

async function creditWallet(userId: string, amount: number) {
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
  await signUpAndSignIn(email, "Test1234!", "Tutor NoShowGrp");
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
      displayName: "Prof NoShowGrp",
      token: `token-nsg-${ts}`,
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
      displayName: "Prof NoShowGrp",
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

describe("Group no-show only forfeits the target participant's hold (C1)", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();
  const tutorEmail = `tutor.nsg.${ts}@cogito.test`;
  const proposerEmail = `proposer.nsg.${ts}@cogito.test`;
  const inviteeEmail = `invitee.nsg.${ts}@cogito.test`;

  let tutorId: string;
  let slotId: string;
  let tutorClient: TestClient;
  let proposerClient: TestClient;
  let inviteeClient: TestClient;
  let proposerId: string;
  let inviteeId: string;

  beforeAll(async () => {
    const tutor = await createPublishedTutor(tutorEmail, ts);
    tutorId = tutor.tutorId;
    slotId = tutor.slotId;
    tutorClient = createTestClient(
      await createTestContext(
        (await signInAndGetCookie(tutorEmail, "Test1234!")) ?? "",
      ),
    );

    const proposerRes = await signUpAndSignIn(
      proposerEmail,
      "Test1234!",
      "Proposer",
    );
    proposerClient = createTestClient(
      await createTestContext(proposerRes.cookie),
    );
    const proposerCtx = await createTestContext(proposerRes.cookie);
    proposerId = proposerCtx.session?.user.id!;
    await creditWallet(proposerId, 500);

    const inviteeRes = await signUpAndSignIn(
      inviteeEmail,
      "Test1234!",
      "Invitee",
    );
    inviteeClient = createTestClient(
      await createTestContext(inviteeRes.cookie),
    );
    const inviteeCtx = await createTestContext(inviteeRes.cookie);
    inviteeId = inviteeCtx.session?.user.id!;
    await creditWallet(inviteeId, 500);
  });

  async function createFullScheduledGroup() {
    const start = new Date(Date.now() + 48 * 3600_000);
    const b = await proposerClient.booking.createGroup({
      tutorId,
      availabilitySlotId: slotId,
      modality: "online",
      targetGroupSize: 2,
      inviteeUserIds: [inviteeId],
      scheduledStartAt: start.toISOString(),
      scheduledEndAt: new Date(start.getTime() + 3600_000).toISOString(),
      timezone: "Asia/Jakarta",
    });
    await inviteeClient.booking.confirmInvite({ bookingId: b.id });
    const accepted = await tutorClient.tutorActions.acceptBooking({
      bookingId: b.id,
    });
    expect(accepted.currentState).toBe("scheduled");
    // Backdate the session so the no-show window (start + 15min) has passed.
    await db
      .update(booking)
      .set({
        scheduledStartAt: new Date(Date.now() - 2 * 3600_000),
        scheduledEndAt: new Date(Date.now() - 1 * 3600_000),
      })
      .where(eq(booking.id, b.id));
    return b.id;
  }

  test("group no-show keeps the booking SCHEDULED and only forfeits the target's hold", async () => {
    const bookingId = await createFullScheduledGroup();

    // 2-person online group holds 45 marks per student (prices["2"] = 45).
    const bBefore = await proposerClient.booking.get({ bookingId });
    expect(bBefore.holdAmount).toBe(90);
    const [proposerWalletBefore] = await db
      .select()
      .from(wallet)
      .where(eq(wallet.userId, proposerId));
    const [inviteeWalletBefore] = await db
      .select()
      .from(wallet)
      .where(eq(wallet.userId, inviteeId));
    expect(proposerWalletBefore!.heldBalance).toBe(45);
    expect(inviteeWalletBefore!.heldBalance).toBe(45);

    const result = await tutorClient.tutorActions.markParticipantNoShow({
      bookingId,
      participantUserId: inviteeId,
    });
    expect(result.forfeitedMarks).toBe(45);

    const b = await proposerClient.booking.get({ bookingId });
    expect(b.currentState).toBe("scheduled");
    expect(b.holdAmount).toBe(45);

    // Target participant: hold forfeited, attendance ABSENT.
    const [inviteeParticipant] = await db
      .select()
      .from(bookingParticipant)
      .where(
        and(
          eq(bookingParticipant.bookingId, bookingId),
          eq(bookingParticipant.userId, inviteeId),
        ),
      );
    expect(inviteeParticipant!.attendanceState).toBe("absent");
    expect(inviteeParticipant!.heldAmount).toBe(0);

    // Remaining participant: hold untouched.
    const [proposerParticipant] = await db
      .select()
      .from(bookingParticipant)
      .where(
        and(
          eq(bookingParticipant.bookingId, bookingId),
          eq(bookingParticipant.userId, proposerId),
        ),
      );
    expect(proposerParticipant!.attendanceState).not.toBe("absent");
    expect(proposerParticipant!.heldAmount).toBe(45);

    const [inviteeWallet] = await db
      .select()
      .from(wallet)
      .where(eq(wallet.userId, inviteeId));
    expect(inviteeWallet!.heldBalance).toBe(0);
    expect(inviteeWallet!.totalBalance).toBe(455);

    const [proposerWallet] = await db
      .select()
      .from(wallet)
      .where(eq(wallet.userId, proposerId));
    expect(proposerWallet!.heldBalance).toBe(45);
    expect(proposerWallet!.availableBalance).toBe(455);

    // Only the target's hold was deducted (no release for the survivor; the
    // no-show ledger entry is a single deduct).
    const entries = await db
      .select()
      .from(ledgerEntry)
      .where(eq(ledgerEntry.bookingId, bookingId));
    const noShowDeducts = entries.filter(
      (e) => e.entryType === "deduct" && e.eventKey.includes("no_show"),
    );
    expect(noShowDeducts.length).toBe(1);
    expect(noShowDeducts[0]!.amount).toBe(45);
    expect(noShowDeducts[0]!.walletId).toBe(inviteeWallet!.id);
  });

  test("after group no-show, the survivor's hold is forfeited by the no-show expiry path (M2/M4)", async () => {
    const bookingId = await createFullScheduledGroup();
    await tutorClient.tutorActions.markParticipantNoShow({
      bookingId,
      participantUserId: inviteeId,
    });

    const b = await proposerClient.booking.get({ bookingId });
    expect(b.currentState).toBe("scheduled");
    expect(b.holdAmount).toBe(45);

    // Expire the survivor's SCHEDULED booking: the no-show path now FORFEITS
    // the remaining hold (deduct, M2) while transition-or-skip transitions the
    // booking to NO_SHOW in the same tx (M4). The proposer's wallet may also
    // carry holds from earlier tests' bookings, so assert the delta.
    const [proposerBefore] = await db
      .select()
      .from(wallet)
      .where(eq(wallet.userId, proposerId));
    await db
      .update(booking)
      .set({ deadlineAt: new Date(Date.now() - 60_000) })
      .where(eq(booking.id, bookingId));
    const result = await services.booking.releaseExpiredHolds();
    expect(result.released).toBe(1);

    const [proposerWallet] = await db
      .select()
      .from(wallet)
      .where(eq(wallet.userId, proposerId));
    expect(proposerWallet!.heldBalance).toBe(proposerBefore!.heldBalance - 45);
    // Forfeit semantics: the hold is deducted (total drops), not released.
    expect(proposerWallet!.totalBalance).toBe(
      proposerBefore!.totalBalance - 45,
    );

    // The forfeited target is never double-credited: its hold stays consumed.
    const [inviteeWallet] = await db
      .select()
      .from(wallet)
      .where(eq(wallet.userId, inviteeId));
    expect(inviteeWallet!.heldBalance).toBe(0);
    expect(inviteeWallet!.totalBalance).toBeLessThan(500);

    const after = await proposerClient.booking.get({ bookingId });
    expect(after.holdAmount).toBe(0);
    expect(after.currentState).toBe("no_show");
  });

  test("solo no-show still transitions the booking to NO_SHOW and zeroes the hold", async () => {
    const start = new Date(Date.now() + 48 * 3600_000);
    const b = await proposerClient.booking.createSolo({
      tutorId,
      availabilitySlotId: slotId,
      modality: "online",
      scheduledStartAt: start.toISOString(),
      scheduledEndAt: new Date(start.getTime() + 3600_000).toISOString(),
      timezone: "Asia/Jakarta",
    });
    await tutorClient.tutorActions.acceptBooking({ bookingId: b.id });
    await db
      .update(booking)
      .set({
        scheduledStartAt: new Date(Date.now() - 2 * 3600_000),
        scheduledEndAt: new Date(Date.now() - 1 * 3600_000),
      })
      .where(eq(booking.id, b.id));

    const result = await tutorClient.tutorActions.markParticipantNoShow({
      bookingId: b.id,
      participantUserId: proposerId,
    });
    expect(result.forfeitedMarks).toBe(50);

    const fetched = await proposerClient.booking.get({ bookingId: b.id });
    expect(fetched.currentState).toBe("no_show");
    expect(fetched.holdAmount).toBe(0);
  });

  test("series no-show still forfeits only the session hold and keeps the booking scheduled", async () => {
    const t1 = new Date(Date.now() + 66 * 3600_000);
    const t2 = new Date(Date.now() + 72 * 3600_000);
    const b = await proposerClient.booking.createSeries({
      tutorId,
      availabilitySlotId: slotId,
      modality: "online",
      sessions: [
        {
          scheduledStartAt: t1.toISOString(),
          scheduledEndAt: new Date(t1.getTime() + 3600_000).toISOString(),
        },
        {
          scheduledStartAt: t2.toISOString(),
          scheduledEndAt: new Date(t2.getTime() + 3600_000).toISOString(),
        },
      ],
      timezone: "Asia/Jakarta",
    });
    await tutorClient.tutorActions.acceptBooking({ bookingId: b.id });

    const sessions = await proposerClient.booking.listSessions({
      bookingId: b.id,
    });
    const firstSession = sessions[0];
    await db
      .update(bookingSession)
      .set({
        scheduledStartAt: new Date(Date.now() - 2 * 3600_000),
        scheduledEndAt: new Date(Date.now() - 1 * 3600_000),
      })
      .where(eq(bookingSession.id, firstSession!.id));

    const result = await tutorClient.tutorActions.markParticipantNoShow({
      bookingId: b.id,
      participantUserId: proposerId,
      sessionId: firstSession!.id,
    });
    expect(result.forfeitedMarks).toBe(50);

    const fetched = await proposerClient.booking.get({ bookingId: b.id });
    expect(fetched.currentState).toBe("scheduled");
    // Series no-show decrements the participant's held amount (H2), so the
    // booking hold drops to the remaining (1-of-2) session's hold.
    expect(fetched.holdAmount).toBe(50);

    const [participant] = await db
      .select()
      .from(bookingParticipant)
      .where(
        and(
          eq(bookingParticipant.bookingId, b.id),
          eq(bookingParticipant.userId, proposerId),
        ),
      );
    expect(participant!.attendanceState).toBe("absent");
  });

  test("guards: lateness window and participant existence are still enforced", async () => {
    const start = new Date(Date.now() + 48 * 3600_000);
    const b = await proposerClient.booking.createGroup({
      tutorId,
      availabilitySlotId: slotId,
      modality: "online",
      targetGroupSize: 2,
      inviteeUserIds: [inviteeId],
      scheduledStartAt: start.toISOString(),
      scheduledEndAt: new Date(start.getTime() + 3600_000).toISOString(),
      timezone: "Asia/Jakarta",
    });
    await inviteeClient.booking.confirmInvite({ bookingId: b.id });
    await tutorClient.tutorActions.acceptBooking({ bookingId: b.id });

    // No-show before start + 15min is rejected.
    await expect(
      tutorClient.tutorActions.markParticipantNoShow({
        bookingId: b.id,
        participantUserId: inviteeId,
      }),
    ).rejects.toThrow(/editable/i);

    // A non-participant user cannot be marked.
    await db
      .update(booking)
      .set({ scheduledStartAt: new Date(Date.now() - 2 * 3600_000) })
      .where(eq(booking.id, b.id));
    await expect(
      tutorClient.tutorActions.markParticipantNoShow({
        bookingId: b.id,
        participantUserId: tutorId,
      }),
    ).rejects.toThrow(/participant/i);
  });
});
