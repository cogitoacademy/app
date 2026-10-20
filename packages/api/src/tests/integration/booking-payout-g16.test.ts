import { TEST_COMPLETION_FEEDBACK } from "../helpers/completion-feedback";
import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  wallet,
  tutorInvite,
  tutorProfile,
  availabilitySlot,
  booking as bookingTable,
  bookingSession,
  tutorPayout,
  tutorSessionFee,
  tutorPayoutAllocation,
} from "@cogito-app/db/schema";
import { TUTOR_PAYOUT_RATE_IDR } from "../../shared/constants";

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
  const res = await signUpAndSignIn(email, "Test1234!", "Prof Payout");
  const signupCtx = await createTestContext(res.cookie);
  const tutorId = signupCtx.session!.user.id;
  await setUserRole(tutorId, "tutor");

  const tutorCookie = await signInAndGetCookie(email, "Test1234!");
  const tutorClient = createTestClient(
    await createTestContext(tutorCookie ?? ""),
  );

  const [invite] = await db
    .insert(tutorInvite)
    .values({
      email,
      displayName: "Prof Payout",
      token: `token-pay-${ts}`,
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
      shortBio: "Bio",
      modality: "both",
      prices: { "1": 50, "2": 45, "3": 40, "4": 35, "5": 30, "6": 28 },
      onboardingStatus: "published",
      publishedAt: new Date(),
    })
    .execute();

  const start = new Date(Date.now() + 1 * 3600_000);
  const end = new Date(start.getTime() + 7 * 24 * 3600_000);
  const [slot] = await db
    .insert(availabilitySlot)
    .values({ tutorId, startDate: start, endDate: end, modality: "both" })
    .returning();

  return { tutorId, tutorClient, slotId: slot!.id };
}

async function insertBookingRow(
  overrides: Partial<typeof bookingTable.$inferInsert>,
) {
  const [row] = await db
    .insert(bookingTable)
    .values({
      id: crypto.randomUUID(),
      type: "solo",
      modality: "online",
      tutorId: overrides.tutorId!,
      proposerId: overrides.proposerId!,
      targetGroupSize: 1,
      minConfirmedHeadcount: 1,
      confirmedHeadcount: 1,
      currentState: "completed",
      scheduledStartAt: new Date(Date.now() + 48 * 3600_000),
      scheduledEndAt: new Date(Date.now() + 48 * 3600_000 + 3600_000),
      timezone: "Asia/Jakarta",
      priceSnapshot: {
        perStudent: 50,
        baseline: 50,
        tutorShare: 40,
        cogitoTake: 10,
      },
      originalMarks: 50,
      holdAmount: 0,
      deadlineAt: new Date(Date.now() + 86400000),
      ...overrides,
    })
    .returning();
  return row!;
}

