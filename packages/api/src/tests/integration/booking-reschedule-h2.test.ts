import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  wallet,
  tutorInvite,
  tutorProfile,
  availabilitySlot,
  bookingRescheduleProposal,
  booking,
} from "@cogito-app/db/schema";

import {
  createTestContext,
  createTestClient,
  signUpAndSignIn,
  setUserRole,
  resetDatabase,
  type TestClient,
} from "../helpers/test-client";

const HOUR = 3600_000;
const MINUTE = 60_000;

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

async function proposalsFor(bookingId: string) {
  return db
    .select()
    .from(bookingRescheduleProposal)
    .where(eq(bookingRescheduleProposal.bookingId, bookingId));
}

/** Published tutor whose availability window starts ~now so a session 30 min
 *  out is inside it (createSolo/createSeries require a futureOnly slot). */
async function createPublishedTutor(
  email: string,
  ts: number,
): Promise<{ tutorId: string; slotId: string }> {
  await signUpAndSignIn(email, "Test1234!", "Tutor H2");
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
      displayName: "Prof H2",
      token: `token-h2-${ts}`,
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
      displayName: "Prof H2",
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

  const start = new Date(Date.now() + MINUTE);
  const [slot] = await db
    .insert(availabilitySlot)
    .values({
      tutorId,
      startDate: start,
      endDate: new Date(start.getTime() + 8 * 24 * HOUR),
      modality: "both",
    })
    .returning();

  return { tutorId, slotId: slot!.id };
}

