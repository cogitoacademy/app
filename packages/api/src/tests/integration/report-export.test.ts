import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  academyClass,
  academyClassEnrollment,
  academyClassEnrollmentAllocation,
  academyClassEnrollmentInstallment,
  academyClassSession,
  academyClassSessionReport,
  booking as bookingTable,
  bookingParticipant,
  bookingSession,
  ledgerEntry,
  sessionCompletionFeedback,
  sessionCompletionFeedbackHistory,
  subjectCategory,
  user,
  wallet,
} from "@cogito-app/db/schema";
import type { StudentReportPdfModel } from "../../modules/report-export/report-export.pdf";
import { createReportExportService } from "../../modules/report-export/report-export.service";
import { reportDateWindow } from "../../modules/report-export/report-export.window";

function assertReportExportTestDatabase() {
  let url: URL;
  try {
    url = new URL(process.env.DATABASE_URL ?? "");
  } catch {
    throw new Error(
      "Report export integration tests require loopback 6769/cogito-test.",
    );
  }

  if (
    process.env.NODE_ENV !== "test" ||
    process.env.TEST_DATABASE_ALLOW_RESET !== undefined ||
    process.env.TEST_DATABASE_RESET_TARGET !== undefined ||
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "::1", "[::1]"].includes(
      url.hostname.toLowerCase(),
    ) ||
    url.port !== "6769" ||
    url.pathname !== "/cogito-test" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(
      "Report export integration tests require NODE_ENV=test, exact loopback 6769/cogito-test, and absent reset overrides; no data was changed.",
    );
  }
}

assertReportExportTestDatabase();

const GENERATED_AT = new Date("2026-10-22T04:30:00.000Z");
const ownedBookingIds = new Set<string>();
const ownedClassIds = new Set<string>();
const ownedClassSessionIds = new Set<string>();
const ownedClassReportIds = new Set<string>();
const ownedEnrollmentIds = new Set<string>();
const ownedInstallmentIds = new Set<string>();
const ownedAllocationIds = new Set<string>();
const ownedWalletIds = new Set<string>();
const ownedUserIds = new Set<string>();

let competitionId = "";
let tutorId = "";
let targetStudentId = "";
let otherStudentId = "";
const walletIds = new Map<string, string>();

async function createUser(role: "student" | "tutor", name: string) {
  const id = crypto.randomUUID();
  await db.insert(user).values({
    id,
    name,
    email: `report-export-${id}@cogito.test`,
    emailVerified: true,
    role,
  });
  ownedUserIds.add(id);
  return id;
}

async function createWallet(userId: string) {
  const id = crypto.randomUUID();
  await db.insert(wallet).values({
    id,
    userId,
    totalBalance: 10,
    heldBalance: 0,
    availableBalance: 10,
  });
  ownedWalletIds.add(id);
  walletIds.set(userId, id);
  return id;
}

