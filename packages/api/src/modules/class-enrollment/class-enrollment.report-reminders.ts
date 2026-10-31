import { and, asc, eq, exists, inArray, lte, not, sql } from "drizzle-orm";
import {
  academyClass,
  academyClassSession,
  academyClassSessionReport,
  notification,
} from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { TxClient } from "../../lib/tx";
import { log } from "../../lib/logger";
import type { NotificationService } from "../notification/notification.service";

const DAY_MS = 24 * 60 * 60 * 1000;
export const CLASS_REPORT_REMINDER_BATCH_SIZE = 100;
const REMINDER_ELIGIBLE_CLASS_STATES = [
  "published",
  "postponed",
  "cancelled",
] as const;

export type ClassReportReminderCandidate = Pick<
  typeof academyClassSession.$inferSelect,
  "id" | "classId" | "tutorId" | "endAt"
>;

export interface ClassReportReminderRepo {
  findDue(
    db: DbType,
    nowAt: Date,
    limit: number,
  ): Promise<ClassReportReminderCandidate[]>;
  writeIfPending(
    db: DbType,
    candidate: ClassReportReminderCandidate,
    nowAt: Date,
    eventKey: string,
    write: (tx: TxClient) => Promise<void>,
  ): Promise<boolean>;
}

export function classReportReminderPeriod(endAt: Date, nowAt: Date) {
  const elapsed = nowAt.getTime() - endAt.getTime();
  return Number.isFinite(elapsed) && elapsed >= 0
    ? Math.floor(elapsed / DAY_MS)
    : null;
}

export function classReportReminderEventKey(sessionId: string, period: number) {
  return `academy-class-session:${sessionId}:missing-report:day:${period}`;
}

export function createClassReportReminderRepo(): ClassReportReminderRepo {
  return {
    async findDue(db, nowAt, limit) {
      const nowAtIso = nowAt.toISOString();
      const period = sql`floor(extract(epoch from (${nowAtIso}::timestamptz - ${academyClassSession.endAt})) / 86400)::bigint`;
      const currentEventKey = sql`'academy-class-session:' || ${academyClassSession.id} || ':missing-report:day:' || (${period})::text`;

      return db
        .select({
          id: academyClassSession.id,
          classId: academyClassSession.classId,
          tutorId: academyClassSession.tutorId,
          endAt: academyClassSession.endAt,
        })
        .from(academyClassSession)
        .innerJoin(
          academyClass,
          eq(academyClassSession.classId, academyClass.id),
        )
        .where(
          and(
            inArray(academyClass.state, REMINDER_ELIGIBLE_CLASS_STATES),
            eq(academyClassSession.state, "scheduled"),
            lte(academyClassSession.endAt, nowAt),
            not(
              exists(
                db
                  .select({ id: academyClassSessionReport.id })
                  .from(academyClassSessionReport)
                  .where(
                    eq(
                      academyClassSessionReport.sessionId,
                      academyClassSession.id,
                    ),
                  ),
              ),
            ),
            not(
              exists(
                db
                  .select({ id: notification.id })
                  .from(notification)
                  .where(eq(notification.eventKey, currentEventKey)),
              ),
            ),
          ),
        )
        .orderBy(asc(academyClassSession.endAt), asc(academyClassSession.id))
        .limit(Math.min(limit, CLASS_REPORT_REMINDER_BATCH_SIZE));
    },

    async writeIfPending(db, candidate, nowAt, eventKey, write) {
      return db.transaction(async (tx) => {
        const [classRecord] = await tx
          .select({ state: academyClass.state })
          .from(academyClass)
          .where(eq(academyClass.id, candidate.classId))
          .for("update");
        const [session] = await tx
          .select({
            id: academyClassSession.id,
            state: academyClassSession.state,
            tutorId: academyClassSession.tutorId,
            endAt: academyClassSession.endAt,
          })
          .from(academyClassSession)
          .where(
            and(
              eq(academyClassSession.id, candidate.id),
              eq(academyClassSession.classId, candidate.classId),
            ),
          )
          .for("update");

        const period = session
          ? classReportReminderPeriod(session.endAt, nowAt)
          : null;
        const eligibleClassState =
          classRecord?.state === "published" ||
          classRecord?.state === "postponed" ||
          classRecord?.state === "cancelled";
        if (
          !classRecord ||
          !eligibleClassState ||
          !session ||
          session.state !== "scheduled" ||
          session.tutorId !== candidate.tutorId ||
          session.endAt.getTime() !== candidate.endAt.getTime() ||
          session.endAt > nowAt ||
          period === null ||
          eventKey !== classReportReminderEventKey(session.id, period)
        ) {
          return false;
        }

        const [report] = await tx
          .select({ id: academyClassSessionReport.id })
          .from(academyClassSessionReport)
          .where(eq(academyClassSessionReport.sessionId, session.id))
          .limit(1);
        if (report) return false;

        const [existingReminder] = await tx
          .select({ id: notification.id })
          .from(notification)
          .where(eq(notification.eventKey, eventKey))
          .limit(1);
        if (existingReminder) return false;

        await write(tx);
        return true;
      });
    },
  };
}

export function createClassReportReminderProcessor(deps: {
  db: DbType;
  repo: ClassReportReminderRepo;
  notification: Pick<NotificationService, "write">;
  appBaseUrl: string;
  clock?: () => Date;
}) {
  async function processPendingReportReminders() {
    const nowAt = deps.clock?.() ?? new Date();
    const candidates = await deps.repo.findDue(
      deps.db,
      nowAt,
      CLASS_REPORT_REMINDER_BATCH_SIZE,
    );
    const appBaseUrl = deps.appBaseUrl.replace(/\/+$/, "");
    let queued = 0;
    let skipped = 0;
    let failed = 0;

    // Keep lock-and-write transactions sequential within each bounded batch.
    // eslint-disable no-await-in-loop -- Process independently locked candidate rows in sequence.
    for (const candidate of candidates) {
      const period = classReportReminderPeriod(candidate.endAt, nowAt);
      if (period === null) {
        skipped += 1;
        continue;
      }
      const eventKey = classReportReminderEventKey(candidate.id, period);
      try {
        const wasQueued = await deps.repo.writeIfPending(
          deps.db,
          candidate,
          nowAt,
          eventKey,
          (tx) =>
            deps.notification.write({
              db: tx,
              userId: candidate.tutorId,
              category: "schedule",
              title: "Class session report needed",
              body: "Please submit the report for your delivered Cogito class session.",
              severity: "action",
              emailRequired: true,
              eventKey,
              metadata: {
                action: "class-session-report",
                actionUrl: `${appBaseUrl}/class-reports`,
              },
            }),
        );
        if (wasQueued) queued += 1;
        else skipped += 1;
      } catch (error) {
        failed += 1;
        log({
          level: "error",
          action: "class_report_reminder_failed",
          sessionId: candidate.id,
          eventKey,
          error: { message: String(error) },
        });
      }
    }
    // eslint-enable no-await-in-loop

    return { checked: candidates.length, queued, skipped, failed };
  }

  return { processPendingReportReminders };
}
