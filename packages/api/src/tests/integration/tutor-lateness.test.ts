import { describe, test, expect, beforeAll } from "bun:test";
import { eq, and } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  booking,
  wallet,
  tutorInvite,
  tutorProfile,
  availabilitySlot,
  ledgerEntry,
  notification,
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

async function createPublishedTutor(email: string, ts: number) {
  await signUpAndSignIn(email, "Test1234!", "Tutor Late");
  const tutorCookie = await signInAndGetCookie(email, "Test1234!");
  const tutorCtx = await createTestContext(tutorCookie ?? "");
  if (!tutorCtx.session?.user) throw new Error("Tutor session missing");
  const tutorId = tutorCtx.session.user.id;
  await setUserRole(tutorId, "tutor");

  const [invite] = await db
    .insert(tutorInvite)
    .values({
      email,
      displayName: "Tutor Late",
      token: `token-late-${ts}`,
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
      displayName: "Tutor Late",
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
    .values({
      tutorId,
      startDate: start,
      endDate: end,
      modality: "both",
    })
    .returning();

  return { tutorId, profileId: profile!.id, slotId: slot!.id };
}

describe("Tutor lateness auto-cancel flow", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();
  let studentClient: TestClient;
  let tutorClient: TestClient;
  let tutorId: string;
  let slotId: string;

  beforeAll(async () => {
    const studentRes = await signUpAndSignIn(
      `student.late.${ts}@cogito.test`,
      "Test1234!",
      "Student Late",
    );
    studentClient = createTestClient(
      await createTestContext(studentRes.cookie),
    );
    const ctx = await createTestContext(studentRes.cookie);
    if (ctx.session?.user) {
      await creditWallet(ctx.session.user.id, 200);
    }

    const tutor = await createPublishedTutor(
      `tutor.late.${ts}@cogito.test`,
      ts,
    );
    tutorId = tutor.tutorId;
    slotId = tutor.slotId;

    const tutorCookie = await signInAndGetCookie(
      `tutor.late.${ts}@cogito.test`,
      "Test1234!",
    );
    tutorClient = createTestClient(await createTestContext(tutorCookie));
  });

  test("checkTutorLateness auto-cancels when tutor has not joined 15 min after start", async () => {
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

    const accepted = await tutorClient.tutorActions.acceptBooking({
      bookingId: b.id,
    });
    expect(accepted.currentState).toBe("scheduled");

    await db
      .update(booking)
      .set({ scheduledStartAt: new Date(Date.now() - 20 * 60_000) })
      .where(eq(booking.id, b.id));

    await db
      .insert(bookingParticipant)
      .values({
        bookingId: b.id,
        userId: tutorId,
        role: "tutor",
        confirmationState: "confirmed",
        heldAmount: 0,
        attendanceState: "unknown",
      })
      .onConflictDoNothing();

    const result = await services.booking.checkTutorLateness();
    expect(result.autoCancelled).toBe(1);
    expect(result.failed).toBe(0);

    const [row] = await db.select().from(booking).where(eq(booking.id, b.id));
    expect(row!.currentState).toBe("no_show");
    expect(row!.holdAmount).toBe(0);

    const [tutorParticipant] = await db
      .select()
      .from(bookingParticipant)
      .where(
        and(
          eq(bookingParticipant.bookingId, b.id),
          eq(bookingParticipant.userId, tutorId),
        ),
      );
    expect(tutorParticipant!.attendanceState).toBe("absent");
    expect(tutorParticipant!.role).toBe("tutor");

    const notifs = await db
      .select()
      .from(notification)
      .where(eq(notification.eventKey, `booking.${b.id}.tutor_no_show`));
    expect(notifs.length).toBe(1);
    expect(notifs[0]!.title).toBe("Session auto-cancelled");

    const released = await db
      .select()
      .from(ledgerEntry)
      .where(eq(ledgerEntry.bookingId, b.id));
    expect(released.some((e) => e.entryType === "release")).toBe(true);

    const proposerWallet = await db
      .select()
      .from(wallet)
      .where(eq(wallet.userId, row!.proposerId));
    expect(proposerWallet[0]!.heldBalance).toBe(0);
  });

  test("checkTutorLateness ignores bookings with marked tutor attendance", async () => {
    const start = new Date(Date.now() + 72 * 3600_000).toISOString();
    const end = new Date(Date.now() + 73 * 3600_000).toISOString();
    const b = await studentClient.booking.createSolo({
      tutorId,
      availabilitySlotId: slotId,
      modality: "online",
      scheduledStartAt: start,
      scheduledEndAt: end,
      timezone: "Asia/Jakarta",
    });

    await tutorClient.tutorActions.acceptBooking({ bookingId: b.id });

    await db
      .update(booking)
      .set({ scheduledStartAt: new Date(Date.now() - 20 * 60_000) })
      .where(eq(booking.id, b.id));

    await db
      .insert(bookingParticipant)
      .values({
        bookingId: b.id,
        userId: tutorId,
        role: "tutor",
        confirmationState: "confirmed",
        heldAmount: 0,
        attendanceState: "present",
      })
      .onConflictDoNothing();

    const result = await services.booking.checkTutorLateness();
    expect(result.autoCancelled).toBe(0);

    const [row] = await db.select().from(booking).where(eq(booking.id, b.id));
    expect(row!.currentState).toBe("scheduled");
  });

  test("tutor markAttendance present after start → no auto-cancel (G3 acceptance)", async () => {
    const start = new Date(Date.now() + 96 * 3600_000).toISOString();
    const end = new Date(Date.now() + 97 * 3600_000).toISOString();
    const b = await studentClient.booking.createSolo({
      tutorId,
      availabilitySlotId: slotId,
      modality: "online",
      scheduledStartAt: start,
      scheduledEndAt: end,
      timezone: "Asia/Jakarta",
    });

    await tutorClient.tutorActions.acceptBooking({ bookingId: b.id });

    await db
      .update(booking)
      .set({ scheduledStartAt: new Date(Date.now() - 5 * 60_000) })
      .where(eq(booking.id, b.id));

    const marked = await tutorClient.tutorActions.markAttendance({
      bookingId: b.id,
      attendance: "present",
    });
    expect(marked.attendanceState).toBe("present");

    const result = await services.booking.checkTutorLateness();
    expect(result.autoCancelled).toBe(0);

    const [row] = await db.select().from(booking).where(eq(booking.id, b.id));
    expect(row!.currentState).toBe("scheduled");

    const [participant] = await db
      .select()
      .from(bookingParticipant)
      .where(
        and(
          eq(bookingParticipant.bookingId, b.id),
          eq(bookingParticipant.userId, tutorId),
        ),
      );
    expect(participant!.attendanceState).toBe("present");
  });
});
