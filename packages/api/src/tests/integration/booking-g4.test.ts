import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  wallet,
  tutorInvite,
  tutorProfile,
  availabilitySlot,
  bookingParticipant,
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

async function createPublishedTutor(email: string, ts: number) {
  await signUpAndSignIn(email, "Test1234!", "Tutor G4");
  const tutorCookie = await signInAndGetCookie(email, "Test1234!");
  const tutorCtx = await createTestContext(tutorCookie ?? "");
  if (!tutorCtx.session?.user) throw new Error("Tutor session missing");
  const tutorId = tutorCtx.session.user.id;
  await setUserRole(tutorId, "tutor");

  const [invite] = await db
    .insert(tutorInvite)
    .values({
      email,
      displayName: "Prof G4",
      token: `token-g4-${ts}`,
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
      displayName: "Prof G4",
      shortBio: "Bio",
      credentialsSummary: "Creds",
      expertise: ["Mathematics"],
      modality: "both",
      prices: { "1": 50, "2": 45, "3": 35, "4": 28, "5": 25, "6": 22 },
      availabilitySummary: "Flexible",
      onboardingStatus: "published",
      publishedAt: new Date(),
    })
    .returning();

  const start = new Date(Date.now() + 72 * 3600_000);
  const end = new Date(Date.now() + 73 * 3600_000);
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

describe("G4: group repricing on headcount change", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();
  const tutorEmail = `tutor.g4.${ts}@cogito.test`;
  const proposerEmail = `proposer.g4.${ts}@cogito.test`;
  const i1Email = `invitee1.g4.${ts}@cogito.test`;
  const i2Email = `invitee2.g4.${ts}@cogito.test`;
  const i3Email = `invitee3.g4.${ts}@cogito.test`;

  let proposerClient: TestClient;
  let i1Client: TestClient;
  let i2Client: TestClient;
  let i3Client: TestClient;
  let tutorId: string;
  let slotId: string;
  let bookingId: string;
  let proposerId: string;
  let i1Id: string;
  let i2Id: string;
  let i3Id: string;

  beforeAll(async () => {
    const tutorData = await createPublishedTutor(tutorEmail, ts);
    tutorId = tutorData.tutorId;
    slotId = tutorData.slotId;

    const proposerRes = await signUpAndSignIn(
      proposerEmail,
      "Test1234!",
      "Proposer G4",
    );
    proposerClient = createTestClient(
      await createTestContext(proposerRes.cookie),
    );
    const proposerCtx = await createTestContext(proposerRes.cookie);
    proposerId = proposerCtx.session?.user.id!;
    await creditWallet(proposerId, 200);

    const i1Res = await signUpAndSignIn(i1Email, "Test1234!", "Invitee1 G4");
    i1Client = createTestClient(await createTestContext(i1Res.cookie));
    const i1Ctx = await createTestContext(i1Res.cookie);
    i1Id = i1Ctx.session?.user.id!;
    await creditWallet(i1Id, 200);

    const i2Res = await signUpAndSignIn(i2Email, "Test1234!", "Invitee2 G4");
    i2Client = createTestClient(await createTestContext(i2Res.cookie));
    const i2Ctx = await createTestContext(i2Res.cookie);
    i2Id = i2Ctx.session?.user.id!;
    await creditWallet(i2Id, 200);

    const i3Res = await signUpAndSignIn(i3Email, "Test1234!", "Invitee3 G4");
    i3Client = createTestClient(await createTestContext(i3Res.cookie));
    const i3Ctx = await createTestContext(i3Res.cookie);
    i3Id = i3Ctx.session?.user.id!;
    await creditWallet(i3Id, 200);
  });

  test("create group of 4 at 28 marks/student → awaiting_tutor_review", async () => {
    const start = new Date(Date.now() + 72 * 3600_000).toISOString();
    const end = new Date(Date.now() + 73 * 3600_000).toISOString();

    const b = await proposerClient.booking.createGroup({
      tutorId,
      availabilitySlotId: slotId,
      modality: "online",
      targetGroupSize: 4,
      inviteeUserIds: [i1Id, i2Id, i3Id],
      scheduledStartAt: start,
      scheduledEndAt: end,
      timezone: "Asia/Jakarta",
    });

    bookingId = b.id;
    expect(b.currentState).toBe("awaiting_participant_confirmation");
    expect(b.priceSnapshot.perStudent).toBe(28);
  });

  test("all three invitees confirm → headcount 4 → awaiting_tutor_review", async () => {
    await i1Client.booking.confirmInvite({ bookingId });
    await i2Client.booking.confirmInvite({ bookingId });
    const r = await i3Client.booking.confirmInvite({ bookingId });
    expect(r.confirmedHeadcount).toBe(4);

    const b = await proposerClient.booking.get({ bookingId });
    expect(b.currentState).toBe("awaiting_tutor_review");
  });

  test("proposer withdraws → remaining 3 repriced to 35 marks/student", async () => {
    const result = await proposerClient.booking.withdraw({
      bookingId,
      reason: "schedule conflict",
    });
    expect(result.withdrawn).toBe(true);

    const b = await proposerClient.booking.get({ bookingId });
    expect(b.currentState).toBe("awaiting_reconfirmation");
    expect(b.confirmedHeadcount).toBe(3);
    expect(b.holdAmount).toBe(105);
    expect(b.priceSnapshot.perStudent).toBe(35);

    const participants = await db
      .select()
      .from(bookingParticipant)
      .where(eq(bookingParticipant.bookingId, bookingId));
    const remaining = participants.filter((p) =>
      [i1Id, i2Id, i3Id].includes(p.userId),
    );
    expect(remaining.length).toBe(3);
    for (const p of remaining) {
      expect(p.heldAmount).toBe(35);
      expect(p.confirmationState).toBe("confirmed");
    }

    const proposerRow = participants.find((p) => p.userId === proposerId);
    expect(proposerRow?.confirmationState).toBe("withdrawn_pre_h2");
    expect(proposerRow?.heldAmount).toBe(0);
  });

  test("withdrawn proposer's hold released and reprice holds reflect on wallets", async () => {
    const [proposerWallet] = await db
      .select()
      .from(wallet)
      .where(eq(wallet.userId, proposerId));
    expect(proposerWallet!.heldBalance).toBe(0);

    for (const id of [i1Id, i2Id, i3Id]) {
      const [w] = await db.select().from(wallet).where(eq(wallet.userId, id));
      expect(w!.heldBalance).toBe(35);
    }
  });

  test("remaining participants receive reprice notifications", async () => {
    for (const id of [i1Id, i2Id, i3Id]) {
      const notifs = await db
        .select()
        .from(notification)
        .where(
          eq(notification.eventKey, `booking.${bookingId}.reprice.${id}`),
        );
      expect(notifs.length).toBe(1);
      expect(notifs[0]!.title).toBe("Group price updated");
    }
  });
});
