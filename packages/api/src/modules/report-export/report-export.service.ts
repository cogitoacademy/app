import {
  academyClass,
  academyClassEnrollmentAllocation,
  academyClassSession,
  academyClassSessionReport,
  booking,
  bookingParticipant,
  bookingSession,
  sessionCompletionFeedback,
  subjectCategory,
  user,
} from "@cogito-app/db/schema";
import {
  and,
  asc,
  eq,
  gte,
  gt,
  inArray,
  isNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import {
  createStudentReportPdf,
  type StudentReportPdfEntry,
  type StudentReportPdfModel,
} from "./report-export.pdf";
import { reportDateWindow } from "./report-export.window";
import { selectReports } from "./report-export.selection";
import { hasChargeableFeedbackEntitlement } from "../booking/booking.repo";
import { completionFeedbackEntitlementEventKeys } from "../booking/booking.service";
import type { DbType } from "../../lib/db";
import type {
  BookingSessionTopic,
  BookingPriceSnapshot,
} from "@cogito-app/db/schema";

type BookingReportType = "solo" | "group" | "series";

type PrivateReportRow = {
  id: string;
  version: number;
  bookingId: string;
  bookingNumber: number;
  bookingType: string;
  targetGroupSize: number;
  sessionId: string | null;
  bookingStartAt: Date;
  bookingEndAt: Date;
  childStartAt: Date | null;
  childEndAt: Date | null;
  tutorName: string;
  modality: string;
  learningGoal: string;
  sessionTopic: BookingSessionTopic | null;
  priceSnapshot: BookingPriceSnapshot | null;
  discussion: string[];
  strengths: string[];
  improvements: string[];
};

export type ReportExportSummary = {
  reportCount: number;
  periodStart: Date;
  generatedAt: Date;
  timezone: "Asia/Jakarta";
};

type ExportableReport = StudentReportPdfEntry & {
  key: string;
  reference: string;
  title: string;
  type: "private" | "cohort" | "masterclass";
};

function dateLabel(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
    timeZone: "Asia/Jakarta",
  }).format(value);
}

function timeLabel(startAt: Date, endAt: Date) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
  return `${formatter.format(startAt)} - ${formatter.format(endAt)} WIB`;
}

function text(value: string | null | undefined, fallback: string) {
  const clean = value?.trim();
  return clean || fallback;
}

function reportSections(
  discussion: string[],
  strengths: string[],
  improvements: string[],
) {
  return [
    { label: "Session discussion", bullets: discussion },
    { label: "Strengths observed", bullets: strengths },
    { label: "Areas for improvement", bullets: improvements },
  ];
}

function privateMetadata(
  row: PrivateReportRow,
  scheduledStartAt: Date,
  scheduledEndAt: Date,
  sessionNumber: number | undefined,
  seriesLength: number | undefined,
) {
  const topic = row.sessionTopic;
  const competition =
    row.priceSnapshot?.engine === "v3"
      ? row.priceSnapshot.competition
      : topic?.categoryName;
  const classType =
    row.bookingType === "group"
      ? "Group"
      : row.bookingType === "series"
        ? "Series"
        : "Solo";
  const session =
    row.bookingType === "series"
      ? `Session ${sessionNumber ?? 1} of ${seriesLength ?? 1}`
      : row.bookingType === "group"
        ? "Group session"
        : "Private session";

  return [
    { label: "Competition", value: text(competition, "Private tutoring") },
    {
      label: "Mode",
      value: row.modality === "online" ? "Online" : "In person",
    },
    { label: "Tutor", value: text(row.tutorName, "Tutor") },
    {
      label: "Date",
      value: dateLabel(scheduledStartAt),
    },
    {
      label: "Time",
      value: timeLabel(scheduledStartAt, scheduledEndAt),
    },
    { label: "Class type", value: classType },
    {
      label: "Topic",
      value: text(
        topic?.subcategoryName ?? row.learningGoal,
        text(topic?.categoryName, "Private session"),
      ),
    },
    {
      label: "Cohort / class",
      value:
        row.bookingType === "series" ? "Private series" : "Private booking",
    },
    { label: "Session", value: session },
  ];
}

function classMetadata(row: {
  classTitle: string;
  classKind: string;
  competition: string;
  mode: string;
  tutorName: string;
  startAt: Date;
  endAt: Date;
  sessionTitle: string;
  sequenceNumber: number;
}) {
  return [
    { label: "Competition", value: text(row.competition, "Academy class") },
    {
      label: "Mode",
      value: row.mode === "online" ? "Online" : "In person",
    },
    { label: "Tutor", value: text(row.tutorName, "Tutor") },
    { label: "Date", value: dateLabel(row.startAt) },
    { label: "Time", value: timeLabel(row.startAt, row.endAt) },
    {
      label: "Class type",
      value: row.classKind === "cohort" ? "Cohort" : "Masterclass",
    },
    { label: "Topic", value: text(row.sessionTitle, "Academy session") },
    { label: "Cohort / class", value: text(row.classTitle, "Academy class") },
    {
      label: "Session",
      value: `Session ${row.sequenceNumber}`,
    },
  ];
}

