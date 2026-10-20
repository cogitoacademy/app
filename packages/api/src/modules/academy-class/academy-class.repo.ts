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
          with: { tutor: true, room: true, meeting: true },
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
          with: { tutor: true, room: true, meeting: true },
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

  async function getTutorProfiles(conn: DbOrTx, tutorIds: readonly string[]) {
    if (tutorIds.length === 0) return [];
    return conn
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
  }

  async function getRooms(conn: DbOrTx, roomIds: readonly string[]) {
    if (roomIds.length === 0) return [];
    return conn
      .select()
      .from(room)
      .where(and(inArray(room.id, [...roomIds]), eq(room.isActive, true)));
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
          eq(academyClass.state, "published"),
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
          eq(academyClass.state, "published"),
          sql`${academyClassSession.classId} <> ${classId}`,
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
    const ready = or(
      and(
        inArray(academyClassMeeting.status, ["pending", "failed"]),
        lte(academyClassMeeting.nextRetryAt, now),
      ),
      and(
        eq(academyClassMeeting.status, "processing"),
        or(
          isNull(academyClassMeeting.lockedAt),
          lte(academyClassMeeting.lockedAt, staleProcessingBefore),
        ),
      ),
    );
    const conditions = [ready];
    if (classId) conditions.push(eq(academyClassSession.classId, classId));
    return conn
      .select({ id: academyClassMeeting.id })
      .from(academyClassMeeting)
      .innerJoin(
        academyClassSession,
        eq(academyClassMeeting.sessionId, academyClassSession.id),
      )
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
    const eligible = or(
      and(
        inArray(academyClassMeeting.status, ["pending", "failed"]),
        lte(academyClassMeeting.nextRetryAt, now),
      ),
      and(
        eq(academyClassMeeting.status, "processing"),
        or(
          isNull(academyClassMeeting.lockedAt),
          lte(academyClassMeeting.lockedAt, staleProcessingBefore),
        ),
      ),
    );
    const [row] = await conn
      .update(academyClassMeeting)
      .set({
        status: "processing",
        lockedAt: now,
        attemptCount: sql`${academyClassMeeting.attemptCount} + 1`,
      })
      .where(and(eq(academyClassMeeting.id, id), eligible))
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
      status: "created" | "failed";
      externalEventId: string | null;
      meetingUrl: string | null;
      errorReason: string | null;
      nextRetryAt: Date;
    },
  ) {
    const [row] = await conn
      .update(academyClassMeeting)
      .set({ ...values, lockedAt: null })
      .where(
        and(
          eq(academyClassMeeting.id, id),
          eq(academyClassMeeting.status, "processing"),
        ),
      )
      .returning();
    return row ?? null;
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