async function addPrivateReport(input: {
  type: "solo" | "group" | "series";
  startAt: Date;
  marker: string;
  participants: string[];
  chargedUsers?: string[];
  chargeKind?: "deduct" | "no-show" | "wrong-key";
  parentState?: "completed" | "cancelled";
}) {
  const id = crypto.randomUUID();
  const sessionId = input.type === "series" ? crypto.randomUUID() : null;
  const endAt = new Date(input.startAt.getTime() + 60 * 60_000);
  const groupSize = input.type === "group" ? input.participants.length : 1;

  await db.insert(bookingTable).values({
    id,
    type: input.type,
    modality: "online",
    tutorId,
    proposerId: input.participants[0]!,
    targetGroupSize: groupSize,
    minConfirmedHeadcount: 1,
    confirmedHeadcount: input.participants.length,
    currentState:
      input.parentState ??
      (input.type === "series" ? "cancelled" : "completed"),
    scheduledStartAt: input.startAt,
    scheduledEndAt: endAt,
    completedAt: endAt,
    timezone: "Asia/Jakarta",
    originalMarks: input.participants.length * 10,
    holdAmount: input.participants.length * 10,
  });
  ownedBookingIds.add(id);

  await db.insert(bookingParticipant).values(
    input.participants.map((userId, index) => ({
      bookingId: id,
      userId,
      role: index === 0 ? ("proposer" as const) : ("invitee" as const),
      confirmationState:
        input.chargeKind === "no-show" && userId === targetStudentId
          ? ("no_show" as const)
          : ("confirmed" as const),
      heldAmount: 10,
      confirmedAt:
        input.chargeKind === "no-show" && userId === targetStudentId
          ? null
          : input.startAt,
    })),
  );

  if (sessionId) {
    await db.insert(bookingSession).values({
      id: sessionId,
      seriesBookingId: id,
      scheduledStartAt: input.startAt,
      scheduledEndAt: endAt,
      completedAt: endAt,
      currentState: "completed",
      holdAmount: 10,
    });
  }

  await db.insert(sessionCompletionFeedback).values({
    bookingId: id,
    sessionId,
    authorId: tutorId,
    discussion: [input.marker],
    strengths: [`${input.marker} strength`],
    improvements: [`${input.marker} next step`],
  });

  for (const userId of input.chargedUsers ?? []) {
    const eventKey =
      input.chargeKind === "wrong-key"
        ? `booking.${id}.deduct.some-other-session`
        : input.chargeKind === "no-show"
          ? `booking.${id}.no_show.${userId}.solo`
          : input.type === "series"
            ? `booking.${id}.session.${sessionId}.deduct`
            : input.type === "group"
              ? `booking.${id}.complete.${userId}`
              : `booking.${id}.deduct`;
    await db.insert(ledgerEntry).values({
      walletId: walletIds.get(userId)!,
      bookingId: id,
      eventKey,
      entryType: "deduct",
      actorType: "system",
      amount: 1,
      beforeBalance: 10,
      afterBalance: 9,
      balanceAfterWalletTotal: 9,
      balanceAfterWalletHeld: 0,
      reason: "Run-owned report export entitlement fixture",
      sourceReference: id,
    });
  }

  return { id, sessionId };
}

async function addClassReport(input: {
  kind: "cohort" | "masterclass";
  startAt: Date;
  marker: string;
  allocation?: {
    state: "funded" | "released" | "unfunded_reserved";
    studentId: string;
  };
  largeCurriculum?: boolean;
}) {
  const classId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const reportId = crypto.randomUUID();
  const classTitle = `Report export ${input.kind} ${input.marker}`;
  const sessionTitle = `${input.kind} session ${input.marker}`;
  const rateMarks = input.kind === "cohort" ? 20 : 5;
  const endAt = new Date(input.startAt.getTime() + 60 * 60_000);

  await db.insert(academyClass).values({
    id: classId,
    kind: input.kind,
    competitionId,
    titleEn: classTitle,
    descriptionEn: "Synthetic report export eligibility fixture.",
    tutorFeeIdr: 100_000,
    state: "published",
    minimumEnrollment: input.kind === "cohort" ? 1 : null,
    minimumCheckAt:
      input.kind === "cohort"
        ? new Date(GENERATED_AT.getTime() - 24 * 60 * 60_000)
        : null,
    cohortFullRateMarks: input.kind === "cohort" ? rateMarks : null,
    cohortHalfRateMarks: input.kind === "cohort" ? 22 : null,
    cohortSingleRateMarks: input.kind === "cohort" ? 25 : null,
    masterclassRateMarks: input.kind === "masterclass" ? rateMarks : null,
    publishedAt: input.startAt,
  });
  ownedClassIds.add(classId);

  await db.insert(academyClassSession).values({
    id: sessionId,
    classId,
    sequenceNumber: 1,
    capacity: 4,
    titleEn: sessionTitle,
    curriculumEn: input.largeCurriculum ? "C".repeat(5000) : "Short curriculum",
    startAt: input.startAt,
    endAt,
    mode: "online",
    tutorId,
    tutorFeeIdr: 100_000,
    state: "completed",
  });
  ownedClassSessionIds.add(sessionId);

  if (input.allocation) {
    const enrollmentId = crypto.randomUUID();
    const installmentId = crypto.randomUUID();
    const allocationId = crypto.randomUUID();
    const isFunded = input.allocation.state === "funded";
    const isReleased = input.allocation.state === "released";

    await db.insert(academyClassEnrollment).values({
      id: enrollmentId,
      classId,
      studentId: input.allocation.studentId,
      requestKey: `report-export-${crypto.randomUUID()}`,
      plan: input.kind === "masterclass" ? "masterclass" : "single",
      state: isFunded
        ? "active"
        : isReleased
          ? "cancelled"
          : "checkout_pending",
      sessionCount: 1,
      firstRateMarks: rateMarks,
      secondRateMarks: null,
      firstInstallmentMarks: rateMarks,
      secondInstallmentMarks: 0,
      totalMarks: rateMarks,
    });
    ownedEnrollmentIds.add(enrollmentId);

    await db.insert(academyClassEnrollmentInstallment).values({
      id: installmentId,
      enrollmentId,
      ordinal: 1,
      rateMarks,
      sessionCount: 1,
      amountMarks: rateMarks,
      state: isFunded || isReleased ? "funded" : "pending",
      fundedAt: isFunded || isReleased ? input.startAt : null,
    });
    ownedInstallmentIds.add(installmentId);

    await db.insert(academyClassEnrollmentAllocation).values({
      id: allocationId,
      enrollmentId,
      installmentId,
      classId,
      sessionId,
      studentId: input.allocation.studentId,
      ordinal: 1,
      sequenceNumber: 1,
      rateMarks,
      state: input.allocation.state,
      fundingEventKey: `report-export.${crypto.randomUUID()}`,
      fundingSourceReference: `report-export.${crypto.randomUUID()}`,
      fundedMarks: isFunded || isReleased ? rateMarks : 0,
      spentMarks: isFunded ? 1 : 0,
      releasedMarks: isReleased ? rateMarks : 0,
      fundedAt: isFunded || isReleased ? input.startAt : null,
    });
    ownedAllocationIds.add(allocationId);
  }

  await db.insert(academyClassSessionReport).values({
    id: reportId,
    sessionId,
    deliveryTutorId: tutorId,
    currentActorId: tutorId,
    currentActorRole: "tutor",
    adminReason: null,
    deliveryConfirmed: true,
    discussion: [input.marker],
    strengths: [`${input.marker} strength`],
    improvements: [`${input.marker} next step`],
  });
  ownedClassReportIds.add(reportId);

  return { reportId, classTitle, sessionTitle };
}

