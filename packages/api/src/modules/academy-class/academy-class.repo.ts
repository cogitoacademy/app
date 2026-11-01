import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  lt,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import {
  academyClass,
  academyClassMeeting,
  academyClassSession,
  booking,
  room,
  roomBooking,
  subjectCategory,
  tutorProfile,
  user,
} from "@cogito-app/db/schema";
import type { DbOrTx } from "../../lib/tx";
import type { TxClient } from "../../lib/tx";
import type { listAcademyClassesInput } from "./academy-class.types";
import type { z } from "zod";

export type AcademyClassRepo = ReturnType<typeof createAcademyClassRepo>;

export function createAcademyClassRepo() {
  async function list(
    conn: DbOrTx,
    input: z.infer<typeof listAcademyClassesInput>,
  ) {
    return conn.query.academyClass.findMany({
      where: input.state ? eq(academyClass.state, input.state) : undefined,
      with: {
        competition: { with: { parent: true } },
        sessions: {
          with: {
            tutor: true,
            room: true,
            meeting: true,
            tutorAbsences: { with: { tutor: true } },
          },
          orderBy: [asc(academyClassSession.sequenceNumber)],
        },
      },
      orderBy: [desc(academyClass.createdAt)],
    });
  }

  async function get(conn: DbOrTx, id: string) {
    return conn.query.academyClass.findFirst({
      where: eq(academyClass.id, id),
      with: {
        competition: { with: { parent: true } },
        sessions: {
          with: {
            tutor: true,
            room: true,
            meeting: true,
            tutorAbsences: { with: { tutor: true } },
          },
          orderBy: [asc(academyClassSession.sequenceNumber)],
        },
      },
    });
  }

  async function getCompetition(conn: DbOrTx, id: string) {
    return conn.query.subjectCategory.findFirst({
      where: eq(subjectCategory.id, id),
      with: { parent: true },
    });
  }

  async function getCompetitionForPublish(conn: TxClient, id: string) {
    const [competition] = await conn
      .select({ id: subjectCategory.id, parentId: subjectCategory.parentId })
      .from(subjectCategory)
      .where(eq(subjectCategory.id, id))
      .limit(1);
    if (!competition) return null;

    const lockIds = [competition.id, competition.parentId]
      .filter((value): value is string => value !== null)
      .toSorted();
    for (const lockId of lockIds) {
      // eslint-disable-next-line no-await-in-loop -- lock reference rows in a stable ID order
      await conn
        .select({ id: subjectCategory.id })
        .from(subjectCategory)
        .where(eq(subjectCategory.id, lockId))
        .for("update");
    }

    return getCompetition(conn, id);
  }

  async function getTutorProfiles(
    conn: DbOrTx,
    tutorIds: readonly string[],
    lockForUpdate = false,
  ) {
    if (tutorIds.length === 0) return [];
    const query = conn
      .select({
        userId: tutorProfile.userId,
        role: user.role,
        onboardingStatus: tutorProfile.onboardingStatus,
        modality: tutorProfile.modality,
        onlineMaxClassSize: tutorProfile.onlineMaxClassSize,
        offlineMaxClassSize: tutorProfile.offlineMaxClassSize,
      })
      .from(tutorProfile)
      .innerJoin(user, eq(user.id, tutorProfile.userId))
      .where(inArray(tutorProfile.userId, [...tutorIds]));
    return lockForUpdate ? query.for("update") : query;
  }

  async function getRooms(
    conn: DbOrTx,
    roomIds: readonly string[],
    lockForUpdate = false,
  ) {
    if (roomIds.length === 0) return [];
    const query = conn
      .select()
      .from(room)
      .where(and(inArray(room.id, [...roomIds]), eq(room.isActive, true)));
    return lockForUpdate ? query.for("update") : query;
  }

  async function lockClassForPublish(conn: DbOrTx, id: string) {
    const [row] = await conn
      .select({ id: academyClass.id })
      .from(academyClass)
      .where(eq(academyClass.id, id))
      .for("update");
    return row ?? null;
  }

  async function publishClassVersioned(
    conn: DbOrTx,
    id: string,
    expectedVersion: number,
    actorId: string,
    publishedAt: Date,
  ) {
    const [row] = await conn
      .update(academyClass)
      .set({
        state: "published",
        publishedAt,
        updatedBy: actorId,
        updatedAt: publishedAt,
        version: expectedVersion + 1,
      })
      .where(
        and(
          eq(academyClass.id, id),
          eq(academyClass.version, expectedVersion),
          eq(academyClass.state, "draft"),
        ),
      )
      .returning();
    return row ?? null;
  }

  async function publishSessions(conn: DbOrTx, classId: string) {
    return conn
      .update(academyClassSession)
      .set({ state: "scheduled" })
      .where(
        and(
          eq(academyClassSession.classId, classId),
          eq(academyClassSession.state, "draft"),
        ),
      )
      .returning();
  }

  async function insertMeetingJobs(
    conn: DbOrTx,
    sessionIds: readonly string[],
  ) {
    if (sessionIds.length === 0) return [];
    return conn
      .insert(academyClassMeeting)
      .values(sessionIds.map((sessionId) => ({ sessionId, status: "pending" })))
      .returning();
  }

  async function findTutorBookingOverlap(
    conn: DbOrTx,
    tutorId: string,
    startAt: Date,
    endAt: Date,
    activeBookingStates: readonly string[],
  ) {
    const [row] = await conn
      .select({ id: booking.id })
      .from(booking)
      .where(
        and(
          eq(booking.tutorId, tutorId),
          inArray(booking.currentState, [...activeBookingStates]),
          lt(booking.scheduledStartAt, endAt),
          gt(booking.scheduledEndAt, startAt),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async function findTutorClassOverlap(
    conn: DbOrTx,
    classId: string,
    tutorId: string,
    startAt: Date,
    endAt: Date,
  ) {
    const [row] = await conn
      .select({ id: academyClassSession.id })
      .from(academyClassSession)
      .innerJoin(academyClass, eq(academyClassSession.classId, academyClass.id))
      .where(
        and(
          eq(academyClassSession.tutorId, tutorId),
          eq(academyClassSession.state, "scheduled"),
          inArray(academyClass.state, ["published", "postponed"]),
          sql`${academyClassSession.classId} <> ${classId}`,
          lt(academyClassSession.startAt, endAt),
          gt(academyClassSession.endAt, startAt),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async function findRoomBookingOverlap(
    conn: DbOrTx,
    roomId: string,
    startAt: Date,
    endAt: Date,
  ) {
    const [row] = await conn
      .select({ id: roomBooking.id })
      .from(roomBooking)
      .where(
        and(
          eq(roomBooking.roomId, roomId),
          eq(roomBooking.status, "confirmed"),
          lt(roomBooking.startAt, endAt),
          gt(roomBooking.endAt, startAt),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async function findRoomClassOverlap(
    conn: DbOrTx,
    classId: string,
    roomId: string,
    startAt: Date,
    endAt: Date,
  ) {
    const [row] = await conn
      .select({ id: academyClassSession.id })
      .from(academyClassSession)
      .innerJoin(academyClass, eq(academyClassSession.classId, academyClass.id))
      .where(
        and(
          eq(academyClassSession.roomId, roomId),
          eq(academyClassSession.state, "scheduled"),
          inArray(academyClass.state, ["published", "postponed"]),
          sql`${academyClassSession.classId} <> ${classId}`,
          lt(academyClassSession.startAt, endAt),
          gt(academyClassSession.endAt, startAt),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async function findTutorClassSessionOverlap(
    conn: DbOrTx,
    sessionId: string,
    tutorId: string,
    startAt: Date,
    endAt: Date,
  ) {
    const [row] = await conn
      .select({ id: academyClassSession.id })
      .from(academyClassSession)
      .innerJoin(academyClass, eq(academyClassSession.classId, academyClass.id))
      .where(
        and(
          eq(academyClassSession.tutorId, tutorId),
          eq(academyClassSession.state, "scheduled"),
          inArray(academyClass.state, ["published", "postponed"]),
          sql`${academyClassSession.id} <> ${sessionId}`,
          lt(academyClassSession.startAt, endAt),
          gt(academyClassSession.endAt, startAt),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async function findRoomClassSessionOverlap(
    conn: DbOrTx,
    sessionId: string,
    roomId: string,
    startAt: Date,
    endAt: Date,
  ) {
    const [row] = await conn
      .select({ id: academyClassSession.id })
      .from(academyClassSession)
      .innerJoin(academyClass, eq(academyClassSession.classId, academyClass.id))
      .where(
        and(
          eq(academyClassSession.roomId, roomId),
          eq(academyClassSession.state, "scheduled"),
          inArray(academyClass.state, ["published", "postponed"]),
          sql`${academyClassSession.id} <> ${sessionId}`,
          lt(academyClassSession.startAt, endAt),
          gt(academyClassSession.endAt, startAt),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async function listReadyMeetingIds(
    conn: DbOrTx,
    now: Date,
    staleProcessingBefore: Date,
    limit = 50,
    classId?: string,
  ) {
    const staleSchedule = lt(
      academyClassMeeting.scheduleVersion,
      academyClassSession.version,
    );
    const leaseAvailable = or(
      isNull(academyClassMeeting.lockedAt),
      lte(academyClassMeeting.lockedAt, staleProcessingBefore),
    );
    const ready = or(
      and(
        inArray(academyClassMeeting.status, ["pending", "failed"]),
        lte(academyClassMeeting.nextRetryAt, now),
        leaseAvailable,
      ),
      and(eq(academyClassMeeting.status, "processing"), leaseAvailable),
    );
    const conditions = [
      or(
        and(
          inArray(academyClass.state, ["published", "postponed"]),
          eq(academyClassSession.state, "scheduled"),
          or(
            ready,
            and(eq(academyClassMeeting.status, "created"), staleSchedule),
          ),
        ),
        and(
          eq(academyClassSession.state, "cancelled"),
          or(ready, eq(academyClassMeeting.status, "created")),
        ),
      ),
    ];
    if (classId) conditions.push(eq(academyClassSession.classId, classId));
    return conn
      .select({ id: academyClassMeeting.id })
      .from(academyClassMeeting)
      .innerJoin(
        academyClassSession,
        eq(academyClassMeeting.sessionId, academyClassSession.id),
      )
      .innerJoin(academyClass, eq(academyClassSession.classId, academyClass.id))
      .where(and(...conditions))
      .orderBy(
        asc(academyClassMeeting.nextRetryAt),
        asc(academyClassMeeting.id),
      )
      .limit(limit);
  }

  async function claimMeeting(
    conn: DbOrTx,
    id: string,
    now: Date,
    staleProcessingBefore: Date,
  ) {
    const leaseAvailable = or(
      isNull(academyClassMeeting.lockedAt),
      lte(academyClassMeeting.lockedAt, staleProcessingBefore),
    );
    const eligible = or(
      and(
        inArray(academyClassMeeting.status, ["pending", "failed"]),
        lte(academyClassMeeting.nextRetryAt, now),
        leaseAvailable,
      ),
      and(eq(academyClassMeeting.status, "processing"), leaseAvailable),
    );
    const [row] = await conn
      .update(academyClassMeeting)
      .set({
        status: "processing",
        lockedAt: now,
        attemptCount: sql`${academyClassMeeting.attemptCount} + 1`,
      })
      .where(
        and(
          eq(academyClassMeeting.id, id),
          or(
            eligible,
            and(
              eq(academyClassMeeting.status, "created"),
              or(
                inArray(
                  academyClassMeeting.sessionId,
                  conn
                    .select({ id: academyClassSession.id })
                    .from(academyClassSession)
                    .where(eq(academyClassSession.state, "cancelled")),
                ),
                inArray(
                  academyClassMeeting.sessionId,
                  conn
                    .select({ id: academyClassSession.id })
                    .from(academyClassSession)
                    .where(
                      and(
                        eq(
                          academyClassSession.id,
                          academyClassMeeting.sessionId,
                        ),
                        gt(
                          academyClassSession.version,
                          academyClassMeeting.scheduleVersion,
                        ),
                      ),
                    ),
                ),
              ),
            ),
          ),
        ),
      )
      .returning();
    return row ?? null;
  }

  async function findMeetingAttemptDetails(conn: DbOrTx, meetingId: string) {
    const [row] = await conn
      .select({
        meeting: academyClassMeeting,
        session: academyClassSession,
        academyClass,
        tutorName: user.name,
        tutorEmail: user.email,
      })
      .from(academyClassMeeting)
      .innerJoin(
        academyClassSession,
        eq(academyClassMeeting.sessionId, academyClassSession.id),
      )
      .innerJoin(academyClass, eq(academyClassSession.classId, academyClass.id))
      .innerJoin(user, eq(academyClassSession.tutorId, user.id))
      .where(eq(academyClassMeeting.id, meetingId))
      .limit(1);
    return row ?? null;
  }

  async function finishMeetingAttempt(
    conn: DbOrTx,
    id: string,
    values: {
      provider: string;
      status: "created" | "failed" | "cancelled";
      externalEventId: string | null;
      meetingUrl: string | null;
      errorReason: string | null;
      nextRetryAt: Date;
      scheduleVersion: number;
      clearExternalEventId?: boolean;
      advanceCreationGeneration?: boolean;
    },
    claim: {
      lockedAt: Date;
      attemptCount: number;
      operation: "create" | "update" | "cancel";
    },
  ) {
    const {
      clearExternalEventId = false,
      advanceCreationGeneration = false,
      ...attemptValues
    } = values;
    const cancelledSession = sql`EXISTS (SELECT 1 FROM ${academyClassSession} WHERE ${academyClassSession.id} = ${academyClassMeeting.sessionId} AND ${academyClassSession.state} = 'cancelled')`;
    const writingProviderEvent = claim.operation !== "cancel";
    const sameLease = sql`${academyClassMeeting.lockedAt} = ${claim.lockedAt.toISOString()}::timestamptz AND ${academyClassMeeting.attemptCount} = ${claim.attemptCount}`;
    const pendingLeaseMarker = sql`${academyClassMeeting.status} = 'pending' AND ${sameLease}`;
    const newerScheduledSession = sql`EXISTS (SELECT 1 FROM ${academyClassSession} WHERE ${academyClassSession.id} = ${academyClassMeeting.sessionId} AND ${academyClassSession.state} = 'scheduled' AND ${academyClassSession.version} > ${values.scheduleVersion})`;
    const [row] = await conn
      .update(academyClassMeeting)
      .set({
        ...attemptValues,
        ...(advanceCreationGeneration
          ? {
              creationGeneration: sql`${academyClassMeeting.creationGeneration} + 1`,
            }
          : {}),
        externalEventId: clearExternalEventId
          ? null
          : sql`COALESCE(${values.externalEventId}, ${academyClassMeeting.externalEventId})`,
        lockedAt: null,
        status: writingProviderEvent
          ? sql`CASE WHEN ${cancelledSession} OR ${pendingLeaseMarker} THEN 'pending' ELSE ${values.status} END`
          : sql`CASE WHEN ${pendingLeaseMarker} THEN 'pending' ELSE ${values.status} END`,
        attemptCount: writingProviderEvent
          ? sql`CASE WHEN ${cancelledSession} THEN 1 ELSE ${academyClassMeeting.attemptCount} END`
          : academyClassMeeting.attemptCount,
        nextRetryAt: writingProviderEvent
          ? sql`CASE WHEN ${cancelledSession} OR ${pendingLeaseMarker} THEN NOW() ELSE ${values.nextRetryAt.toISOString()}::timestamptz END`
          : sql`CASE WHEN ${pendingLeaseMarker} THEN NOW() ELSE ${values.nextRetryAt.toISOString()}::timestamptz END`,
        scheduleVersion: sql`CASE WHEN ${pendingLeaseMarker} AND NOT ${cancelledSession} THEN LEAST(${values.scheduleVersion}, COALESCE((SELECT ${academyClassSession.version} - 1 FROM ${academyClassSession} WHERE ${academyClassSession.id} = ${academyClassMeeting.sessionId}), ${values.scheduleVersion})) ELSE ${values.scheduleVersion} END`,
      })
      .where(
        and(
          eq(academyClassMeeting.id, id),
          or(
            and(eq(academyClassMeeting.status, "processing"), sameLease),
            and(eq(academyClassMeeting.status, "pending"), sameLease),
          ),
        ),
      )
      .returning();
    if (row || !writingProviderEvent) return row ?? null;

    const lateProviderWrite =
      values.status === "created"
        ? or(cancelledSession, newerScheduledSession)
        : cancelledSession;
    const [requeued] = await conn
      .update(academyClassMeeting)
      .set({
        status: "pending",
        externalEventId: sql`COALESCE(${values.externalEventId}, ${academyClassMeeting.externalEventId})`,
        meetingUrl: sql`COALESCE(${values.meetingUrl}, ${academyClassMeeting.meetingUrl})`,
        errorReason: "Provider write completed after the meeting lease changed",
        nextRetryAt: sql`NOW()`,
        scheduleVersion: sql`CASE WHEN ${cancelledSession} THEN ${academyClassMeeting.scheduleVersion} ELSE LEAST(${academyClassMeeting.scheduleVersion}, ${values.scheduleVersion}) END`,
        // Keep a newer worker's lease while marking its work dirty. The owner
        // will finish the attempt and release this durable pending marker.
        lockedAt: sql`CASE WHEN ${academyClassMeeting.lockedAt} IS NOT NULL AND (${academyClassMeeting.lockedAt} <> ${claim.lockedAt.toISOString()}::timestamptz OR ${academyClassMeeting.attemptCount} <> ${claim.attemptCount}) THEN ${academyClassMeeting.lockedAt} ELSE NULL END`,
      })
      .where(and(eq(academyClassMeeting.id, id), lateProviderWrite))
      .returning();
    return requeued ?? null;
  }

  async function queueFailedClassMeetings(
    conn: DbOrTx,
    classId: string,
    now: Date,
  ) {
    const failedRows = await conn
      .select({ id: academyClassMeeting.id })
      .from(academyClassMeeting)
      .innerJoin(
        academyClassSession,
        eq(academyClassMeeting.sessionId, academyClassSession.id),
      )
      .where(
        and(
          eq(academyClassSession.classId, classId),
          eq(academyClassMeeting.status, "failed"),
        ),
      );
    if (failedRows.length === 0) return [];
    return conn
      .update(academyClassMeeting)
      .set({ status: "pending", nextRetryAt: now, lockedAt: null })
      .where(
        and(
          inArray(
            academyClassMeeting.id,
            failedRows.map(({ id }) => id),
          ),
          eq(academyClassMeeting.status, "failed"),
        ),
      )
      .returning({ id: academyClassMeeting.id });
  }

  async function listMeetingsForClass(conn: DbOrTx, classId: string) {
    return conn
      .select({
        meeting: academyClassMeeting,
        sessionId: academyClassSession.id,
      })
      .from(academyClassMeeting)
      .innerJoin(
        academyClassSession,
        eq(academyClassMeeting.sessionId, academyClassSession.id),
      )
      .where(eq(academyClassSession.classId, classId));
  }

  async function insertClass(
    conn: DbOrTx,
    values: typeof academyClass.$inferInsert,
  ) {
    const [row] = await conn.insert(academyClass).values(values).returning();
    return row!;
  }

  async function updateClassVersioned(
    conn: DbOrTx,
    id: string,
    expectedVersion: number,
    values: Partial<typeof academyClass.$inferInsert>,
  ) {
    const [row] = await conn
      .update(academyClass)
      .set(values)
      .where(
        and(eq(academyClass.id, id), eq(academyClass.version, expectedVersion)),
      )
      .returning();
    return row;
  }

  async function listSessionsForClass(conn: DbOrTx, classId: string) {
    return conn
      .select()
      .from(academyClassSession)
      .where(eq(academyClassSession.classId, classId));
  }

  async function deleteSessionsExcept(
    conn: DbOrTx,
    classId: string,
    keepIds: readonly string[],
  ) {
    const where =
      keepIds.length === 0
        ? eq(academyClassSession.classId, classId)
        : and(
            eq(academyClassSession.classId, classId),
            notInArray(academyClassSession.id, [...keepIds]),
          );
    await conn.delete(academyClassSession).where(where);
  }

  async function shiftSessionSequences(
    conn: DbOrTx,
    classId: string,
    sessionIds: readonly string[],
  ) {
    if (sessionIds.length === 0) return;
    await conn
      .update(academyClassSession)
      .set({
        sequenceNumber: sql`${academyClassSession.sequenceNumber} + 1000`,
      })
      .where(
        and(
          eq(academyClassSession.classId, classId),
          inArray(academyClassSession.id, [...sessionIds]),
        ),
      );
  }

  async function insertSessions(
    conn: DbOrTx,
    values: (typeof academyClassSession.$inferInsert)[],
  ) {
    if (values.length === 0) return [];
    return conn.insert(academyClassSession).values(values).returning();
  }

  async function updateSession(
    conn: DbOrTx,
    id: string,
    classId: string,
    values: Partial<typeof academyClassSession.$inferInsert>,
  ) {
    const [row] = await conn
      .update(academyClassSession)
      .set(values)
      .where(
        and(
          eq(academyClassSession.id, id),
          eq(academyClassSession.classId, classId),
        ),
      )
      .returning();
    return row;
  }

  return {
    list,
    get,
    getCompetition,
    getCompetitionForPublish,
    getTutorProfiles,
    getRooms,
    lockClassForPublish,
    publishClassVersioned,
    publishSessions,
    insertMeetingJobs,
    findTutorBookingOverlap,
    findTutorClassOverlap,
    findRoomBookingOverlap,
    findRoomClassOverlap,
    findTutorClassSessionOverlap,
    findRoomClassSessionOverlap,
    listReadyMeetingIds,
    claimMeeting,
    findMeetingAttemptDetails,
    finishMeetingAttempt,
    queueFailedClassMeetings,
    listMeetingsForClass,
    insertClass,
    updateClassVersioned,
    listSessionsForClass,
    deleteSessionsExcept,
    shiftSessionSequences,
    insertSessions,
    updateSession,
  };
}
