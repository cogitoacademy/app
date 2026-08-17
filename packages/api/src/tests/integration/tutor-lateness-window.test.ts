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
import { LATENESS_TOLERANCE_MS } from "../../shared/constants";

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
  await signUpAndSignIn(email, "Test1234!", "Tutor Window");
  const tutorCookie = await signInAndGetCookie(email, "Test1234!");
  const tutorCtx = await createTestContext(tutorCookie ?? "");
  if (!tutorCtx.session?.user) throw new Error("Tutor session missing");
  const tutorId = tutorCtx.session.user.id;
  await setUserRole(tutorId, "tutor");

  const [invite] = await db
    .insert(tutorInvite)
    .values({
      email,
      displayName: "Tutor Window",
      token: `token-window-${ts}`,
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
      displayName: "Tutor Window",
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

async function createAcceptedSoloBooking(
  studentClient: TestClient,
  tutorClient: TestClient,
  tutorId: string,
  slotId: string,
  hoursFromNow: number,
) {
  const start = new Date(Date.now() + hoursFromNow * 3600_000).toISOString();
  const end = new Date(
    Date.now() + hoursFromNow * 3600_000 + 90 * 60_000,
  ).toISOString();
  const b = await studentClient.booking.createSolo({
    tutorId,
    availabilitySlotId: slotId,
    modality: "online",
    scheduledStartAt: start,
    scheduledEndAt: end,
    timezone: "Asia/Jakarta",
  });
  await tutorClient.tutorActions.acceptBooking({ bookingId: b.id });
  return b;
}

describe("Tutor attendance marking window", () => {
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
      `student.window.${ts}@cogito.test`,
      "Test1234!",
      "Student Window",
    );
    studentClient = createTestClient(
      await createTestContext(studentRes.cookie),
    );
    const ctx = await createTestContext(studentRes.cookie);
    if (ctx.session?.user) {
      await creditWallet(ctx.session.user.id, 200);
    }

    const tutor = await createPublishedTutor(
      `tutor.window.${ts}@cogito.test`,
      ts,
    );
    tutorId = tutor.tutorId;
    slotId = tutor.slotId;

    const tutorCookie = await signInAndGetCookie(
      `tutor.window.${ts}@cogito.test`,
      "Test1234!",
    );
    tutorClient = createTestClient(await createTestContext(tutorCookie));
  });

  test("admin queue surfaces flagged bookings via overrideMeta.category", async () => {
    const b = await createAcceptedSoloBooking(
      studentClient,
      tutorClient,
      tutorId,
      slotId,
      120,
    );

    await db
      .update(booking)
      .set({
        scheduledStartAt: new Date(Date.now() - 20 * 60_000),
        scheduledEndAt: new Date(Date.now() + 70 * 60_000),
      })
      .where(eq(booking.id, b.id));

    const result = await services.booking.checkTutorLateness();
    expect(result.flagged).toBe(1);
    expect(result.failed).toBe(0);

    const listed = await services.adminBooking.listBookings({
      category: "tutor_lateness_pending",
    });
    expect(listed.items.some((item) => item.id === b.id)).toBe(true);

    const [row] = await db.select().from(booking).where(eq(booking.id, b.id));
    expect(row!.currentState).toBe("scheduled");
    expect(row!.overrideMeta).toMatchObject({
      category: "tutor_lateness_pending",
    });

    const [proposerWallet] = await db
      .select()
      .from(wallet)
      .where(eq(wallet.userId, row!.proposerId));
    expect(proposerWallet!.heldBalance).toBeGreaterThan(0);

    const released = await db
      .select()
      .from(ledgerEntry)
      .where(eq(ledgerEntry.bookingId, b.id));
    expect(released.some((e) => e.entryType === "release")).toBe(false);
  });

  test("rejects pre-marking attendance days before the session", async () => {
    const b = await createAcceptedSoloBooking(
      studentClient,
      tutorClient,
      tutorId,
      slotId,
      48,
    );

    await expect(
      tutorClient.tutorActions.markAttendance({
        bookingId: b.id,
        attendance: "present",
      }),
    ).rejects.toThrow(/editable/i);

    const [row] = await db.select().from(booking).where(eq(booking.id, b.id));
    expect(row!.overrideMeta).toBeNull();

    const tutorRows = await db
      .select()
      .from(bookingParticipant)
      .where(
        and(
          eq(bookingParticipant.bookingId, b.id),
          eq(bookingParticipant.userId, tutorId),
          eq(bookingParticipant.role, "tutor"),
        ),
      );
    expect(tutorRows.length).toBe(0);
  });

  test("rejects marking attendance 30 minutes after the session started", async () => {
    const b = await createAcceptedSoloBooking(
      studentClient,
      tutorClient,
      tutorId,
      slotId,
      72,
    );

    await db
      .update(booking)
      .set({
        scheduledStartAt: new Date(
          Date.now() - LATENESS_TOLERANCE_MS - 15 * 60_000,
        ),
        scheduledEndAt: new Date(Date.now() + 60 * 60_000),
      })
      .where(eq(booking.id, b.id));

    await expect(
      tutorClient.tutorActions.markAttendance({
        bookingId: b.id,
        attendance: "present",
      }),
    ).rejects.toThrow(/editable/i);
  });

  test("allows marking attendance at the window boundary (start - 15 min)", async () => {
    const b = await createAcceptedSoloBooking(
      studentClient,
      tutorClient,
      tutorId,
      slotId,
      96,
    );

    const epsilonMs = 2 * 60_000;
    await db
      .update(booking)
      .set({
        scheduledStartAt: new Date(
          Date.now() - (LATENESS_TOLERANCE_MS - epsilonMs),
        ),
        scheduledEndAt: new Date(
          Date.now() - (LATENESS_TOLERANCE_MS - epsilonMs) + 90 * 60_000,
        ),
      })
      .where(eq(booking.id, b.id));

    const marked = await tutorClient.tutorActions.markAttendance({
      bookingId: b.id,
      attendance: "present",
    });
    expect(marked.attendanceState).toBe("present");

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