beforeAll(async () => {
  assertReportExportTestDatabase();
  const result = await db.execute(
    sql`SELECT current_database() AS database_name`,
  );
  const rows = (
    Array.isArray(result)
      ? result
      : ((result as unknown as { rows?: unknown[] }).rows ?? [])
  ) as Array<{ database_name?: unknown }>;
  if (rows[0]?.database_name !== "cogito-test") {
    throw new Error(
      "Report export integration tests require current_database() = cogito-test; no data was changed.",
    );
  }

  const [competition] = await db
    .select({ id: subjectCategory.id })
    .from(subjectCategory)
    .where(
      and(eq(subjectCategory.isActive, true), isNull(subjectCategory.parentId)),
    )
    .limit(1);
  if (!competition) {
    throw new Error(
      "Report export integration tests require one active root competition.",
    );
  }
  competitionId = competition.id;
});

afterAll(async () => {
  const bookingIds = [...ownedBookingIds];
  if (bookingIds.length) {
    await db
      .delete(ledgerEntry)
      .where(inArray(ledgerEntry.bookingId, bookingIds));
    await db.delete(bookingTable).where(inArray(bookingTable.id, bookingIds));
  }

  const reportIds = [...ownedClassReportIds];
  if (reportIds.length) {
    await db
      .delete(academyClassSessionReport)
      .where(inArray(academyClassSessionReport.id, reportIds));
  }
  const allocationIds = [...ownedAllocationIds];
  if (allocationIds.length) {
    await db
      .delete(academyClassEnrollmentAllocation)
      .where(inArray(academyClassEnrollmentAllocation.id, allocationIds));
  }
  const installmentIds = [...ownedInstallmentIds];
  if (installmentIds.length) {
    await db
      .delete(academyClassEnrollmentInstallment)
      .where(inArray(academyClassEnrollmentInstallment.id, installmentIds));
  }
  const enrollmentIds = [...ownedEnrollmentIds];
  if (enrollmentIds.length) {
    await db
      .delete(academyClassEnrollment)
      .where(inArray(academyClassEnrollment.id, enrollmentIds));
  }
  const sessionIds = [...ownedClassSessionIds];
  if (sessionIds.length) {
    await db
      .delete(academyClassSession)
      .where(inArray(academyClassSession.id, sessionIds));
  }
  const classIds = [...ownedClassIds];
  if (classIds.length) {
    await db.delete(academyClass).where(inArray(academyClass.id, classIds));
  }

  const ownedWalletIdsList = [...ownedWalletIds];
  if (ownedWalletIdsList.length) {
    await db.delete(wallet).where(inArray(wallet.id, ownedWalletIdsList));
  }
  const userIds = [...ownedUserIds];
  if (userIds.length) {
    await db.delete(user).where(inArray(user.id, userIds));
  }
});

