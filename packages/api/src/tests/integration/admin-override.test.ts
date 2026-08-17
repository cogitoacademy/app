import { describe, expect, test, beforeAll } from "bun:test";
import { eq, and } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  wallet,
  ledgerEntry,
  booking,
  bookingStateHistory,
  tutorInvite,
  tutorProfile,
  availabilitySlot,
} from "@cogito-app/db/schema";

import { services } from "../../services";
import {
  createTestContext,
  createTestClient,
  signUpAndSignIn,
  setUserRole,
  resetDatabase,
  type TestClient,
} from "../helpers/test-client";

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
): Promise<{ tutorId: string; tutorClient: TestClient }> {
  await signUpAndSignIn(email, "Test1234!", "Tutor Override");
  const tutorCookie = await signInAndGetCookie(email, "Test1234!");
  const tutorCtx = await createTestContext(tutorCookie ?? "");
  if (!tutorCtx.session?.user) throw new Error("Tutor session missing");
  const tutorId = tutorCtx.session.user.id;
  await setUserRole(tutorId, "tutor");

  const [invite] = await db
    .insert(tutorInvite)
    .values({
      email,
      displayName: "Prof Override",
      token: `token-ovr-${ts}`,
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
      displayName: "Prof Override",
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
  const end = new Date(start.getTime() + 7 * 24 * 3600_000);
  const [slot] = await db
    .insert(availabilitySlot)
    .values({
      tutorId,
      startDate: start,
      endDate: end,
      modality: "online",
    })
    .returning();

  return {
    tutorId,
    tutorClient: createTestClient(await createTestContext(tutorCookie ?? "")),
    slotId: slot!.id,
  };
}

describe("Admin Override", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  test("override on non-existent booking returns not found", async () => {
    try {
      await services.adminBooking.applyOverride("admin-test-1", {
        bookingId: "nonexistent-booking-id",
        category: "force_cancel",
        reason: "Force cancel",
        affectedParticipants: [],
      });
      expect.unreachable("Should have thrown");
    } catch (err: any) {
      expect(err.message).toContain("not found");
    }
  });

  test("list bookings returns paginated result", async () => {
    const result = await services.adminBooking.listBookings({ limit: 10 });
    expect(result).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
  });

  test("getBookingStateHistory on non-existent booking returns not found", async () => {
    try {
      await services.adminBooking.getBookingStateHistory("nonexistent-id");
      expect.unreachable("Should have thrown");
    } catch (err: any) {
      expect(err.message).toContain("not found");
    }
  });

  test("adminRefund on non-existent payment returns not found", async () => {
    try {
      await services.adminBooking.adminRefund("admin-test-2", {
        paymentId: "nonexistent-payment",
        reason: "Test refund",
      });
      expect.unreachable("Should have thrown");
    } catch (err: any) {
      expect(err.message).toContain("not found");
    }
  });
});

describe("Admin Override happy path", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();
  const adminEmail = `admin.ovr.${ts}@cogito.test`;
  const studentEmail = `student.ovr.${ts}@cogito.test`;
  const tutorEmail = `tutor.ovr.${ts}@cogito.test`;

  let adminClient: TestClient;
  let adminId: string;
  let studentClient: TestClient;
  let studentId: string;
  let bookingId: string;

  beforeAll(async () => {
    const adminRes = await signUpAndSignIn(adminEmail, "Test1234!", "Admin");
    const adminCtx = await createTestContext(adminRes.cookie);
    if (!adminCtx.session?.user) throw new Error("Admin session missing");
    adminId = adminCtx.session.user.id;
    await setUserRole(adminId, "admin");
    adminClient = createTestClient(await createTestContext(adminRes.cookie));

    const studentRes = await signUpAndSignIn(
      studentEmail,
      "Test1234!",
      "Student",
    );
    const studentCtx = await createTestContext(studentRes.cookie);
    if (!studentCtx.session?.user) throw new Error("Student session missing");
    studentId = studentCtx.session.user.id;
    await creditWallet(studentId, 200);
    studentClient = createTestClient(studentCtx);

    const tutor = await createPublishedTutor(tutorEmail, ts);
    const start = new Date(Date.now() + 24 * 3600_000).toISOString();
    const end = new Date(Date.now() + 25 * 3600_000).toISOString();
    const b = await studentClient.booking.createSolo({
      tutorId: tutor.tutorId,
      availabilitySlotId: (
        await db
          .select()
          .from(availabilitySlot)
          .where(eq(availabilitySlot.tutorId, tutor.tutorId))
          .limit(1)
      )[0]!.id,
      modality: "online",
      scheduledStartAt: start,
      scheduledEndAt: end,
      timezone: "Asia/Jakarta",
    });
    bookingId = b.id;
  });

  test("override with force_cancel + release_holds transitions the booking", async () => {
    const [before] = await db
      .select()
      .from(booking)
      .where(eq(booking.id, bookingId));
    expect(before!.currentState).toBe("awaiting_tutor_review");
    expect(before!.holdAmount).toBeGreaterThan(0);

    const updated = await adminClient.adminBooking.applyOverride({
      bookingId,
      category: "force_cancel",
      reason: "Dibatalkan oleh admin",
      affectedParticipants: [studentId],
      marksAction: "release_holds",
      userNote: "Hubungi admin",
    });
    expect(updated.currentState).toBe("cancelled");
    expect(updated.previousState).toBe("awaiting_tutor_review");
    expect(updated.overrideMeta).toMatchObject({ category: "force_cancel" });
    // P1-5 regression: the response must reflect the post-override holdAmount
    // (released to 0), not the stale pre-update value.
    expect(updated.holdAmount).toBe(0);

    const [after] = await db
      .select()
      .from(booking)
      .where(eq(booking.id, bookingId));
    expect(after!.currentState).toBe("cancelled");
    expect(after!.previousState).toBe("awaiting_tutor_review");
    expect(after!.holdAmount).toBe(0);
    expect(after!.stateReason).toBe("Dibatalkan oleh admin");
  });

  test("bookingStateHistory row records the admin override", async () => {
    const history = await db
      .select()
      .from(bookingStateHistory)
      .where(
        and(
          eq(bookingStateHistory.bookingId, bookingId),
          eq(bookingStateHistory.toState, "cancelled"),
          eq(bookingStateHistory.actorType, "admin"),
        ),
      );
    expect(history.length).toBe(1);
    expect(history[0]!.fromState).toBe("awaiting_tutor_review");
    expect(history[0]!.reason).toBe("Dibatalkan oleh admin");
    expect(history[0]!.actorId).toBe(adminId);
    expect(history[0]!.metadata).toMatchObject({ category: "force_cancel" });
  });

  test("student wallet hold is released and ledger entry written", async () => {
    const [w] = await db
      .select()
      .from(wallet)
      .where(eq(wallet.userId, studentId));
    expect(w!.heldBalance).toBe(0);
    expect(w!.availableBalance).toBe(200);
    expect(w!.totalBalance).toBe(200);

    const entries = await db
      .select()
      .from(ledgerEntry)
      .where(eq(ledgerEntry.bookingId, bookingId));
    const release = entries.find((e) => e.entryType === "release");
    expect(release).toBeDefined();
    expect(release!.actorType).toBe("admin");
    expect(release!.eventKey).toContain(`override.release.${bookingId}`);
    expect(release!.afterBalance).toBe(200);
  });

  test("override cannot be applied twice to a terminal booking", async () => {
    await expect(
      adminClient.adminBooking.applyOverride({
        bookingId,
        category: "tutor_no_show",
        reason: "Double override",
        affectedParticipants: [studentId],
        marksAction: "release_holds",
      }),
    ).rejects.toThrow();
  });
});
