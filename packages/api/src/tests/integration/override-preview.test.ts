import { describe, expect, test, beforeAll } from "bun:test";
import { eq, and } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  wallet,
  booking,
  bookingStateHistory,
  ledgerEntry,
  auditLog,
  tutorInvite,
  tutorProfile,
  availabilitySlot,
} from "@cogito-app/db/schema";

import { services } from "../../services";
import {
  createTestClient,
  createTestContext,
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

describe("Admin override preview (G10)", () => {
  const ts = Date.now();
  const adminEmail = `g10.admin.${ts}@cogito.test`;
  const studentEmail = `g10.student.${ts}@cogito.test`;
  const tutorEmail = `g10.tutor.${ts}@cogito.test`;

  let adminClient: TestClient;
  let adminId: string;
  let studentId: string;
  let bookingId: string;

  beforeAll(async () => {
    await resetDatabase();

    const adminRes = await signUpAndSignIn(
      adminEmail,
      "Test1234!",
      "G10 Admin",
    );
    const adminCtx = await createTestContext(adminRes.cookie);
    adminId = adminCtx.session!.user!.id;
    await setUserRole(adminId, "admin");
    adminClient = createTestClient(await createTestContext(adminRes.cookie));

    const studentRes = await signUpAndSignIn(
      studentEmail,
      "Test1234!",
      "G10 Student",
    );
    const studentCtx = await createTestContext(studentRes.cookie);
    studentId = studentCtx.session!.user!.id;
    await creditWallet(studentId, 200);

    const tutorRes = await signUpAndSignIn(
      tutorEmail,
      "Test1234!",
      "G10 Tutor",
    );
    const tutorCtx = await createTestContext(tutorRes.cookie);
    const tutorId = tutorCtx.session!.user!.id;
    await setUserRole(tutorId, "tutor");

    const [invite] = await db
      .insert(tutorInvite)
      .values({
        email: tutorEmail,
        displayName: "G10 Tutor",
        token: `token-g10-${ts}`,
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
        displayName: "G10 Tutor",
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

    const slotStart = new Date(Date.now() + 24 * 3600_000);
    const slotEnd = new Date(Date.now() + 26 * 3600_000);
    await db
      .insert(availabilitySlot)
      .values({
        tutorId,
        startDate: slotStart,
        endDate: slotEnd,
        modality: "online",
      })
      .execute();

    const start = new Date(Date.now() + 24 * 3600_000).toISOString();
    const end = new Date(Date.now() + 25 * 3600_000).toISOString();
    const studentClient = createTestClient(studentCtx);
    const b = await studentClient.booking.createSolo({
      tutorId,
      availabilitySlotId: (
        await db
          .select()
          .from(availabilitySlot)
          .where(eq(availabilitySlot.tutorId, tutorId))
          .limit(1)
      )[0]!.id,
      modality: "online",
      scheduledStartAt: start,
      scheduledEndAt: end,
      timezone: "Asia/Jakarta",
    });
    bookingId = b.id;
  });

  test("preview returns projected state and wallet impact", async () => {
    const [before] = await db
      .select()
      .from(booking)
      .where(eq(booking.id, bookingId));
    expect(before!.currentState).toBe("awaiting_tutor_review");

    const preview = await adminClient.adminBooking.previewOverride({
      bookingId,
      category: "force_cancel",
      reason: "Preview force cancel",
      affectedParticipants: [studentId],
      marksAction: "release_holds",
    });

    expect(preview.bookingId).toBe(bookingId);
    expect(preview.currentState).toBe("awaiting_tutor_review");
    expect(preview.projectedState).toBe("cancelled");
    expect(preview.affectedParticipants).toEqual([studentId]);
    expect(preview.marksAction).toBe("release_holds");
    expect(preview.perParticipantImpact).toHaveLength(1);
    expect(preview.perParticipantImpact[0]!.userId).toBe(studentId);
    expect(preview.perParticipantImpact[0]!.action).toBe("release_holds");
    expect(preview.perParticipantImpact[0]!.heldAmount).toBeGreaterThan(0);
    expect(preview.perParticipantImpact[0]!.before.heldBalance).toBeGreaterThan(
      0,
    );
  });

  test("preview writes NOTHING: booking state, wallet, history, audit, ledger all unchanged", async () => {
    const [bookingBefore] = await db
      .select()
      .from(booking)
      .where(eq(booking.id, bookingId));
    const [walletBefore] = await db
      .select()
      .from(wallet)
      .where(eq(wallet.userId, studentId));
    const historyCountBefore = (
      await db
        .select()
        .from(bookingStateHistory)
        .where(eq(bookingStateHistory.bookingId, bookingId))
    ).length;
    const auditCountBefore = (
      await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.targetId, bookingId),
            eq(auditLog.targetType, "booking"),
          ),
        )
    ).length;
    const ledgerCountBefore = (
      await db
        .select()
        .from(ledgerEntry)
        .where(eq(ledgerEntry.bookingId, bookingId))
    ).length;

    await adminClient.adminBooking.previewOverride({
      bookingId,
      category: "force_cancel",
      reason: "Preview again",
      affectedParticipants: [studentId],
      marksAction: "release_holds",
    });

    const [bookingAfter] = await db
      .select()
      .from(booking)
      .where(eq(booking.id, bookingId));
    const [walletAfter] = await db
      .select()
      .from(wallet)
      .where(eq(wallet.userId, studentId));
    const historyCountAfter = (
      await db
        .select()
        .from(bookingStateHistory)
        .where(eq(bookingStateHistory.bookingId, bookingId))
    ).length;
    const auditCountAfter = (
      await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.targetId, bookingId),
            eq(auditLog.targetType, "booking"),
          ),
        )
    ).length;
    const ledgerCountAfter = (
      await db
        .select()
        .from(ledgerEntry)
        .where(eq(ledgerEntry.bookingId, bookingId))
    ).length;

    expect(bookingAfter!.currentState).toBe(bookingBefore!.currentState);
    expect(bookingAfter!.overrideMeta).toBeNull();
    expect(walletAfter!.totalBalance).toBe(walletBefore!.totalBalance);
    expect(walletAfter!.heldBalance).toBe(walletBefore!.heldBalance);
    expect(walletAfter!.availableBalance).toBe(walletBefore!.availableBalance);
    expect(historyCountAfter).toBe(historyCountBefore);
    expect(auditCountAfter).toBe(auditCountBefore);
    expect(ledgerCountAfter).toBe(ledgerCountBefore);
  });

  test("preview on non-existent booking returns not found", async () => {
    await expect(
      adminClient.adminBooking.previewOverride({
        bookingId: "nonexistent",
        category: "force_cancel",
        reason: "Preview",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