describe("Tutor payouts (G16)", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();
  const studentEmail = `student.pay.${ts}@cogito.test`;
  const tutorEmail = `tutor.pay.${ts}@cogito.test`;
  const adminEmail = `admin.pay.${ts}@cogito.test`;
  const secondAdminEmail = `admin.pay.second.${ts}@cogito.test`;

  let studentClient: TestClient;
  let tutorClient: TestClient;
  let adminClient: TestClient;
  let secondAdminClient: TestClient;
  let adminId: string;
  let studentId: string;
  let tutorId: string;
  let slotId: string;

  beforeAll(async () => {
    const studentRes = await signUpAndSignIn(
      studentEmail,
      "Test1234!",
      "Student Payout",
    );
    studentClient = createTestClient(
      await createTestContext(studentRes.cookie),
    );
    const studentCtx = await createTestContext(studentRes.cookie);
    studentId = studentCtx.session!.user.id;
    await creditWallet(studentId, 500);

    const tutorData = await createPublishedTutor(tutorEmail, ts);
    tutorId = tutorData.tutorId;
    tutorClient = tutorData.tutorClient;
    slotId = tutorData.slotId;

    const adminRes = await signUpAndSignIn(
      adminEmail,
      "Test1234!",
      "Admin Payout",
    );
    const adminCtx = await createTestContext(adminRes.cookie);
    adminId = adminCtx.session!.user.id;
    await setUserRole(adminId, "admin");
    adminClient = createTestClient(
      await createTestContext(
        (await signInAndGetCookie(adminEmail, "Test1234!")) ?? "",
      ),
    );

    const secondAdminRes = await signUpAndSignIn(
      secondAdminEmail,
      "Test1234!",
      "Second Admin Payout",
    );
    const secondAdminCtx = await createTestContext(secondAdminRes.cookie);
    await setUserRole(secondAdminCtx.session!.user.id, "admin");
    secondAdminClient = createTestClient(
      await createTestContext(secondAdminRes.cookie),
    );
  });

  test("solo booking flows to completed with G19 snapshot 50/37/13", async () => {
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

    await tutorClient.tutorActions.acceptBooking({ bookingId: b.id });
    await db
      .update(bookingTable)
      .set({ scheduledStartAt: new Date(Date.now() - 30 * 60_000) })
      .where(eq(bookingTable.id, b.id));
    const updated = await tutorClient.tutorActions.completeSession({
      feedback: TEST_COMPLETION_FEEDBACK,
      bookingId: b.id,
    });
    expect(updated.currentState).toBe("completed");

    const [row] = await db
      .select()
      .from(bookingTable)
      .where(eq(bookingTable.id, b.id));
    expect(row!.priceSnapshot).toMatchObject({
      perStudent: 50,
      baseline: 42,
      tutorShare: 37,
      cogitoTake: 13,
    });
  });

  test("completed group + cancelled + completed series bookings seeded", async () => {
    await insertBookingRow({
      type: "group",
      tutorId,
      proposerId: studentId,
      targetGroupSize: 3,
      minConfirmedHeadcount: 2,
      confirmedHeadcount: 3,
      priceSnapshot: {
        perStudent: 50,
        baseline: 150,
        tutorShare: 120,
        cogitoTake: 30,
      },
      originalMarks: 150,
      completedAt: new Date(Date.now() - 60_000),
    });

    await insertBookingRow({
      type: "solo",
      tutorId,
      proposerId: studentId,
      currentState: "cancelled",
      priceSnapshot: {
        perStudent: 50,
        baseline: 50,
        tutorShare: 40,
        cogitoTake: 10,
      },
      originalMarks: 50,
    });

    const series = await insertBookingRow({
      type: "series",
      tutorId,
      proposerId: studentId,
      priceSnapshot: {
        perStudent: 50,
        baseline: 50,
        tutorShare: 40,
        cogitoTake: 10,
      },
      originalMarks: 100,
      completedAt: new Date(Date.now() - 60_000),
    });

    const s1 = new Date(Date.now() + 72 * 3600_000);
    const s2 = new Date(Date.now() + 96 * 3600_000);
    await db.insert(bookingSession).values([
      {
        seriesBookingId: series.id,
        scheduledStartAt: s1,
        scheduledEndAt: new Date(s1.getTime() + 3600_000),
        currentState: "completed",
        holdAmount: 50,
        priceSnapshot: {
          perStudent: 50,
          baseline: 50,
          tutorShare: 40,
          cogitoTake: 10,
        },
      },
      {
        seriesBookingId: series.id,
        scheduledStartAt: s2,
        scheduledEndAt: new Date(s2.getTime() + 3600_000),
        currentState: "completed",
        holdAmount: 50,
        priceSnapshot: {
          perStudent: 50,
          baseline: 50,
          tutorShare: 40,
          cogitoTake: 10,
        },
      },
    ]);
  });

  test("admin.getTutorPayouts sums tutorShare/cogitoTake from completed bookings only", async () => {
    const result = await adminClient.admin.getTutorPayouts({ tutorId });

    // solo (1) + group (1) + series (2 sessions) = 4 completed sessions
    expect(result.completedSessions).toBe(4);
    expect(result.totalMarks).toBe(292);
    expect(result.cogitoTake).toBe(63);
    expect(result.tutorPayout).toBe(237);
    expect(result.tutorPayoutIdr).toBe(237 * TUTOR_PAYOUT_RATE_IDR);
  });

  test("admin.getTutorPayouts respects date range", async () => {
    const now = new Date();
    const all = await adminClient.admin.getTutorPayouts({ tutorId });
    const narrowed = await adminClient.admin.getTutorPayouts({
      tutorId,
      dateFrom: new Date(now.getTime() - 24 * 3600_000).toISOString(),
      dateTo: new Date(now.getTime() + 10 * 86400_000).toISOString(),
    });
    expect(narrowed.completedSessions).toBe(all.completedSessions);

    const empty = await adminClient.admin.getTutorPayouts({
      tutorId,
      dateFrom: new Date(now.getTime() + 30 * 86400_000).toISOString(),
      dateTo: new Date(now.getTime() + 40 * 86400_000).toISOString(),
    });
    expect(empty.completedSessions).toBe(0);
    expect(empty.tutorPayout).toBe(0);
  });

  test("admin pending payout exposes an auditable session breakdown", async () => {
    const pending = await adminClient.admin.getPendingTutorPayouts({ tutorId });

    expect(pending.completedSessions).toBe(4);
    expect(pending.items).toHaveLength(4);
    expect(
      pending.items?.filter((item) => item.sourceType === "fee_event"),
    ).toHaveLength(1);
    expect(
      pending.items?.filter((item) => item.sourceType === "legacy_booking"),
    ).toHaveLength(1);
    expect(
      pending.items?.filter(
        (item) => item.sourceType === "legacy_series_session",
      ),
    ).toHaveLength(2);
    expect(
      pending.items?.reduce((sum, item) => sum + item.grossHonorariumIdr, 0),
    ).toBe(pending.tutorPayoutIdr);
    expect(pending.items?.every((item) => item.bookingNumber > 0)).toBe(true);
  });

  test("tutor.getMyPayouts returns own scoped summary", async () => {
    const result = await tutorClient.tutor.getMyPayouts({});
    expect(result.completedSessions).toBe(4);
    expect(result.tutorPayout).toBe(237);
    expect(result.cogitoTake).toBe(63);
  });

  test("tutor.getMyPayouts excludes other tutors' bookings", async () => {
    const otherTutorEmail = `tutor.pay.other.${ts}@cogito.test`;
    const other = await createPublishedTutor(otherTutorEmail, ts + 1);

    const result = await other.tutorClient.tutor.getMyPayouts({});
    expect(result.completedSessions).toBe(0);
    expect(result.tutorPayout).toBe(0);
  });

  test("preserves the paid cutoff and serializes two concurrent admin requests", async () => {
    await db
      .update(tutorProfile)
      .set({
        bankName: "BCA",
        bankAccountNumber: "001234567890",
        bankAccountHolderName: "Prof Payout",
        bankAccountOpeningCity: "Jakarta",
        bankAccountOwnership: "self",
        bankTransferDisclaimerAccepted: true,
      })
      .where(eq(tutorProfile.userId, tutorId));

    const historicalCutoff = new Date();
    await db.insert(tutorPayout).values({
      tutorId,
      cutoffAt: historicalCutoff,
      grossHonorariumIdr: 237 * TUTOR_PAYOUT_RATE_IDR,
      transferFeeIdr: 0,
      netHonorariumIdr: 237 * TUTOR_PAYOUT_RATE_IDR,
      bankName: "BCA",
      bankAccountNumber: "001234567890",
      bankAccountHolderName: "Prof Payout",
      status: "paid",
      paidAt: historicalCutoff,
      paidBy: adminId,
    });

    const beforeNewCompletion = await tutorClient.tutor.getMyPayouts({});
    expect(beforeNewCompletion.completedSessions).toBe(0);
    expect(beforeNewCompletion.tutorPayoutIdr).toBe(0);

    const start = new Date(Date.now() + 48 * 3600_000);
    const newBooking = await studentClient.booking.createSolo({
      tutorId,
      availabilitySlotId: slotId,
      modality: "online",
      scheduledStartAt: start.toISOString(),
      scheduledEndAt: new Date(start.getTime() + 3600_000).toISOString(),
      timezone: "Asia/Jakarta",
    });
    await tutorClient.tutorActions.acceptBooking({ bookingId: newBooking.id });
    await db
      .update(bookingTable)
      .set({ scheduledStartAt: new Date(Date.now() - 30 * 60_000) })
      .where(eq(bookingTable.id, newBooking.id));
    await tutorClient.tutorActions.completeSession({
      feedback: TEST_COMPLETION_FEEDBACK,
      bookingId: newBooking.id,
    });
    const [newFee] = await db
      .select()
      .from(tutorSessionFee)
      .where(eq(tutorSessionFee.bookingId, newBooking.id));
    expect(newFee).toBeDefined();

    const pendingBeforePay = await tutorClient.tutor.getMyPayouts({});
    expect(pendingBeforePay.completedSessions).toBe(1);
    expect(pendingBeforePay.tutorPayoutIdr).toBe(newFee!.grossHonorariumIdr);

    const results = await Promise.allSettled([
      adminClient.admin.markTutorPayoutPaid({ tutorId }),
      secondAdminClient.admin.markTutorPayoutPaid({ tutorId }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);

    const payouts = await db
      .select()
      .from(tutorPayout)
      .where(eq(tutorPayout.tutorId, tutorId));
    expect(payouts).toHaveLength(2);
    const newBatch = payouts.find(
      (payout) => payout.cutoffAt.getTime() > historicalCutoff.getTime(),
    );
    expect(newBatch).toMatchObject({
      status: "paid",
      grossHonorariumIdr: newFee!.grossHonorariumIdr,
      netHonorariumIdr: newFee!.grossHonorariumIdr,
    });

    const allocations = await db
      .select()
      .from(tutorPayoutAllocation)
      .where(eq(tutorPayoutAllocation.payoutId, newBatch!.id));
    expect(allocations).toHaveLength(1);
    expect(allocations[0]).toMatchObject({
      payoutId: newBatch!.id,
      sourceKey: newFee!.eventKey,
      sourceType: "fee_event",
      tutorSessionFeeId: newFee!.id,
      bookingId: newBooking.id,
      grossHonorariumIdr: newFee!.grossHonorariumIdr,
    });

    const allocationDetails = await adminClient.admin.getTutorPayoutAllocations(
      {
        payoutId: newBatch!.id,
      },
    );
    expect(allocationDetails.detailsAvailable).toBe(true);
    expect(allocationDetails.items).toHaveLength(1);
    expect(allocationDetails.items[0]).toMatchObject({
      sourceKey: newFee!.eventKey,
      bookingNumber: expect.any(Number),
      grossHonorariumIdr: newFee!.grossHonorariumIdr,
    });

    const historicalBatch = payouts.find(
      (payout) => payout.cutoffAt.getTime() === historicalCutoff.getTime(),
    );
    const historicalDetails = await adminClient.admin.getTutorPayoutAllocations(
      {
        payoutId: historicalBatch!.id,
      },
    );
    expect(historicalDetails).toEqual({ detailsAvailable: false, items: [] });

    const pendingAfterPay = await tutorClient.tutor.getMyPayouts({});
    expect(pendingAfterPay.completedSessions).toBe(0);
    expect(pendingAfterPay.tutorPayoutIdr).toBe(0);
  });
});