describe("student report export eligibility PostgreSQL [REQ-REPORT-04/Q06]", () => {
  test("uses exact chargeable ownership, live class allocations, and descending session dates", async () => {
    tutorId = await createUser("tutor", "Report export tutor fixture");
    targetStudentId = await createUser("student", "Live export student");
    otherStudentId = await createUser("student", "Other export student");
    await createWallet(targetStudentId);
    await createWallet(otherStudentId);

    const windowStart = reportDateWindow(GENERATED_AT).startAt;
    const privateSolo = await addPrivateReport({
      type: "solo",
      startAt: new Date("2026-10-19T02:30:00.000Z"),
      marker: "private-solo",
      participants: [targetStudentId],
      chargedUsers: [targetStudentId],
    });
    const [privateSoloFeedback] = await db
      .select({ id: sessionCompletionFeedback.id })
      .from(sessionCompletionFeedback)
      .where(eq(sessionCompletionFeedback.bookingId, privateSolo.id));
    if (!privateSoloFeedback) throw new Error("Expected private solo feedback");
    await db.insert(sessionCompletionFeedbackHistory).values({
      feedbackId: privateSoloFeedback.id,
      bookingId: privateSolo.id,
      sessionId: null,
      version: 1,
      status: "submitted",
      actorId: tutorId,
      actorRole: "tutor",
      reason: null,
      deliveryConfirmed: true,
      discussion: ["private-solo"],
      strengths: ["private-solo strength"],
      improvements: ["private-solo next step"],
      requestKey: null,
      requestPayload: null,
    });
    await addPrivateReport({
      type: "group",
      startAt: new Date("2026-10-20T02:30:00.000Z"),
      marker: "private-group",
      participants: [targetStudentId, otherStudentId],
      chargedUsers: [targetStudentId, otherStudentId],
    });
    await addPrivateReport({
      type: "series",
      startAt: new Date("2026-10-21T02:30:00.000Z"),
      marker: "private-cancelled-series-child",
      participants: [targetStudentId],
      chargedUsers: [targetStudentId],
      parentState: "cancelled",
    });
    await addPrivateReport({
      type: "group",
      startAt: new Date("2026-10-22T03:30:00.000Z"),
      marker: "private-chargeable-no-show",
      participants: [targetStudentId, otherStudentId],
      chargedUsers: [targetStudentId],
      chargeKind: "no-show",
    });
    await addPrivateReport({
      type: "solo",
      startAt: windowStart,
      marker: "private-window-start",
      participants: [targetStudentId],
      chargedUsers: [targetStudentId],
    });
    await addPrivateReport({
      type: "solo",
      startAt: new Date("2026-10-22T03:00:00.000Z"),
      marker: "excluded-no-charge",
      participants: [targetStudentId],
    });
    await addPrivateReport({
      type: "group",
      startAt: new Date("2026-10-22T02:30:00.000Z"),
      marker: "excluded-other-student-charge",
      participants: [targetStudentId, otherStudentId],
      chargedUsers: [otherStudentId],
    });
    await addPrivateReport({
      type: "solo",
      startAt: new Date("2026-10-22T02:00:00.000Z"),
      marker: "excluded-wrong-event-key",
      participants: [targetStudentId],
      chargedUsers: [targetStudentId],
      chargeKind: "wrong-key",
    });
    await addPrivateReport({
      type: "solo",
      startAt: new Date(windowStart.getTime() - 1),
      marker: "excluded-before-window",
      participants: [targetStudentId],
      chargedUsers: [targetStudentId],
    });

    const cohort = await addClassReport({
      kind: "cohort",
      startAt: new Date("2026-10-22T02:30:00.000Z"),
      marker: "class-cohort-funded",
      allocation: { state: "funded", studentId: targetStudentId },
      largeCurriculum: true,
    });
    const masterclass = await addClassReport({
      kind: "masterclass",
      startAt: new Date("2026-10-21T03:30:00.000Z"),
      marker: "class-masterclass-funded",
      allocation: { state: "funded", studentId: targetStudentId },
    });
    await addClassReport({
      kind: "cohort",
      startAt: new Date("2026-10-21T01:30:00.000Z"),
      marker: "excluded-class-released",
      allocation: { state: "released", studentId: targetStudentId },
    });
    await addClassReport({
      kind: "masterclass",
      startAt: new Date("2026-10-21T00:30:00.000Z"),
      marker: "excluded-class-unfunded",
      allocation: { state: "unfunded_reserved", studentId: targetStudentId },
    });
    await addClassReport({
      kind: "cohort",
      startAt: new Date("2026-10-20T00:30:00.000Z"),
      marker: "excluded-class-nonowner",
      allocation: { state: "funded", studentId: otherStudentId },
    });

    let captured: StudentReportPdfModel | undefined;
    const reportService = createReportExportService({
      db,
      clock: () => new Date(GENERATED_AT),
      pdfRenderer: async (model) => {
        captured = model;
        return new Uint8Array();
      },
    });
    const summary = await reportService.getSummary(targetStudentId);
    expect(summary?.reportCount).toBe(7);
    expect(summary?.generatedAt).toEqual(GENERATED_AT);
    expect(await reportService.generatePdf(targetStudentId)).toEqual(
      new Uint8Array(),
    );

    expect(captured?.studentName).toBe("Live export student");
    expect(
      captured?.reports.map((report) => report.sections[0]!.bullets[0]!),
    ).toEqual([
      "private-chargeable-no-show",
      "class-cohort-funded",
      "class-masterclass-funded",
      "private-cancelled-series-child",
      "private-group",
      "private-solo",
      "private-window-start",
    ]);
    expect(
      captured?.reports.map((report) => report.scheduledStartAt.getTime()),
    ).toEqual(
      [
        new Date("2026-10-22T03:30:00.000Z"),
        new Date("2026-10-22T02:30:00.000Z"),
        new Date("2026-10-21T03:30:00.000Z"),
        new Date("2026-10-21T02:30:00.000Z"),
        new Date("2026-10-20T02:30:00.000Z"),
        new Date("2026-10-19T02:30:00.000Z"),
        windowStart,
      ].map((date) => date.getTime()),
    );

    const cohortReport = captured?.reports.find(
      (report) => report.id === cohort.reportId,
    );
    const masterclassReport = captured?.reports.find(
      (report) => report.id === masterclass.reportId,
    );
    expect(cohortReport?.metadata).toContainEqual({
      label: "Topic",
      value: cohort.sessionTitle,
    });
    expect(cohortReport?.metadata).toContainEqual({
      label: "Cohort / class",
      value: cohort.classTitle,
    });
    expect(masterclassReport?.metadata).toContainEqual({
      label: "Topic",
      value: masterclass.sessionTitle,
    });
    const includedMarkers = captured?.reports.flatMap((report) =>
      report.sections.flatMap((section) => section.bullets),
    );
    expect(includedMarkers).not.toContain("excluded-no-charge");
    expect(includedMarkers).not.toContain("excluded-other-student-charge");
    expect(includedMarkers).not.toContain("excluded-wrong-event-key");
    expect(includedMarkers).not.toContain("excluded-before-window");
    expect(includedMarkers).not.toContain("excluded-class-released");
    expect(includedMarkers).not.toContain("excluded-class-unfunded");
    expect(includedMarkers).not.toContain("excluded-class-nonowner");
    const requestedAt = Date.now();
    const currentSummary = await createReportExportService({ db }).getSummary(
      targetStudentId,
    );
    expect(currentSummary?.generatedAt.getTime()).toBeGreaterThanOrEqual(
      requestedAt,
    );
    expect(currentSummary?.generatedAt.getTime()).toBeLessThanOrEqual(
      Date.now(),
    );
    expect(currentSummary?.timezone).toBe("Asia/Jakarta");
  });
});
