import { expect, test } from "bun:test";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  academyClass,
  academyClassSession,
  auditLog,
  subjectCategory,
  tutorInvite,
  tutorPayout,
  tutorPayoutAllocation,
  tutorProfile,
  tutorSessionFee,
  user,
} from "@cogito-app/db/schema";
import { createBookingRepo } from "../../modules/booking/booking.repo";
import { createBookingService } from "../../modules/booking/booking.service";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (
  process.env.CLASS_PAYOUT_DEV_ACCEPTANCE !== "true" ||
  process.env.NODE_ENV !== "development" ||
  !["postgres:", "postgresql:"].includes(url.protocol) ||
  !["localhost", "127.0.0.1", "::1", "[::1]"].includes(
    url.hostname.toLowerCase(),
  ) ||
  url.port !== "6767" ||
  url.pathname !== "/cogito-app" ||
  url.search ||
  url.hash ||
  process.env.TEST_DATABASE_ALLOW_RESET !== undefined ||
  process.env.TEST_DATABASE_RESET_TARGET !== undefined
) {
  throw new Error(
    "Class payout acceptance requires explicit development loopback:6767/cogito-app; reset overrides and URL query/hash are forbidden; no data was changed.",
  );
}

test("class payout transfer, void, reconciliation and reprepare retain snapshots", async () => {
  const current = await db.execute<{ database_name: string }>(
    sql`SELECT current_database() AS database_name`,
  );
  expect(current[0]?.database_name).toBe("cogito-app");

  const tag = crypto.randomUUID();
  const tutorId = `class-payout-tutor-${tag}`;
  const adminId = `class-payout-admin-${tag}`;
  const classId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const feeId = crypto.randomUUID();
  const inviteId = crypto.randomUUID();
  const sourceKey = `class-payout-acceptance:${tag}`;
  const rollback = new Error("ROLLBACK_CLASS_PAYOUT_FIXTURES");
  let payoutIds: string[] = [];

  try {
    await db.transaction(async (tx) => {
      const ambientDb = new Proxy(tx, {
        get(target, property, receiver) {
          if (property === "transaction") {
            return async (callback: (conn: typeof tx) => Promise<unknown>) =>
              callback(tx);
          }
          return Reflect.get(target, property, receiver);
        },
      });
      const service = createBookingService({
        db: ambientDb as never,
        repo: createBookingRepo(ambientDb as never),
        wallet: {} as never,
        pricing: {} as never,
        audit: {
          record: async (input: {
            db: typeof tx;
            actorId: string;
            actorType: "admin";
            action: string;
            targetId: string;
            targetType: string;
            beforeState: Record<string, unknown>;
            afterState: Record<string, unknown>;
          }) => {
            await input.db.insert(auditLog).values({
              actorId: input.actorId,
              actorType: input.actorType,
              action: input.action,
              targetId: input.targetId,
              targetType: input.targetType,
              beforeState: input.beforeState,
              afterState: input.afterState,
            });
          },
        } as never,
        notification: { write: async () => undefined } as never,
        meeting: {} as never,
      });

      await tx.insert(user).values([
        {
          id: tutorId,
          email: `${tag}-tutor@example.test`,
          name: "Class payout test tutor",
          role: "tutor",
        },
        {
          id: adminId,
          email: `${tag}-admin@example.test`,
          name: "Class payout test admin",
          role: "admin",
        },
      ]);
      const [category] = await tx
        .select({ id: subjectCategory.id })
        .from(subjectCategory)
        .limit(1);
      expect(category).toBeDefined();

      const now = new Date();
      const scheduledStartAt = new Date(now.getTime() - 90 * 60_000);
      const scheduledEndAt = new Date(now.getTime() - 30 * 60_000);
      await tx.insert(academyClass).values({
        id: classId,
        kind: "masterclass",
        competitionId: category!.id,
        titleEn: `[TEST] Class payout lifecycle ${tag}`,
        descriptionEn: "Rollback-only payout acceptance fixture",
        masterclassRateMarks: 5,
        tutorFeeIdr: 400_000,
        state: "completed",
        publishedAt: scheduledStartAt,
        createdBy: adminId,
      });
      await tx.insert(academyClassSession).values({
        id: sessionId,
        classId,
        sequenceNumber: 1,
        capacity: 1,
        titleEn: "[TEST] Delivered session",
        startAt: scheduledStartAt,
        endAt: scheduledEndAt,
        mode: "online",
        tutorId,
        tutorFeeIdr: 400_000,
        state: "completed",
      });
      await tx.insert(tutorSessionFee).values({
        id: feeId,
        academyClassSessionId: sessionId,
        deliveryLabel: "[TEST] Masterclass · Session 1",
        collectedMarks: 5,
        tutorId,
        scheduledStartAt,
        earnedAt: scheduledEndAt,
        eventKey: sourceKey,
        grossHonorariumIdr: 400_000,
      });
      await tx.insert(tutorInvite).values({
        id: inviteId,
        email: `${tag}-tutor@example.test`,
        displayName: "Class payout test tutor",
        token: `${tag}-invite`,
        status: "accepted",
        invitedBy: adminId,
        acceptedBy: tutorId,
        expiresAt: new Date(now.getTime() + 86_400_000),
        acceptedAt: now,
      });
      await tx.insert(tutorProfile).values({
        userId: tutorId,
        inviteId,
        onboardingStatus: "published",
        publishedAt: now,
        bankName: "Mandiri",
        bankAccountNumber: "001234567890",
        bankAccountHolderName: "Class payout test tutor",
        bankAccountOpeningCity: "Jakarta",
        bankAccountOwnership: "self",
        bankTransferDisclaimerAccepted: true,
        taxLegalName: "Class payout test tutor",
        nik: "0012345678901234",
      });

      const sessionBefore = await tx.query.academyClassSession.findFirst({
        where: eq(academyClassSession.id, sessionId),
      });
      const feeBefore = await tx.query.tutorSessionFee.findFirst({
        where: eq(tutorSessionFee.id, feeId),
      });
      expect(sessionBefore).toMatchObject({
        tutorId,
        tutorFeeIdr: 400_000,
        state: "completed",
      });
      expect(feeBefore).toMatchObject({
        academyClassSessionId: sessionId,
        tutorId,
        grossHonorariumIdr: 400_000,
        collectedMarks: 5,
        eventKey: sourceKey,
      });

      const preview = await service.previewTutorPayout(tutorId, [sourceKey]);
      expect(preview).toMatchObject({
        grossHonorariumIdr: 400_000,
        taxRateBps: 300,
        taxHonorariumIdr: 12_000,
        transferFeeIdr: 2_500,
        netHonorariumIdr: 385_500,
      });
      expect(preview.items[0]).toMatchObject({
        sourceKey,
        classSessionId: sessionId,
        bookingType: "masterclass",
        collectedMarks: 5,
        deliveryLabel: "[TEST] Masterclass · Session 1",
        grossHonorariumIdr: 400_000,
      });

      const operationId = `class-payout-prepare:${tag}`;
      const prepared = await service.prepareTutorPayout(adminId, {
        tutorId,
        sourceKeys: preview.sourceKeys,
        previewVersion: preview.previewVersion,
        operationId,
      });
      expect(prepared).toMatchObject({
        status: "prepared",
        sourceKeys: [sourceKey],
        grossHonorariumIdr: 400_000,
        taxRateBps: 300,
        taxHonorariumIdr: 12_000,
        transferFeeIdr: 2_500,
        netHonorariumIdr: 385_500,
      });
      const prepareReplay = await service.prepareTutorPayout(adminId, {
        tutorId,
        sourceKeys: preview.sourceKeys,
        previewVersion: preview.previewVersion,
        operationId,
      });
      expect(prepareReplay.id).toBe(prepared.id);

      const paidAt = new Date();
      const testReference = `TEST-SIMULATED-NO-BANK-TRANSFER-${tag}`;
      const transferInput = {
        payoutId: prepared.id,
        previewVersion: preview.previewVersion,
        actualAmountIdr: 385_500,
        paidAt,
        reference: testReference,
      };
      const paid = await service.recordTutorPayoutTransfer(
        adminId,
        transferInput,
      );
      expect(paid).toMatchObject({
        id: prepared.id,
        status: "paid",
        actualAmountIdr: 385_500,
        actualReference: testReference,
      });
      const transferReplay = await service.recordTutorPayoutTransfer(
        adminId,
        transferInput,
      );
      expect(transferReplay).toMatchObject({
        id: prepared.id,
        status: "paid",
        actualReference: testReference,
      });

      const paidCoverage = await service.getTutorPayoutAllocations(prepared.id);
      expect(paidCoverage).toMatchObject({
        detailsAvailable: true,
        items: [
          {
            sourceKey,
            sourceType: "fee_event",
            tutorSessionFeeId: feeId,
            classSessionId: sessionId,
            deliveryLabel: "[TEST] Masterclass · Session 1",
            grossHonorariumIdr: 400_000,
            collectedMarks: 5,
            active: true,
          },
        ],
      });

      await expect(
        service.voidTutorPayout(adminId, {
          payoutId: prepared.id,
          reason: "   ",
        }),
      ).rejects.toThrow("Void reason is required");
      const voided = await service.voidTutorPayout(adminId, {
        payoutId: prepared.id,
        reason: "[TEST] simulated transfer requires reconciliation",
      });
      expect(voided).toMatchObject({
        id: prepared.id,
        status: "void",
        actualAmountIdr: 385_500,
        actualReference: testReference,
        reconciliationStatus: "required",
        voidReason: "[TEST] simulated transfer requires reconciliation",
      });
      const voidCoverage = await service.getTutorPayoutAllocations(prepared.id);
      expect(voidCoverage.items[0]).toMatchObject({
        sourceKey,
        active: false,
        releaseReason: "[TEST] simulated transfer requires reconciliation",
      });
      await expect(
        service.previewTutorPayout(tutorId, [sourceKey]),
      ).rejects.toThrow("Reconcile the recorded external transfer");

      const reconciled = await service.resolveTutorPayoutReconciliation(
        adminId,
        {
          payoutId: prepared.id,
          reason: "[TEST] reconciliation reviewed before re-payment",
        },
      );
      expect(reconciled).toMatchObject({
        id: prepared.id,
        status: "void",
        reconciliationStatus: "resolved",
        actualAmountIdr: 385_500,
        actualReference: testReference,
      });

      const repreparePreview = await service.previewTutorPayout(tutorId, [
        sourceKey,
      ]);
      expect(repreparePreview).toMatchObject({
        grossHonorariumIdr: 400_000,
        taxRateBps: 300,
        taxHonorariumIdr: 12_000,
        transferFeeIdr: 2_500,
        netHonorariumIdr: 385_500,
      });
      const reprepared = await service.prepareTutorPayout(adminId, {
        tutorId,
        sourceKeys: repreparePreview.sourceKeys,
        previewVersion: repreparePreview.previewVersion,
        operationId: `class-payout-reprepare:${tag}`,
      });
      payoutIds = [prepared.id, reprepared.id];
      expect(reprepared).toMatchObject({
        status: "prepared",
        sourceKeys: [sourceKey],
        grossHonorariumIdr: 400_000,
        taxRateBps: 300,
        taxHonorariumIdr: 12_000,
        transferFeeIdr: 2_500,
        netHonorariumIdr: 385_500,
      });
      const repreparedCoverage = await service.getTutorPayoutAllocations(
        reprepared.id,
      );
      expect(repreparedCoverage.items[0]).toMatchObject({
        sourceKey,
        sourceType: "fee_event",
        tutorSessionFeeId: feeId,
        classSessionId: sessionId,
        active: true,
      });

      const payoutRows = await tx
        .select()
        .from(tutorPayout)
        .where(inArray(tutorPayout.id, [prepared.id, reprepared.id]));
      expect(payoutRows).toHaveLength(2);
      expect(payoutRows.find((row) => row.id === prepared.id)).toMatchObject({
        status: "void",
        actualAmountIdr: 385_500,
        actualReference: testReference,
        grossHonorariumIdr: 400_000,
        taxRateBps: 300,
        taxHonorariumIdr: 12_000,
        transferFeeIdr: 2_500,
        netHonorariumIdr: 385_500,
      });
      const allocations = await tx
        .select()
        .from(tutorPayoutAllocation)
        .where(
          inArray(tutorPayoutAllocation.payoutId, [prepared.id, reprepared.id]),
        );
      expect(allocations).toHaveLength(2);
      expect(
        allocations.filter((row) => row.active).map((row) => row.payoutId),
      ).toEqual([reprepared.id]);
      expect(
        await tx
          .select({ action: auditLog.action, targetId: auditLog.targetId })
          .from(auditLog)
          .where(
            and(
              eq(auditLog.targetType, "tutor_payout"),
              inArray(auditLog.targetId, [prepared.id, reprepared.id]),
            ),
          ),
      ).toEqual(
        expect.arrayContaining([
          { action: "tutor_payout_prepared", targetId: prepared.id },
          { action: "tutor_payout_transfer_recorded", targetId: prepared.id },
          { action: "tutor_payout_voided", targetId: prepared.id },
          {
            action: "tutor_payout_reconciliation_resolved",
            targetId: prepared.id,
          },
          { action: "tutor_payout_prepared", targetId: reprepared.id },
        ]),
      );
      expect(
        await tx.query.academyClassSession.findFirst({
          where: eq(academyClassSession.id, sessionId),
        }),
      ).toMatchObject({
        tutorId,
        tutorFeeIdr: 400_000,
        state: "completed",
      });
      expect(
        await tx.query.tutorSessionFee.findFirst({
          where: eq(tutorSessionFee.id, feeId),
        }),
      ).toMatchObject({
        academyClassSessionId: sessionId,
        tutorId,
        grossHonorariumIdr: 400_000,
        collectedMarks: 5,
        eventKey: sourceKey,
      });
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }

  expect(
    await db.select().from(academyClass).where(eq(academyClass.id, classId)),
  ).toHaveLength(0);
  expect(
    await db
      .select()
      .from(academyClassSession)
      .where(eq(academyClassSession.id, sessionId)),
  ).toHaveLength(0);
  expect(
    await db
      .select()
      .from(tutorSessionFee)
      .where(eq(tutorSessionFee.id, feeId)),
  ).toHaveLength(0);
  expect(await db.select().from(user).where(eq(user.id, tutorId))).toHaveLength(
    0,
  );
  expect(
    await db
      .select()
      .from(tutorPayout)
      .where(inArray(tutorPayout.id, payoutIds)),
  ).toHaveLength(0);
  expect(
    await db
      .select()
      .from(tutorPayoutAllocation)
      .where(inArray(tutorPayoutAllocation.payoutId, payoutIds)),
  ).toHaveLength(0);
  expect(
    await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.targetType, "tutor_payout"),
          inArray(auditLog.targetId, payoutIds),
        ),
      ),
  ).toHaveLength(0);
});
