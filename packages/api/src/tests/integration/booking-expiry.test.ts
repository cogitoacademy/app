import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  booking,
  wallet,
  tutorInvite,
  tutorProfile,
  availabilitySlot,
  ledgerEntry,
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
  await signUpAndSignIn(email, "Test1234!", "Tutor Exp");
  const tutorCookie = await signInAndGetCookie(email, "Test1234!");
  const tutorCtx = await createTestContext(tutorCookie ?? "");
  if (!tutorCtx.session?.user) throw new Error("Tutor session missing");
  const tutorId = tutorCtx.session.user.id;
  await setUserRole(tutorId, "tutor");

  const [invite] = await db
    .insert(tutorInvite)
    .values({
      email,
      displayName: "Tutor Exp",
      token: `token-exp-${ts}`,
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
      displayName: "Tutor Exp",
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

describe("Booking expiry notification flow", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();
  let studentClient: TestClient;
  let tutorId: string;
  let slotId: string;

  beforeAll(async () => {
    const studentRes = await signUpAndSignIn(
      `student.exp.${ts}@cogito.test`,
      "Test1234!",
      "Student Exp",
    );
    studentClient = createTestClient(
      await createTestContext(studentRes.cookie),
    );
    const ctx = await createTestContext(studentRes.cookie);
    if (ctx.session?.user) {
      await creditWallet(ctx.session.user.id, 200);
    }

    const tutor = await createPublishedTutor(`tutor.exp.${ts}@cogito.test`, ts);
    tutorId = tutor.tutorId;
    slotId = tutor.slotId;
  });

  test("expireBookings transitions, releases holds, and writes a notification", async () => {
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

    await db
      .update(booking)
      .set({ deadlineAt: new Date(Date.now() - 60_000) })
      .where(eq(booking.id, b.id));

    const result = await services.booking.expireBookings();
    expect(result.expired).toBe(1);
    expect(result.failed).toBe(0);

    const [expired] = await db
      .select()
      .from(booking)
      .where(eq(booking.id, b.id));
    expect(expired!.currentState).toBe("expired");
    expect(expired!.holdAmount).toBe(0);

    const notifs = await db
      .select()
      .from(notification)
      .where(eq(notification.eventKey, `booking.${b.id}.expired.student`));
    expect(notifs.length).toBe(1);
    expect(notifs[0]!.title).toBe("Booking expired");
    expect(notifs[0]!.bookingId).toBe(b.id);

    const tutorNotifs = await db
      .select()
      .from(notification)
      .where(eq(notification.eventKey, `booking.${b.id}.expired.tutor`));
    expect(tutorNotifs.length).toBe(1);

    const released = await db
      .select()
      .from(ledgerEntry)
      .where(eq(ledgerEntry.bookingId, b.id));
    expect(released.some((e) => e.entryType === "release")).toBe(true);
  });

  test("releaseExpiredHolds writes a hold-release notification", async () => {
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

    await db
      .update(booking)
      .set({ deadlineAt: new Date(Date.now() - 60_000) })
      .where(eq(booking.id, b.id));

    const result = await services.booking.releaseExpiredHolds();
    expect(result.released).toBe(1);

    const notifs = await db
      .select()
      .from(notification)
      .where(eq(notification.eventKey, `booking.${b.id}.hold_released_expiry`));
    expect(notifs.length).toBe(1);
    expect(notifs[0]!.title).toBe("Booking hold released");
  });
});
