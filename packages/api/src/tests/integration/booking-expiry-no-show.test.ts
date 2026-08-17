import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  booking,
  wallet,
  ledgerEntry,
  tutorInvite,
  tutorProfile,
  availabilitySlot,
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
import { ENTRY_TYPE } from "../../shared/constants";
import { BOOKING_STATE } from "../../modules/booking/booking-state.types";
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
): Promise<{ tutorId: string; slotId: string; tutorClient: TestClient }> {
  await signUpAndSignIn(email, "Test1234!", "Tutor ExpNoShow");
  const tutorCookie = await signInAndGetCookie(email, "Test1234!");
  const tutorCtx = await createTestContext(tutorCookie ?? "");
  if (!tutorCtx.session?.user) throw new Error("Tutor session missing");
  const tutorId = tutorCtx.session.user.id;
  await setUserRole(tutorId, "tutor");

  const [invite] = await db
    .insert(tutorInvite)
    .values({
      email,
      displayName: "Prof ExpNoShow",
      token: `token-ens-${ts}`,
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
      displayName: "Prof ExpNoShow",
      shortBio: "Bio",
      credentialsSummary: "Creds",
      expertise: ["Mathematics"],
      modality: "online",
      prices: { "1": 50, "2": 45, "3": 40, "4": 35, "5": 30, "6": 28 },
      availabilitySummary: "Flexible",
      onboardingStatus: "published",
      publishedAt: new Date(),
    })
    .execute();

  const start = new Date(Date.now() + 1 * 3600_000);
  const [slot] = await db
    .insert(availabilitySlot)
    .values({
      tutorId,
      startDate: start,
      endDate: new Date(start.getTime() + 7 * 24 * 3600_000),
      modality: "online",
    })
    .returning();

  return {
    tutorId,
    slotId: slot!.id,
    tutorClient: createTestClient(await createTestContext(tutorCookie ?? "")),
  };
}

describe("M2: expireBookings SCHEDULED→NO_SHOW forfeits holds instead of releasing", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();
  const tutorEmail = `tutor.ens.${ts}@cogito.test`;
  const studentEmail = `student.ens.${ts}@cogito.test`;

  let studentClient: TestClient;
  let studentId: string;
  let tutorId: string;
  let slotId: string;
  let tutorClient: TestClient;

  beforeAll(async () => {
    const studentRes = await signUpAndSignIn(
      studentEmail,
      "Test1234!",
      "Student ExpNoShow",
    );
    studentClient = createTestClient(
      await createTestContext(studentRes.cookie),
    );
    const studentCtx = await createTestContext(studentRes.cookie);
    if (!studentCtx.session?.user) throw new Error("Student session missing");
    studentId = studentCtx.session.user.id;
    await creditWallet(studentId, 200);

    const tutor = await createPublishedTutor(tutorEmail, ts);
    tutorId = tutor.tutorId;
    slotId = tutor.slotId;
    tutorClient = tutor.tutorClient;
  });

  test("SCHEDULED booking with passed deadline → NO_SHOW with forfeit (deduct), not release", async () => {
    const start = new Date(Date.now() + 48 * 3600_000);
    const b = await studentClient.booking.createSolo({
      tutorId,
      availabilitySlotId: slotId,
      modality: "online",
      scheduledStartAt: start.toISOString(),
      scheduledEndAt: new Date(start.getTime() + 3600_000).toISOString(),
      timezone: "Asia/Jakarta",
    });

    const accepted = await tutorClient.tutorActions.acceptBooking({
      bookingId: b.id,
    });
    expect(accepted.currentState).toBe(BOOKING_STATE.SCHEDULED);

    // The session happened (past) and the SCHEDULED grace deadline passed.
    await db
      .update(booking)
      .set({
        scheduledStartAt: new Date(Date.now() - 3 * 3600_000),
        scheduledEndAt: new Date(Date.now() - 2 * 3600_000),
        deadlineAt: new Date(Date.now() - 60_000),
      })
      .where(eq(booking.id, b.id));

    const [wBefore] = await db
      .select()
      .from(wallet)
      .where(eq(wallet.userId, studentId));
    expect(wBefore!.heldBalance).toBeGreaterThan(0);
    const heldBefore = wBefore!.heldBalance;

    const result = await services.booking.expireBookings();
    expect(result.expired).toBeGreaterThanOrEqual(1);
    expect(result.failed).toBe(0);

    const [row] = await db.select().from(booking).where(eq(booking.id, b.id));
    expect(row!.currentState).toBe(BOOKING_STATE.NO_SHOW);
    expect(row!.holdAmount).toBe(0);

    // Forfeit: held → 0 AND total reduced (deduct), NOT released.
    const [wAfter] = await db
      .select()
      .from(wallet)
      .where(eq(wallet.userId, studentId));
    expect(wAfter!.heldBalance).toBe(0);
    expect(wAfter!.totalBalance).toBe(200 - heldBefore);
    expect(wAfter!.availableBalance).toBe(200 - heldBefore);

    const entries = await db
      .select()
      .from(ledgerEntry)
      .where(eq(ledgerEntry.bookingId, b.id));
    const deducts = entries.filter(
      (e) =>
        e.entryType === ENTRY_TYPE.DEDUCT && e.eventKey.includes("no_show"),
    );
    expect(deducts.length).toBe(1);
    expect(deducts[0]!.amount).toBe(heldBefore);
    expect(deducts[0]!.actorType).toBe("system");
    expect(entries.some((e) => e.entryType === ENTRY_TYPE.RELEASE)).toBe(false);
  });
});