describe("C2: student proposeReschedule blocked within H-2 of the CURRENT session", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();

  let studentClient: TestClient;
  let studentId: string;
  let tutorClient: TestClient;
  let soloTutorId: string;
  let soloSlotId: string;

  let proposerClient: TestClient;
  let inviteeClient: TestClient;
  let inviteeId: string;
  let groupTutorClient: TestClient;
  let groupTutorId: string;
  let groupSlotId: string;

  let seriesTutorClient: TestClient;
  let seriesTutorId: string;
  let seriesSlotId: string;

  let lateTutorClient: TestClient;
  let lateTutorId: string;
  let lateSlotId: string;

  beforeAll(async () => {
    const studentRes = await signUpAndSignIn(
      `student.h2.${ts}@cogito.test`,
      "Test1234!",
      "Student H2",
    );
    studentClient = createTestClient(
      await createTestContext(studentRes.cookie),
    );
    const studentCtx = await createTestContext(studentRes.cookie);
    if (!studentCtx.session?.user) throw new Error("Student session missing");
    studentId = studentCtx.session.user.id;
    await creditWallet(studentId, 500);

    const propRes = await signUpAndSignIn(
      `proposer.h2.${ts}@cogito.test`,
      "Test1234!",
      "Proposer H2",
    );
    proposerClient = createTestClient(await createTestContext(propRes.cookie));
    const propCtx = await createTestContext(propRes.cookie);
    if (!propCtx.session?.user) throw new Error("Proposer session missing");
    await creditWallet(propCtx.session.user.id, 500);

    const invRes = await signUpAndSignIn(
      `invitee.h2.${ts}@cogito.test`,
      "Test1234!",
      "Invitee H2",
    );
    inviteeClient = createTestClient(await createTestContext(invRes.cookie));
    const invCtx = await createTestContext(invRes.cookie);
    if (!invCtx.session?.user) throw new Error("Invitee session missing");
    inviteeId = invCtx.session.user.id;
    await creditWallet(inviteeId, 500);

    const solo = await createPublishedTutor(`solo.h2.${ts}@cogito.test`, ts);
    soloTutorId = solo.tutorId;
    soloSlotId = solo.slotId;
    tutorClient = createTestClient(
      await createTestContext(
        (await signInAndGetCookie(`solo.h2.${ts}@cogito.test`, "Test1234!")) ??
          "",
      ),
    );

    const group = await createPublishedTutor(
      `group.h2.${ts}@cogito.test`,
      ts + 1,
    );
    groupTutorId = group.tutorId;
    groupSlotId = group.slotId;
    groupTutorClient = createTestClient(
      await createTestContext(
        (await signInAndGetCookie(`group.h2.${ts}@cogito.test`, "Test1234!")) ??
          "",
      ),
    );

    const series = await createPublishedTutor(
      `series.h2.${ts}@cogito.test`,
      ts + 2,
    );
    seriesTutorId = series.tutorId;
    seriesSlotId = series.slotId;
    seriesTutorClient = createTestClient(
      await createTestContext(
        (await signInAndGetCookie(
          `series.h2.${ts}@cogito.test`,
          "Test1234!",
        )) ?? "",
      ),
    );

    const late = await createPublishedTutor(
      `late.h2.${ts}@cogito.test`,
      ts + 3,
    );
    lateTutorId = late.tutorId;
    lateSlotId = late.slotId;
    lateTutorClient = createTestClient(
      await createTestContext(
        (await signInAndGetCookie(`late.h2.${ts}@cogito.test`, "Test1234!")) ??
          "",
      ),
    );
  });

  function proposedSlot(hoursOut: number) {
    const start = new Date(Date.now() + hoursOut * HOUR);
    return {
      proposedStartAt: start.toISOString(),
      proposedEndAt: new Date(start.getTime() + HOUR).toISOString(),
    };
  }

  let soloOffset = 0;
  async function createAcceptedSoloAt(offsetMs: number): Promise<string> {
    soloOffset += 1;
    const start = new Date(Date.now() + offsetMs);
    const b = await studentClient.booking.createSolo({
      tutorId: soloTutorId,
      availabilitySlotId: soloSlotId,
      modality: "online",
      scheduledStartAt: start.toISOString(),
      scheduledEndAt: new Date(start.getTime() + HOUR).toISOString(),
      timezone: "Asia/Jakarta",
    });
    const accepted = await tutorClient.tutorActions.acceptBooking({
      bookingId: b.id,
    });
    expect(accepted.currentState).toBe("scheduled");
    return b.id;
  }

  test("C2: student proposing a reschedule for a session 30 min away is rejected", async () => {
    const b1 = await createAcceptedSoloAt(30 * MINUTE);

    // The proposed slot is comfortably beyond H-2 and inside the tutor's
    // availability — without the current-session guard this would succeed.
    await expect(
      studentClient.booking.proposeReschedule({
        bookingId: b1,
        ...proposedSlot(26),
        availabilitySlotId: soloSlotId,
        reason: "Move to a later slot",
      }),
    ).rejects.toThrow(/reschedul|editable/i);

    const b = await studentClient.booking.get({ bookingId: b1 });
    expect(b.currentState).toBe("scheduled");
    const proposals = await proposalsFor(b1);
    expect(proposals.length).toBe(0);
  });

  test("C2: a session 6h away passes the current-session guard but the new-slot H-2 rule still applies", async () => {
    const b2 = await createAcceptedSoloAt(6 * HOUR);

    const tooSoon = proposedSlot(1);
    await expect(
      studentClient.booking.proposeReschedule({
        bookingId: b2,
        ...tooSoon,
        availabilitySlotId: soloSlotId,
        reason: "Move to a later slot",
      }),
    ).rejects.toThrow(/reschedul|editable/i);

    const b = await studentClient.booking.get({ bookingId: b2 });
    expect(b.currentState).toBe("scheduled");
    expect(b.scheduledStartAt.getTime() - Date.now()).toBeGreaterThan(2 * HOUR);
    const proposals = await proposalsFor(b2);
    expect(proposals.length).toBe(0);
  });

  test("C2: a group booking 30 min away applies the same rule at booking level", async () => {
    const start = new Date(Date.now() + 30 * MINUTE);
    const g = await proposerClient.booking.createGroup({
      tutorId: groupTutorId,
      availabilitySlotId: groupSlotId,
      modality: "online",
      targetGroupSize: 2,
      inviteeUserIds: [inviteeId],
      scheduledStartAt: start.toISOString(),
      scheduledEndAt: new Date(start.getTime() + HOUR).toISOString(),
      timezone: "Asia/Jakarta",
    });
    await inviteeClient.booking.confirmInvite({ bookingId: g.id });
    const accepted = await groupTutorClient.tutorActions.acceptBooking({
      bookingId: g.id,
    });
    expect(accepted.currentState).toBe("scheduled");

    await expect(
      proposerClient.booking.proposeReschedule({
        bookingId: g.id,
        ...proposedSlot(26),
        availabilitySlotId: groupSlotId,
        reason: "Move the group session",
      }),
    ).rejects.toThrow(/reschedul|editable/i);

    const fetched = await proposerClient.booking.get({ bookingId: g.id });
    expect(fetched.currentState).toBe("scheduled");
    expect((await proposalsFor(g.id)).length).toBe(0);
  });

  test("C2: a series applies the booking-level rule even when rescheduling a later session", async () => {
    const t1 = new Date(Date.now() + 30 * MINUTE);
    const t2 = new Date(Date.now() + 10 * HOUR);
    const s = await studentClient.booking.createSeries({
      tutorId: seriesTutorId,
      availabilitySlotId: seriesSlotId,
      modality: "online",
      sessions: [
        {
          scheduledStartAt: t1.toISOString(),
          scheduledEndAt: new Date(t1.getTime() + HOUR).toISOString(),
        },
        {
          scheduledStartAt: t2.toISOString(),
          scheduledEndAt: new Date(t2.getTime() + HOUR).toISOString(),
        },
      ],
      timezone: "Asia/Jakarta",
    });
    const accepted = await seriesTutorClient.tutorActions.acceptBooking({
      bookingId: s.id,
    });
    expect(accepted.currentState).toBe("scheduled");

    const sessions = await studentClient.booking.listSessions({
      bookingId: s.id,
    });
    const later = sessions[1]!;

    // The later session is far from now; only the booking-level
    // b.scheduledStartAt (30 min away) is inside H-2.
    expect(later.scheduledStartAt.getTime() - Date.now()).toBeGreaterThan(
      2 * HOUR,
    );
    await expect(
      studentClient.booking.proposeReschedule({
        bookingId: s.id,
        ...proposedSlot(26),
        availabilitySlotId: seriesSlotId,
        sessionId: later.id,
        reason: "Move the series session",
      }),
    ).rejects.toThrow(/reschedul|editable/i);

    const fetched = await studentClient.booking.get({ bookingId: s.id });
    expect(fetched.currentState).toBe("scheduled");
    expect((await proposalsFor(s.id)).length).toBe(0);
  });

  test("C2: tutor proposeReschedule for a session 30 min away is still allowed", async () => {
    const start = new Date(Date.now() + 30 * MINUTE);
    const b = await studentClient.booking.createSolo({
      tutorId: lateTutorId,
      availabilitySlotId: lateSlotId,
      modality: "online",
      scheduledStartAt: start.toISOString(),
      scheduledEndAt: new Date(start.getTime() + HOUR).toISOString(),
      timezone: "Asia/Jakarta",
    });
    const accepted = await lateTutorClient.tutorActions.acceptBooking({
      bookingId: b.id,
    });
    expect(accepted.currentState).toBe("scheduled");

    await lateTutorClient.tutorActions.proposeReschedule({
      bookingId: b.id,
      ...proposedSlot(48),
      reason: "tutor path is unrestricted",
    });

    const [proposal] = await proposalsFor(b.id);
    expect(proposal!.proposedBy).toBe(lateTutorId);
    expect(proposal!.proposedStartAt.getTime()).toBeGreaterThan(
      Date.now() + 2 * HOUR,
    );
  });

  test("C2 regression: overlap with another booking is still rejected for a 6h-away session", async () => {
    const bTarget = await createAcceptedSoloAt(12 * HOUR);
    const bOther = await createAcceptedSoloAt(48 * HOUR);

    const [other] = await db
      .select()
      .from(booking)
      .where(eq(booking.id, bOther))
      .limit(1);

    await expect(
      studentClient.booking.proposeReschedule({
        bookingId: bTarget,
        proposedStartAt: other!.scheduledStartAt.toISOString(),
        proposedEndAt: other!.scheduledEndAt.toISOString(),
        availabilitySlotId: soloSlotId,
        reason: "Avoid an overlapping booking",
      }),
    ).rejects.toThrow(/conflict/i);
  });

  test("C2 regression: availability is still enforced for a 6h-away session", async () => {
    const bTarget = await createAcceptedSoloAt(20 * HOUR);

    // A slot that belongs to a different tutor is not found for this tutor,
    // so the proposal is rejected on availability.
    await expect(
      studentClient.booking.proposeReschedule({
        bookingId: bTarget,
        ...proposedSlot(40),
        availabilitySlotId: seriesSlotId,
        reason: "Find another available slot",
      }),
    ).rejects.toThrow(/availability|editable/i);

    expect((await proposalsFor(bTarget)).length).toBe(0);
  });
});
