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
  notification,
  notificationDispatch,
  auditLog,
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
import { calculateTutorTaxIdr } from "../../modules/booking/tutor-payout-calculation";

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

function assertPayoutIntegrationDatabase() {
  let databaseUrl: URL | undefined;
  try {
    if (process.env.DATABASE_URL) {
      databaseUrl = new URL(process.env.DATABASE_URL);
    }
  } catch {
    databaseUrl = undefined;
  }

  if (
    process.env.NODE_ENV !== "test" ||
    (databaseUrl?.protocol !== "postgres:" &&
      databaseUrl?.protocol !== "postgresql:") ||
    !["localhost", "127.0.0.1", "::1"].includes(
      databaseUrl?.hostname.toLowerCase().replace(/^\[|\]$/g, "") ?? "",
    ) ||
    databaseUrl?.port !== "6770" ||
    databaseUrl?.pathname !== "/cogito-test-payout"
  ) {
    throw new Error(
      "Tutor payout integration tests require NODE_ENV=test and loopback cogito-test-payout on port 6770.",
    );
  }
}

describe("Tutor payouts (G16)", () => {
  beforeAll(async () => {
    assertPayoutIntegrationDatabase();
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
    const otherFinance = await other.tutorClient.tutor.getMyPayoutFinance({});
    expect(otherFinance.pending.grossHonorariumIdr).toBe(0);
    expect(otherFinance.history).toHaveLength(0);
  });

  test("prepares and records exact tax snapshots, serializes admins, and blocks repayment until reconciliation", async () => {
    const isolatedTutor = await createPublishedTutor(
      `tutor.pay.cutoff.${ts}@cogito.test`,
      ts + 2,
    );
    const payoutTutorId = isolatedTutor.tutorId;
    await db
      .update(tutorProfile)
      .set({
        bankName: "BCA",
        bankAccountNumber: "001234567890",
        bankAccountHolderName: "Prof Payout",
        bankAccountOpeningCity: "Jakarta",
        bankAccountOwnership: "self",
        bankTransferDisclaimerAccepted: true,
        taxLegalName: "Payout Snapshot Tutor",
        nik: "0012345678901234",
        npwp: "000123456789000",
      })
      .where(eq(tutorProfile.userId, payoutTutorId));

    const historicalCutoff = new Date(Date.now() - 60_000);
    await db.insert(tutorPayout).values({
      tutorId: payoutTutorId,
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

    const beforeNewCompletion =
      await isolatedTutor.tutorClient.tutor.getMyPayouts({});
    expect(beforeNewCompletion.completedSessions).toBe(0);
    expect(beforeNewCompletion.tutorPayoutIdr).toBe(0);

    const start = new Date(Date.now() + 48 * 3600_000);
    const newBooking = await studentClient.booking.createSolo({
      tutorId: payoutTutorId,
      availabilitySlotId: isolatedTutor.slotId,
      modality: "online",
      scheduledStartAt: start.toISOString(),
      scheduledEndAt: new Date(start.getTime() + 3600_000).toISOString(),
      timezone: "Asia/Jakarta",
    });
    await isolatedTutor.tutorClient.tutorActions.acceptBooking({
      bookingId: newBooking.id,
    });
    await db
      .update(bookingTable)
      .set({ scheduledStartAt: new Date(Date.now() - 30 * 60_000) })
      .where(eq(bookingTable.id, newBooking.id));
    await isolatedTutor.tutorClient.tutorActions.completeSession({
      feedback: TEST_COMPLETION_FEEDBACK,
      bookingId: newBooking.id,
    });
    const [newFee] = await db
      .select()
      .from(tutorSessionFee)
      .where(eq(tutorSessionFee.bookingId, newBooking.id));
    expect(newFee).toBeDefined();

    const pendingBeforePay = await isolatedTutor.tutorClient.tutor.getMyPayouts(
      {},
    );
    expect(pendingBeforePay.completedSessions).toBe(1);
    expect(pendingBeforePay.tutorPayoutIdr).toBe(newFee!.grossHonorariumIdr);

    const originalPreview = await adminClient.admin.previewTutorPayout({
      tutorId: payoutTutorId,
      sourceKeys: [newFee!.eventKey],
    });
    expect(originalPreview.taxRateBps).toBe(250);
    await adminClient.admin.updateTutorTaxConfig({
      expectedVersion: 0,
      nikNpwpRateBps: 300,
      nikOnlyRateBps: 325,
      missingRateBps: 350,
      reason: "Exercise stale preview revalidation in payout acceptance test",
    });
    const configChangedPrepare = adminClient.admin.prepareTutorPayout({
      tutorId: payoutTutorId,
      sourceKeys: originalPreview.sourceKeys,
      previewVersion: originalPreview.previewVersion,
      operationId: crypto.randomUUID(),
    });
    await expect(configChangedPrepare).rejects.toThrow();

    const beforeProfileChange =
      await isolatedTutor.tutorClient.tutor.getMyProfile({});
    await isolatedTutor.tutorClient.tutor.updateMyProfile({
      version: beforeProfileChange.version,
      bankAccountNumber: "009876543210",
    });
    const profileChangedPrepare = adminClient.admin.prepareTutorPayout({
      tutorId: payoutTutorId,
      sourceKeys: originalPreview.sourceKeys,
      previewVersion: originalPreview.previewVersion,
      operationId: crypto.randomUUID(),
    });
    await expect(profileChangedPrepare).rejects.toThrow();

    const currentPreview = await adminClient.admin.previewTutorPayout({
      tutorId: payoutTutorId,
      sourceKeys: [newFee!.eventKey],
    });
    expect(currentPreview.taxRateBps).toBe(300);
    expect(currentPreview.taxHonorariumIdr).toBe(
      calculateTutorTaxIdr(newFee!.grossHonorariumIdr, 300),
    );
    const operationIds = [crypto.randomUUID(), crypto.randomUUID()];
    const results = await Promise.allSettled([
      adminClient.admin.prepareTutorPayout({
        tutorId: payoutTutorId,
        sourceKeys: currentPreview.sourceKeys,
        previewVersion: currentPreview.previewVersion,
        operationId: operationIds[0]!,
      }),
      secondAdminClient.admin.prepareTutorPayout({
        tutorId: payoutTutorId,
        sourceKeys: currentPreview.sourceKeys,
        previewVersion: currentPreview.previewVersion,
        operationId: operationIds[1]!,
      }),
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
      .where(eq(tutorPayout.tutorId, payoutTutorId));
    expect(payouts).toHaveLength(2);
    const newBatch = payouts.find(
      (payout) => payout.cutoffAt.getTime() > historicalCutoff.getTime(),
    );
    expect(newBatch).toMatchObject({
      status: "prepared",
      grossHonorariumIdr: newFee!.grossHonorariumIdr,
      taxRateBps: 300,
      taxHonorariumIdr: calculateTutorTaxIdr(newFee!.grossHonorariumIdr, 300),
      transferFeeIdr: 0,
      netHonorariumIdr:
        newFee!.grossHonorariumIdr -
        calculateTutorTaxIdr(newFee!.grossHonorariumIdr, 300),
      bankAccountNumber: "009876543210",
      taxLegalName: "Payout Snapshot Tutor",
      taxNik: "0012345678901234",
      taxNpwp: "000123456789000",
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

    await expect(
      adminClient.admin.recordTutorPayoutTransfer({
        payoutId: newBatch!.id,
        previewVersion: currentPreview.previewVersion,
        actualAmountIdr: newBatch!.netHonorariumIdr + 1,
        paidAt: new Date().toISOString(),
      }),
    ).rejects.toThrow();
    const actualPaidAt = new Date(Date.now() - 10_000);
    const paidResult = await adminClient.admin.recordTutorPayoutTransfer({
      payoutId: newBatch!.id,
      previewVersion: currentPreview.previewVersion,
      actualAmountIdr: newBatch!.netHonorariumIdr,
      paidAt: actualPaidAt.toISOString(),
      reference: "BANK-REF-001",
      proofUrl: "https://example.com/proof/001",
    });
    expect(paidResult).toMatchObject({
      status: "paid",
      actualAmountIdr: newBatch!.netHonorariumIdr,
      actualReference: "BANK-REF-001",
      actualProofUrl: "https://example.com/proof/001",
      transferRecordedBy: adminId,
    });
    expect(paidResult.transferRecordedAt).toBeInstanceOf(Date);
    const replayInput = {
      payoutId: newBatch!.id,
      previewVersion: currentPreview.previewVersion,
      actualAmountIdr: newBatch!.netHonorariumIdr,
      paidAt: actualPaidAt.toISOString(),
      reference: " BANK-REF-001 ",
      proofUrl: "https://example.com/proof/001",
    };
    const identicalRetries = await Promise.all([
      adminClient.admin.recordTutorPayoutTransfer(replayInput),
      secondAdminClient.admin.recordTutorPayoutTransfer(replayInput),
    ]);
    expect(identicalRetries).toHaveLength(2);
    expect(identicalRetries.every((result) => result.status === "paid")).toBe(
      true,
    );
    const conflictingReplays = [
      { ...replayInput, actualAmountIdr: replayInput.actualAmountIdr + 1 },
      {
        ...replayInput,
        paidAt: new Date(actualPaidAt.getTime() + 1_000).toISOString(),
      },
      { ...replayInput, reference: "BANK-REF-DIFFERENT" },
    ];
    const conflictingResults = await Promise.allSettled(
      conflictingReplays.map((conflictingReplay) =>
        adminClient.admin.recordTutorPayoutTransfer(conflictingReplay),
      ),
    );
    expect(
      conflictingResults.every((result) => result.status === "rejected"),
    ).toBe(true);
    const payoutAudits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.targetId, newBatch!.id));
    expect(
      payoutAudits.filter(
        (row) => row.action === "tutor_payout_transfer_recorded",
      ),
    ).toHaveLength(1);
    const [payoutNotification] = await db
      .select()
      .from(notification)
      .where(eq(notification.eventKey, `tutor-payout.${newBatch!.id}.paid`))
      .limit(1);
    expect(payoutNotification?.body).toContain(
      `Gross Rp${newFee!.grossHonorariumIdr.toLocaleString("id-ID")}`,
    );
    expect(payoutNotification?.body).toContain("Tax Rp");
    expect(payoutNotification?.body).toContain("Transfer fee Rp");
    expect(payoutNotification?.body).toContain("Net Rp");
    expect(payoutNotification?.body).toContain(
      `Booking #${newBooking.bookingNumber} · solo ·`,
    );
    expect(payoutNotification?.body).toContain(
      newFee!.scheduledStartAt.toLocaleDateString("id-ID", {
        dateStyle: "medium",
        timeZone: "Asia/Jakarta",
      }),
    );
    const [emailDispatch] = await db
      .select()
      .from(notificationDispatch)
      .where(eq(notificationDispatch.notificationId, payoutNotification!.id))
      .limit(1);
    expect(emailDispatch?.status).toBe("queued");
    const emailDispatches = await db
      .select()
      .from(notificationDispatch)
      .where(eq(notificationDispatch.notificationId, payoutNotification!.id));
    expect(emailDispatches).toHaveLength(1);

    const snapshotProfile = await isolatedTutor.tutorClient.tutor.getMyProfile(
      {},
    );
    await isolatedTutor.tutorClient.tutor.updateMyProfile({
      version: snapshotProfile.version,
      bankName: "Mandiri",
      bankAccountNumber: "006655443322",
      taxLegalName: "Changed Legal Name",
      nik: "1234567890123456",
      npwp: null,
    });
    const historicalReport = await adminClient.admin.getTutorPayoutReport({
      dateFrom: new Date(actualPaidAt.getTime() - 60_000).toISOString(),
      dateTo: new Date(actualPaidAt.getTime() + 60_000).toISOString(),
    });
    const savedRow = historicalReport.find((row) => row.id === newBatch!.id);
    expect(savedRow).toMatchObject({
      bankAccountNumber: "009876543210",
      taxLegalName: "Payout Snapshot Tutor",
      taxNik: "0012345678901234",
      taxNpwp: "000123456789000",
      taxRateBps: 300,
      taxHonorariumIdr: calculateTutorTaxIdr(newFee!.grossHonorariumIdr, 300),
      actualProofUrl: "https://example.com/proof/001",
      transferRecordedBy: adminId,
    });

    const tutorFinance =
      await isolatedTutor.tutorClient.tutor.getMyPayoutFinance({});
    expect(tutorFinance.pending).toMatchObject({
      grossHonorariumIdr: 0,
      completedSessions: 0,
    });
    expect(tutorFinance.history[0]).toMatchObject({
      id: newBatch!.id,
      grossHonorariumIdr: newFee!.grossHonorariumIdr,
      taxRateBps: 300,
      taxHonorariumIdr: calculateTutorTaxIdr(newFee!.grossHonorariumIdr, 300),
      actualAmountIdr: newBatch!.netHonorariumIdr,
      actualReference: "BANK-REF-001",
      items: [
        expect.objectContaining({
          sourceKey: newFee!.eventKey,
          bookingNumber: newBooking.bookingNumber,
          bookingType: "solo",
        }),
      ],
    });
    expect(tutorFinance.history[0]).not.toHaveProperty("nik");
    expect(tutorFinance.history[0]).not.toHaveProperty("taxNik");
    expect(tutorFinance.history[0]).not.toHaveProperty("taxNpwp");
    await expect(studentClient.tutor.getMyPayoutFinance({})).rejects.toThrow();
    await expect(
      studentClient.admin.getTutorPayoutReport({}),
    ).rejects.toThrow();

    const voidResult = await adminClient.admin.voidTutorPayout({
      payoutId: newBatch!.id,
      reason: "Transfer needs external reconciliation before repayment",
    });
    expect(voidResult).toMatchObject({
      status: "void",
      actualAmountIdr: newBatch!.netHonorariumIdr,
      actualReference: "BANK-REF-001",
      actualProofUrl: "https://example.com/proof/001",
    });
    await expect(
      adminClient.admin.previewTutorPayout({
        tutorId: payoutTutorId,
        sourceKeys: [newFee!.eventKey],
      }),
    ).rejects.toThrow();

    await adminClient.admin.resolveTutorPayoutReconciliation({
      payoutId: newBatch!.id,
      reason:
        "External transfer reconciled by bank statement reference BANK-REF-001",
    });
    const reconciledPreview = await adminClient.admin.previewTutorPayout({
      tutorId: payoutTutorId,
      sourceKeys: [newFee!.eventKey],
    });
    const repaymentPreparation = await adminClient.admin.prepareTutorPayout({
      tutorId: payoutTutorId,
      sourceKeys: reconciledPreview.sourceKeys,
      previewVersion: reconciledPreview.previewVersion,
      operationId: crypto.randomUUID(),
    });
    expect(repaymentPreparation.status).toBe("prepared");

    const pendingAfterPay = await isolatedTutor.tutorClient.tutor.getMyPayouts(
      {},
    );
    expect(pendingAfterPay.completedSessions).toBe(0);
    expect(pendingAfterPay.tutorPayoutIdr).toBe(0);
  });

  test("a selected source payout leaves other legacy and later sources payable", async () => {
    const isolatedTutor = await createPublishedTutor(
      `tutor.pay.selected.${ts}@cogito.test`,
      ts + 3,
    );
    const payoutTutorId = isolatedTutor.tutorId;
    await db
      .update(tutorProfile)
      .set({
        bankName: "BCA",
        bankAccountNumber: "001122334455",
        bankAccountHolderName: "Selected Batch Tutor",
        bankAccountOpeningCity: "Jakarta",
        bankAccountOwnership: "self",
        bankTransferDisclaimerAccepted: true,
        taxLegalName: "Selected Batch Tutor",
        nik: "0000000000000042",
        npwp: null,
      })
      .where(eq(tutorProfile.userId, payoutTutorId));

    const firstLegacy = await insertBookingRow({
      tutorId: payoutTutorId,
      proposerId: studentId,
      completedAt: new Date(Date.now() - 6 * 60_000),
      priceSnapshot: {
        perStudent: 50,
        baseline: 50,
        tutorShare: 40,
        cogitoTake: 10,
      },
    });
    const secondLegacy = await insertBookingRow({
      tutorId: payoutTutorId,
      proposerId: studentId,
      completedAt: new Date(Date.now() - 5 * 60_000),
      priceSnapshot: {
        perStudent: 50,
        baseline: 50,
        tutorShare: 40,
        cogitoTake: 10,
      },
    });
    const before = await adminClient.admin.getPendingTutorPayouts({
      tutorId: payoutTutorId,
    });
    expect(before.items).toHaveLength(2);
    const firstSource = before.items.find(
      (item) => item.bookingId === firstLegacy.id,
    )!;
    const secondSource = before.items.find(
      (item) => item.bookingId === secondLegacy.id,
    )!;
    const firstPreview = await adminClient.admin.previewTutorPayout({
      tutorId: payoutTutorId,
      sourceKeys: [firstSource.sourceKey],
    });
    const firstBatch = await adminClient.admin.prepareTutorPayout({
      tutorId: payoutTutorId,
      sourceKeys: firstPreview.sourceKeys,
      previewVersion: firstPreview.previewVersion,
      operationId: crypto.randomUUID(),
    });
    await adminClient.admin.recordTutorPayoutTransfer({
      payoutId: firstBatch.id,
      previewVersion: firstPreview.previewVersion,
      actualAmountIdr: firstBatch.netHonorariumIdr,
      paidAt: new Date().toISOString(),
      reference: "BANK-SELECTED-001",
    });

    const feeStart = new Date(Date.now() + 48 * 3600_000);
    const feeBooking = await studentClient.booking.createSolo({
      tutorId: payoutTutorId,
      availabilitySlotId: isolatedTutor.slotId,
      modality: "online",
      scheduledStartAt: feeStart.toISOString(),
      scheduledEndAt: new Date(feeStart.getTime() + 3600_000).toISOString(),
      timezone: "Asia/Jakarta",
    });
    await isolatedTutor.tutorClient.tutorActions.acceptBooking({
      bookingId: feeBooking.id,
    });
    await db
      .update(bookingTable)
      .set({ scheduledStartAt: new Date(Date.now() - 30 * 60_000) })
      .where(eq(bookingTable.id, feeBooking.id));
    await isolatedTutor.tutorClient.tutorActions.completeSession({
      feedback: TEST_COMPLETION_FEEDBACK,
      bookingId: feeBooking.id,
    });
    const [fee] = await db
      .select()
      .from(tutorSessionFee)
      .where(eq(tutorSessionFee.bookingId, feeBooking.id));
    expect(fee).toBeDefined();

    const laterLegacy = await insertBookingRow({
      tutorId: payoutTutorId,
      proposerId: studentId,
      completedAt: new Date(),
      priceSnapshot: {
        perStudent: 50,
        baseline: 50,
        tutorShare: 40,
        cogitoTake: 10,
      },
    });
    const after = await adminClient.admin.getPendingTutorPayouts({
      tutorId: payoutTutorId,
    });
    expect(after.items.map((item) => item.sourceKey)).toEqual(
      expect.arrayContaining([
        secondSource.sourceKey,
        fee!.eventKey,
        after.items.find((item) => item.bookingId === laterLegacy.id)!
          .sourceKey,
      ]),
    );
    expect(after.items).toHaveLength(3);
    expect(after.items.some((item) => item.bookingId === firstLegacy.id)).toBe(
      false,
    );
    expect(after.items.some((item) => item.bookingId === secondLegacy.id)).toBe(
      true,
    );
    expect(after.items.some((item) => item.sourceKey === fee!.eventKey)).toBe(
      true,
    );
    expect(after.items.some((item) => item.bookingId === laterLegacy.id)).toBe(
      true,
    );

    const nextPreview = await adminClient.admin.previewTutorPayout({
      tutorId: payoutTutorId,
      sourceKeys: after.items.map((item) => item.sourceKey),
    });
    const nextBatch = await adminClient.admin.prepareTutorPayout({
      tutorId: payoutTutorId,
      sourceKeys: nextPreview.sourceKeys,
      previewVersion: nextPreview.previewVersion,
      operationId: crypto.randomUUID(),
    });
    expect(nextBatch.status).toBe("prepared");
    expect(nextBatch.sourceKeys).toHaveLength(3);
  });

  test("unresolved allocationless legacy payout retains its cutoff until audited reconciliation", async () => {
    const isolatedTutor = await createPublishedTutor(
      `tutor.pay.legacy-reconcile.${ts}@cogito.test`,
      ts + 4,
    );
    const payoutTutorId = isolatedTutor.tutorId;
    await db
      .update(tutorProfile)
      .set({
        bankName: "BCA",
        bankAccountNumber: "009988776655",
        bankAccountHolderName: "Legacy Reconciliation Tutor",
        bankAccountOpeningCity: "Jakarta",
        bankAccountOwnership: "self",
        bankTransferDisclaimerAccepted: true,
        taxLegalName: "Legacy Reconciliation Tutor",
        nik: "0000000000000059",
        npwp: null,
      })
      .where(eq(tutorProfile.userId, payoutTutorId));

    const oldCutoffAt = new Date(Date.now() - 5 * 60_000);
    const previouslyCovered = await insertBookingRow({
      tutorId: payoutTutorId,
      proposerId: studentId,
      completedAt: new Date(oldCutoffAt.getTime() - 60_000),
    });
    await db.insert(tutorPayout).values({
      tutorId: payoutTutorId,
      cutoffAt: oldCutoffAt,
      grossHonorariumIdr: 40_000,
      transferFeeIdr: 0,
      netHonorariumIdr: 40_000,
      bankName: "BCA",
      status: "paid",
      paidAt: oldCutoffAt,
      paidBy: adminId,
    });
    const potentiallyRepayable = await insertBookingRow({
      tutorId: payoutTutorId,
      proposerId: studentId,
      completedAt: new Date(oldCutoffAt.getTime() + 60_000),
    });
    const initiallyPending = await adminClient.admin.getPendingTutorPayouts({
      tutorId: payoutTutorId,
    });
    expect(initiallyPending.items.map((item) => item.bookingId)).toEqual([
      potentiallyRepayable.id,
    ]);
    const stalePreview = await adminClient.admin.previewTutorPayout({
      tutorId: payoutTutorId,
      sourceKeys: [initiallyPending.items[0]!.sourceKey],
    });

    const unresolvedCutoffAt = new Date();
    const legacyPayoutRows = await db
      .insert(tutorPayout)
      .values({
        tutorId: payoutTutorId,
        cutoffAt: unresolvedCutoffAt,
        grossHonorariumIdr: 40_000,
        transferFeeIdr: 0,
        netHonorariumIdr: 40_000,
        bankName: "BCA",
        actualAmountIdr: 40_000,
        actualReference: "LEGACY-BANK-REF",
        status: "paid",
        paidAt: unresolvedCutoffAt,
        paidBy: adminId,
      })
      .returning();
    const legacyPayout = legacyPayoutRows[0]!;
    expect(legacyPayout.previewVersion).toBeNull();
    expect(legacyPayout.sourceKeys).toBeNull();
    const voidResult = await adminClient.admin.voidTutorPayout({
      payoutId: legacyPayout.id,
      reason: "Reconcile historical transfer before any source is repaid",
    });
    expect(voidResult.reconciliationStatus).toBe("required");
    expect(
      await db
        .select()
        .from(tutorPayoutAllocation)
        .where(eq(tutorPayoutAllocation.payoutId, legacyPayout.id)),
    ).toHaveLength(0);

    const blocked = await adminClient.admin.getPendingTutorPayouts({
      tutorId: payoutTutorId,
    });
    expect(blocked.items).toHaveLength(0);
    await expect(
      adminClient.admin.previewTutorPayout({
        tutorId: payoutTutorId,
        sourceKeys: stalePreview.sourceKeys,
      }),
    ).rejects.toThrow();
    await expect(
      adminClient.admin.prepareTutorPayout({
        tutorId: payoutTutorId,
        sourceKeys: stalePreview.sourceKeys,
        previewVersion: stalePreview.previewVersion,
        operationId: crypto.randomUUID(),
      }),
    ).rejects.toThrow();

    await adminClient.admin.resolveTutorPayoutReconciliation({
      payoutId: legacyPayout.id,
      reason:
        "Bank statement confirms the prior aggregate transfer is resolved",
    });
    const resolved = await db
      .select()
      .from(tutorPayout)
      .where(eq(tutorPayout.id, legacyPayout.id));
    expect(resolved[0]).toMatchObject({
      status: "void",
      actualReference: "LEGACY-BANK-REF",
      reconciliationStatus: "resolved",
    });
    const eligibleAfterResolution =
      await adminClient.admin.getPendingTutorPayouts({
        tutorId: payoutTutorId,
      });
    expect(eligibleAfterResolution.items.map((item) => item.bookingId)).toEqual(
      [potentiallyRepayable.id],
    );
    expect(
      eligibleAfterResolution.items.some(
        (item) => item.bookingId === previouslyCovered.id,
      ),
    ).toBe(false);
    const resolvedPreview = await adminClient.admin.previewTutorPayout({
      tutorId: payoutTutorId,
      sourceKeys: eligibleAfterResolution.items.map((item) => item.sourceKey),
    });
    const repayment = await adminClient.admin.prepareTutorPayout({
      tutorId: payoutTutorId,
      sourceKeys: resolvedPreview.sourceKeys,
      previewVersion: resolvedPreview.previewVersion,
      operationId: crypto.randomUUID(),
    });
    expect(repayment.status).toBe("prepared");
  });
});
