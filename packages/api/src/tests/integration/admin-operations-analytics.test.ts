import { expect, test } from "bun:test";
import { db } from "@cogito-app/db";
import { eq } from "drizzle-orm";
import * as s from "@cogito-app/db/schema";
import { getDashboardAnalytics } from "../../modules/admin/admin.repo";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
const dev = process.env.ADMIN_ANALYTICS_DEV_ACCEPTANCE === "true";
if (
  !["postgres:", "postgresql:"].includes(url.protocol) ||
  process.env.NODE_ENV !== (dev ? "development" : "test") ||
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  url.port !== (dev ? "6767" : "6769") ||
  url.pathname !== (dev ? "/cogito-app" : "/cogito-test") ||
  url.search ||
  url.hash ||
  process.env.TEST_DATABASE_ALLOW_RESET !== undefined ||
  process.env.TEST_DATABASE_RESET_TARGET !== undefined
)
  throw new Error(
    "Analytics acceptance requires explicit dev opt-in or dedicated6769; no resets",
  );

// All fixture writes are rolled back even after successful assertions; no providers are called.
test("Q15 analytics separates receipts, delivered service, commitments and fee obligations", async () => {
  const query = {
    periodStart: new Date("2044-01-01T00:00:00Z"),
    periodEnd: new Date("2044-01-31T23:59:59Z"),
    activeSince: new Date("2044-01-01"),
    previousActiveSince: new Date("2043-12-01"),
    now: new Date("2044-01-20T00:00:00Z"),
  };
  const tag = crypto.randomUUID();
  const done = new Error("ROLLBACK_ANALYTICS_FIXTURES");
  let checked = false;
  try {
    await db.transaction(async (tx) => {
      const before = await getDashboardAnalytics(tx, query);
      const ids = Array.from({ length: 4 }, () => crypto.randomUUID());
      await tx.insert(s.user).values(
        ids.map((id, index) => ({
          id,
          email: `${tag}-${index}@example.test`,
          name: "Analytics fixture",
          role: index === 0 ? "tutor" : "student",
        })),
      );
      const wallets = await tx
        .insert(s.wallet)
        .values(
          ids.slice(1).map((id) => ({
            userId: id,
            totalBalance: 1000,
            heldBalance: 1000,
            availableBalance: 0,
          })),
        )
        .returning();
      const snapshot = (marks: number) => ({
        engine: "v3" as const,
        v3Revision: 1,
        competition: "competition-debate",
        modality: "online" as const,
        headcount: 1,
        perStudentMarks: marks,
        collectedMarks: marks,
        tutorHonorariumIdr: 100000,
      });
      const makeBooking = async (
        type: string,
        currentState: string,
        date: string,
        marks = 44,
        price = true,
      ) => {
        const [row] = await tx
          .insert(s.booking)
          .values({
            type,
            modality: "online",
            tutorId: ids[0]!,
            proposerId: ids[1]!,
            targetGroupSize: type === "group" ? 3 : 1,
            confirmedHeadcount: 1,
            currentState,
            scheduledStartAt: new Date(date),
            scheduledEndAt: new Date(new Date(date).getTime() + 3600000),
            originalMarks: 9999,
            holdAmount: 9999,
            priceSnapshot: price ? snapshot(marks) : null,
          })
          .returning();
        return row!;
      };
      const ledger = async (
        bookingId: string | null,
        eventKey: string,
        amount: number,
        walletIndex = 0,
      ) => {
        await tx.insert(s.ledgerEntry).values({
          walletId: wallets[walletIndex]!.id,
          bookingId,
          eventKey,
          entryType: "deduct",
          actorType: "system",
          amount,
          beforeBalance: 1000,
          afterBalance: 1000 - amount,
          sourceReference: tag,
        });
      };
      const solo = await makeBooking(
        "solo",
        "completed",
        "2044-01-10T10:00:00Z",
      );
      await ledger(solo.id, `booking.${solo.id}.deduct`, 44);
      await ledger(solo.id, `booking.${solo.id}.no_show.student`, 100);
      const group = await makeBooking(
        "group",
        "completed",
        "2044-01-11T10:00:00Z",
        30,
      );
      await ledger(group.id, `booking.${group.id}.complete.${ids[1]}`, 30);
      await ledger(group.id, `booking.${group.id}.complete.${ids[2]}`, 30, 1);
      await ledger(group.id, `booking.${group.id}.cancel.penalty`, 20);
      const series = await makeBooking(
        "series",
        "scheduled",
        "2044-02-02T10:00:00Z",
        50,
      );
      const sessions = await tx
        .insert(s.bookingSession)
        .values([
          {
            seriesBookingId: series.id,
            scheduledStartAt: new Date("2044-01-12T10:00:00Z"),
            scheduledEndAt: new Date("2044-01-12T11:00:00Z"),
            currentState: "completed",
            holdAmount: 50,
            priceSnapshot: snapshot(50),
          },
          {
            seriesBookingId: series.id,
            scheduledStartAt: new Date("2044-02-02T10:00:00Z"),
            scheduledEndAt: new Date("2044-02-02T11:00:00Z"),
            currentState: "scheduled",
            holdAmount: 50,
            priceSnapshot: snapshot(50),
          },
        ])
        .returning();
      await ledger(
        series.id,
        `booking.${series.id}.session.${sessions[0]!.id}.deduct`,
        50,
      );
      await tx.insert(s.bookingParticipant).values({
        bookingId: series.id,
        userId: ids[1]!,
        role: "proposer",
        confirmationState: "confirmed",
        heldAmount: 35,
      });
      const future = await makeBooking(
        "group",
        "scheduled",
        "2044-02-03T10:00:00Z",
        40,
      );
      await tx.insert(s.bookingParticipant).values([
        {
          bookingId: future.id,
          userId: ids[1]!,
          role: "proposer",
          confirmationState: "confirmed",
          heldAmount: 40,
        },
        {
          bookingId: future.id,
          userId: ids[2]!,
          role: "invitee",
          confirmationState: "reconfirmed",
          heldAmount: 0,
        },
        {
          bookingId: future.id,
          userId: ids[3]!,
          role: "invitee",
          confirmationState: "withdrawn_pre_h2",
          heldAmount: 60,
        },
      ]);
      const unpriced = await makeBooking(
        "solo",
        "confirmed",
        "2044-02-04T10:00:00Z",
        44,
        false,
      );
      await tx.insert(s.bookingParticipant).values({
        bookingId: unpriced.id,
        userId: ids[1]!,
        role: "proposer",
        confirmationState: "confirmed",
        heldAmount: 44,
      });
      const [competition] = await tx.select().from(s.subjectCategory).limit(1);
      expect(competition).toBeDefined();
      const [klass] = await tx
        .insert(s.academyClass)
        .values({
          kind: "cohort",
          competitionId: competition!.id,
          titleEn: tag,
          descriptionEn: tag,
          minimumEnrollment: 1,
          minimumCheckAt: new Date("2043-12-01"),
          cohortFullRateMarks: 20,
          cohortHalfRateMarks: 22,
          cohortSingleRateMarks: 25,
          tutorFeeIdr: 400000,
          state: "published",
        })
        .returning();
      const classSessions = await tx
        .insert(s.academyClassSession)
        .values([
          {
            classId: klass!.id,
            sequenceNumber: 1,
            capacity: 4,
            titleEn: tag,
            startAt: new Date("2044-01-13T10:00:00Z"),
            endAt: new Date("2044-01-13T11:00:00Z"),
            mode: "online",
            tutorId: ids[0]!,
            tutorFeeIdr: 400000,
            state: "completed",
          },
          {
            classId: klass!.id,
            sequenceNumber: 2,
            capacity: 4,
            titleEn: tag,
            startAt: new Date("2044-02-05T10:00:00Z"),
            endAt: new Date("2044-02-05T11:00:00Z"),
            mode: "online",
            tutorId: ids[0]!,
            tutorFeeIdr: 400000,
            state: "scheduled",
          },
        ])
        .returning();
      const [enrollment] = await tx
        .insert(s.academyClassEnrollment)
        .values({
          classId: klass!.id,
          studentId: ids[1]!,
          requestKey: tag,
          plan: "half",
          state: "active",
          sessionCount: 2,
          firstRateMarks: 20,
          secondRateMarks: 22,
          firstInstallmentMarks: 20,
          secondInstallmentMarks: 22,
          totalMarks: 42,
        })
        .returning();
      const installments = await tx
        .insert(s.academyClassEnrollmentInstallment)
        .values([
          {
            enrollmentId: enrollment!.id,
            ordinal: 1,
            rateMarks: 20,
            sessionCount: 1,
            amountMarks: 20,
            state: "funded",
          },
          {
            enrollmentId: enrollment!.id,
            ordinal: 2,
            rateMarks: 22,
            sessionCount: 1,
            amountMarks: 22,
            state: "pending",
            dueAt: new Date("2044-02-04"),
          },
        ])
        .returning();
      const allocations = await tx
        .insert(s.academyClassEnrollmentAllocation)
        .values(
          classSessions.map((session, index) => ({
            enrollmentId: enrollment!.id,
            installmentId: installments[index]!.id,
            classId: klass!.id,
            sessionId: session.id,
            studentId: ids[1]!,
            ordinal: index + 1,
            sequenceNumber: index + 1,
            rateMarks: index === 0 ? 20 : 22,
            state:
              index === 0
                ? ("funded" as const)
                : ("unfunded_reserved" as const),
            fundingEventKey: `${tag}:${index}`,
            fundingSourceReference: tag,
            fundedMarks: index === 0 ? 20 : 0,
            spentMarks: index === 0 ? 20 : 0,
            fundedAt: index === 0 ? new Date("2044-01-01") : null,
          })),
        )
        .returning();
      await tx.insert(s.academyClassSessionReport).values({
        sessionId: classSessions[0]!.id,
        deliveryTutorId: ids[0]!,
        currentActorId: ids[0]!,
        currentActorRole: "tutor",
        deliveryConfirmed: true,
        discussion: ["Test"],
        strengths: ["Test"],
        improvements: ["Test"],
      });
      await ledger(
        null,
        `class-allocation:${allocations[0]!.id}:complete:deduct`,
        20,
      );
      await ledger(
        null,
        `class-allocation:${allocations[0]!.id}:cancel:deduct`,
        4,
      );
      const payments = await tx
        .insert(s.paymentRecord)
        .values([
          {
            userId: ids[1]!,
            walletId: wallets[0]!.id,
            provider: "stub",
            providerReference: `${tag}:paid`,
            amountIdr: 100000,
            marks: 10,
            status: "PAID",
            providerSuccessAt: new Date("2044-01-10"),
            updatedAt: new Date("2043-01-01"),
          },
          {
            userId: ids[1]!,
            walletId: wallets[0]!.id,
            provider: "stub",
            providerReference: `${tag}:refunded`,
            amountIdr: 200000,
            marks: 20,
            status: "REFUNDED",
            providerSuccessAt: new Date("2044-01-11"),
          },
          {
            userId: ids[1]!,
            walletId: wallets[0]!.id,
            provider: "stub",
            providerReference: `${tag}:missing`,
            amountIdr: 300000,
            marks: 30,
            status: "PAID",
          },
          {
            userId: ids[1]!,
            walletId: wallets[0]!.id,
            provider: "stub",
            providerReference: `${tag}:pending`,
            amountIdr: 900000,
            marks: 90,
            status: "PENDING",
            providerSuccessAt: new Date("2044-01-15"),
          },
        ])
        .returning();
      await tx.insert(s.refundRecord).values({
        paymentId: payments[1]!.id,
        walletId: wallets[0]!.id,
        amountIdr: 200000,
        marks: 20,
        reason: tag,
        createdAt: new Date("2044-01-12"),
      });
      const fees = await tx
        .insert(s.tutorSessionFee)
        .values([
          {
            bookingId: solo.id,
            tutorId: ids[0]!,
            scheduledStartAt: solo.scheduledStartAt,
            earnedAt: new Date("2044-01-10"),
            eventKey: `${tag}:fee1`,
            grossHonorariumIdr: 100000,
          },
          {
            bookingId: group.id,
            tutorId: ids[0]!,
            scheduledStartAt: group.scheduledStartAt,
            earnedAt: new Date("2044-01-11"),
            eventKey: `${tag}:fee2`,
            grossHonorariumIdr: 200000,
          },
        ])
        .returning();
      const [payout] = await tx
        .insert(s.tutorPayout)
        .values({
          tutorId: ids[0]!,
          cutoffAt: new Date("2044-02-01"),
          grossHonorariumIdr: 100000,
          netHonorariumIdr: 100000,
          bankName: "Test",
          status: "paid",
        })
        .returning();
      await tx.insert(s.tutorPayoutAllocation).values({
        payoutId: payout!.id,
        sourceKey: `${tag}:fee1`,
        sourceType: "fee_event",
        tutorSessionFeeId: fees[0]!.id,
        bookingId: solo.id,
        bookingType: "solo",
        deliveryStatus: "completed",
        scheduledStartAt: solo.scheduledStartAt,
        earnedAt: new Date("2044-01-10"),
        grossHonorariumIdr: 100000,
        active: true,
      });
      const after = await getDashboardAnalytics(tx, query);
      const delta = (key: string) =>
        Number(after.operationsSummary[key]) -
        Number(before.operationsSummary[key]);
      expect(delta("privateMarks")).toBe(154);
      expect(delta("privateSessions")).toBe(3);
      expect(delta("academyMarks")).toBe(20);
      expect(delta("academySeatSessions")).toBe(1);
      expect(delta("privateFundedMarks")).toBe(75);
      expect(delta("privateUnfundedMarks")).toBe(55);
      expect(delta("privateSeatSessions")).toBe(4);
      expect(delta("unavailablePrivateRates")).toBe(1);
      expect(delta("academyUnfundedMarks")).toBe(22);
      expect(delta("academyUpcomingSeatSessions")).toBe(1);
      expect(delta("unavailablePaymentDates")).toBe(1);
      expect(delta("earnedIdr")).toBe(300000);
      expect(delta("paidIdr")).toBe(100000);
      expect(delta("unpaidIdr")).toBe(200000);
      expect(
        Number(after.paymentSummary.grossReceiptsIdr) -
          Number(before.paymentSummary.grossReceiptsIdr),
      ).toBe(300000);
      expect(
        Number(after.refundSummary.refundedIdr) -
          Number(before.refundSummary.refundedIdr),
      ).toBe(200000);
      await tx
        .update(s.academyClassEnrollmentAllocation)
        .set({
          state: "funded",
          fundedMarks: 22,
          fundedAt: new Date("2044-01-20"),
        })
        .where(eq(s.academyClassEnrollmentAllocation.id, allocations[1]!.id));
      await tx
        .update(s.academyClassEnrollmentInstallment)
        .set({ state: "funded" })
        .where(eq(s.academyClassEnrollmentInstallment.id, installments[1]!.id));
      const funded = await getDashboardAnalytics(tx, query);
      expect(
        Number(funded.operationsSummary.academyFundedMarks) -
          Number(before.operationsSummary.academyFundedMarks),
      ).toBe(22);
      expect(
        Number(funded.operationsSummary.academyUnfundedMarks) -
          Number(before.operationsSummary.academyUnfundedMarks),
      ).toBe(0);
      await tx
        .update(s.academyClassEnrollmentAllocation)
        .set({ state: "released", releasedMarks: 22 })
        .where(eq(s.academyClassEnrollmentAllocation.id, allocations[1]!.id));
      await tx
        .update(s.tutorPayoutAllocation)
        .set({ active: false })
        .where(eq(s.tutorPayoutAllocation.payoutId, payout!.id));
      await tx
        .update(s.tutorPayout)
        .set({ status: "void" })
        .where(eq(s.tutorPayout.id, payout!.id));
      await tx
        .update(s.booking)
        .set({ currentState: "cancelled" })
        .where(eq(s.booking.id, future.id));
      const cancelled = await getDashboardAnalytics(tx, query);
      expect(
        Number(cancelled.operationsSummary.academyUpcomingSeatSessions) -
          Number(before.operationsSummary.academyUpcomingSeatSessions),
      ).toBe(0);
      expect(
        Number(cancelled.operationsSummary.paidIdr) -
          Number(before.operationsSummary.paidIdr),
      ).toBe(0);
      expect(
        Number(cancelled.operationsSummary.unpaidIdr) -
          Number(before.operationsSummary.unpaidIdr),
      ).toBe(300000);
      expect(
        Number(cancelled.operationsSummary.privateFundedMarks) -
          Number(before.operationsSummary.privateFundedMarks),
      ).toBe(35);
      expect(
        Number(cancelled.operationsSummary.privateUnfundedMarks) -
          Number(before.operationsSummary.privateUnfundedMarks),
      ).toBe(15);
      await tx
        .update(s.paymentRecord)
        .set({
          providerSuccessAt: new Date("2043-01-01"),
          updatedAt: new Date("2044-01-20"),
        })
        .where(eq(s.paymentRecord.id, payments[0]!.id));
      const changed = await getDashboardAnalytics(tx, query);
      expect(
        Number(changed.paymentSummary.grossReceiptsIdr) -
          Number(before.paymentSummary.grossReceiptsIdr),
      ).toBe(200000);
      checked = true;
      throw done;
    });
  } catch (error) {
    if (error !== done) throw error;
  }
  expect(checked).toBe(true);
  expect(
    (
      await db
        .select()
        .from(s.user)
        .where(eq(s.user.email, `${tag}-0@example.test`))
    ).length,
  ).toBe(0);
});