export function createReportExportService(deps: {
  db: DbType;
  clock?: () => Date;
  pdfRenderer?: (model: StudentReportPdfModel) => Promise<Uint8Array>;
}) {
  const clock = deps.clock ?? (() => new Date());
  const pdfRenderer = deps.pdfRenderer ?? createStudentReportPdf;

  async function loadStudentReports(studentId: string) {
    return deps.db.transaction(async (tx) => {
      await tx.execute(
        sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`,
      );

      const [student] = await tx
        .select({ id: user.id, name: user.name })
        .from(user)
        .where(and(eq(user.id, studentId), eq(user.role, "student")))
        .limit(1);
      if (!student) return null;

      // The student read establishes this transaction's repeatable-read snapshot.
      // Capture the report cutoff afterward so every included row is from that
      // snapshot and its scheduled time is no later than the displayed instant.
      const generatedAt = clock();
      const { startAt, endAt } = reportDateWindow(generatedAt);

      const privateRows = (await tx
        .select({
          id: sessionCompletionFeedback.id,
          version: sessionCompletionFeedback.version,
          bookingId: booking.id,
          bookingNumber: booking.bookingNumber,
          bookingType: booking.type,
          targetGroupSize: booking.targetGroupSize,
          sessionId: sessionCompletionFeedback.sessionId,
          bookingStartAt: booking.scheduledStartAt,
          bookingEndAt: booking.scheduledEndAt,
          childStartAt: bookingSession.scheduledStartAt,
          childEndAt: bookingSession.scheduledEndAt,
          tutorName: user.name,
          modality: booking.modality,
          learningGoal: booking.learningGoal,
          sessionTopic: booking.sessionTopic,
          priceSnapshot: booking.priceSnapshot,
          discussion: sessionCompletionFeedback.discussion,
          strengths: sessionCompletionFeedback.strengths,
          improvements: sessionCompletionFeedback.improvements,
        })
        .from(sessionCompletionFeedback)
        .innerJoin(booking, eq(sessionCompletionFeedback.bookingId, booking.id))
        .innerJoin(
          bookingParticipant,
          and(
            eq(bookingParticipant.bookingId, booking.id),
            eq(bookingParticipant.userId, studentId),
            ne(bookingParticipant.role, "tutor"),
          ),
        )
        .innerJoin(user, eq(booking.tutorId, user.id))
        .leftJoin(
          bookingSession,
          eq(sessionCompletionFeedback.sessionId, bookingSession.id),
        )
        .where(
          or(
            and(
              inArray(booking.type, ["solo", "group"]),
              isNull(sessionCompletionFeedback.sessionId),
              eq(booking.currentState, "completed"),
              gte(booking.scheduledStartAt, startAt),
              lte(booking.scheduledStartAt, endAt),
            ),
            and(
              eq(booking.type, "series"),
              eq(bookingSession.seriesBookingId, booking.id),
              eq(bookingSession.currentState, "completed"),
              gte(bookingSession.scheduledStartAt, startAt),
              lte(bookingSession.scheduledStartAt, endAt),
            ),
          ),
        )) as PrivateReportRow[];

      const entitlement = await Promise.all(
        privateRows.map(async (row) => {
          const eventKeys = completionFeedbackEntitlementEventKeys({
            bookingId: row.bookingId,
            bookingType: row.bookingType as BookingReportType,
            userId: studentId,
            sessionId: row.sessionId,
            seriesTargetGroupSize: row.targetGroupSize,
          });
          return hasChargeableFeedbackEntitlement(
            tx,
            row.bookingId,
            studentId,
            eventKeys,
          );
        }),
      );
      const entitledPrivateRows = privateRows.filter(
        (_, index) => entitlement[index],
      );

      const seriesBookingIds = [
        ...new Set(
          entitledPrivateRows
            .filter((row) => row.bookingType === "series")
            .map((row) => row.bookingId),
        ),
      ];
      const seriesSessions = seriesBookingIds.length
        ? await tx
            .select({
              id: bookingSession.id,
              bookingId: bookingSession.seriesBookingId,
            })
            .from(bookingSession)
            .where(inArray(bookingSession.seriesBookingId, seriesBookingIds))
            .orderBy(
              asc(bookingSession.scheduledStartAt),
              asc(bookingSession.id),
            )
        : [];
      const sessionsBySeries = new Map<string, string[]>();
      for (const session of seriesSessions) {
        const sessions = sessionsBySeries.get(session.bookingId) ?? [];
        sessions.push(session.id);
        sessionsBySeries.set(session.bookingId, sessions);
      }

      const privateReports: ExportableReport[] = entitledPrivateRows.map(
        (row) => {
          const start = row.childStartAt ?? row.bookingStartAt;
          const end = row.childEndAt ?? row.bookingEndAt;
          const sessions = sessionsBySeries.get(row.bookingId);
          const sessionIndex = sessions?.indexOf(row.sessionId ?? "");
          const sections = reportSections(
            row.discussion,
            row.strengths,
            row.improvements,
          );
          return {
            id: row.id,
            key: `private:${row.id}`,
            reference: `BKG-${row.bookingNumber}${row.sessionId ? `-S${(sessions?.indexOf(row.sessionId) ?? 0) + 1}` : ""}`,
            title: text(
              row.sessionTopic?.subcategoryName ?? row.learningGoal,
              "Private session",
            ),
            type: "private" as const,
            scheduledStartAt: start,
            metadata: privateMetadata(
              row,
              start,
              end,
              sessionIndex === -1 ? undefined : (sessionIndex ?? 0) + 1,
              sessions?.length,
            ),
            sections,
          };
        },
      );

      const classRows = await tx
        .select({
          id: academyClassSessionReport.id,
          startAt: academyClassSession.startAt,
          endAt: academyClassSession.endAt,
          classId: academyClass.id,
          classNumber: academyClass.classNumber,
          classTitle: academyClass.titleEn,
          classKind: academyClass.kind,
          competition: subjectCategory.name,
          mode: academyClassSession.mode,
          tutorName: user.name,
          sessionTitle: academyClassSession.titleEn,
          sequenceNumber: academyClassSession.sequenceNumber,
          discussion: academyClassSessionReport.discussion,
          strengths: academyClassSessionReport.strengths,
          improvements: academyClassSessionReport.improvements,
        })
        .from(academyClassSessionReport)
        .innerJoin(
          academyClassSession,
          eq(academyClassSessionReport.sessionId, academyClassSession.id),
        )
        .innerJoin(
          academyClass,
          eq(academyClassSession.classId, academyClass.id),
        )
        .innerJoin(
          subjectCategory,
          eq(academyClass.competitionId, subjectCategory.id),
        )
        .innerJoin(user, eq(academyClassSession.tutorId, user.id))
        .innerJoin(
          academyClassEnrollmentAllocation,
          and(
            eq(
              academyClassEnrollmentAllocation.sessionId,
              academyClassSession.id,
            ),
            eq(academyClassEnrollmentAllocation.studentId, studentId),
            eq(academyClassEnrollmentAllocation.state, "funded"),
            gt(academyClassEnrollmentAllocation.fundedMarks, 0),
            gt(academyClassEnrollmentAllocation.spentMarks, 0),
          ),
        )
        .where(
          and(
            eq(academyClassSession.state, "completed"),
            gte(academyClassSession.startAt, startAt),
            lte(academyClassSession.startAt, endAt),
          ),
        );

      const classReports: ExportableReport[] = classRows.map((row) => {
        const sections = reportSections(
          row.discussion,
          row.strengths,
          row.improvements,
        );
        return {
          id: row.id,
          key: `class:${row.id}`,
          reference: `CLS-${row.classNumber}-S${row.sequenceNumber}`,
          title: `${row.classTitle} · ${row.sessionTitle}`,
          type: row.classKind === "cohort" ? "cohort" : "masterclass",
          scheduledStartAt: row.startAt,
          metadata: classMetadata(row),
          sections,
        };
      });

      return {
        studentName: student.name,
        generatedAt,
        periodStart: startAt,
        reports: [...privateReports, ...classReports].toSorted(
          (left, right) =>
            right.scheduledStartAt.getTime() -
              left.scheduledStartAt.getTime() ||
            (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
        ),
      };
    });
  }

  async function getSummary(
    studentId: string,
  ): Promise<ReportExportSummary | null> {
    const data = await loadStudentReports(studentId);
    if (!data) return null;
    return {
      reportCount: data.reports.length,
      periodStart: data.periodStart,
      generatedAt: data.generatedAt,
      timezone: "Asia/Jakarta",
    };
  }

  async function listReports(studentId: string) {
    const data = await loadStudentReports(studentId);
    if (!data) return null;
    return {
      ...data,
      reports: data.reports.map(({ key, ...report }) =>
        Object.assign(report, { id: key }),
      ),
      timezone: "Asia/Jakarta" as const,
    };
  }

  async function generatePdf(
    studentId: string,
    reportIds: string[],
  ): Promise<Uint8Array | null> {
    const data = await loadStudentReports(studentId);
    if (!data) return null;
    data.reports = selectReports(
      data.reports,
      reportIds,
      (report) => report.key,
    );
    data.reports = data.reports.map((report) => ({
      ...report,
      metadata: [
        { label: "Reference", value: report.reference },
        ...report.metadata,
      ],
    }));
    return pdfRenderer(data);
  }

  return { getSummary, listReports, generatePdf };
}

export type ReportExportService = ReturnType<typeof createReportExportService>;
