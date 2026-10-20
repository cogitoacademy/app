import { and, asc, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import {
  academyClass,
  academyClassSession,
  room,
  subjectCategory,
  tutorProfile,
  user,
} from "@cogito-app/db/schema";
import type { DbOrTx } from "../../lib/tx";
import type { listAcademyClassesInput } from "./academy-class.types";
import type { z } from "zod";

export type AcademyClassRepo = ReturnType<typeof createAcademyClassRepo>;

export function createAcademyClassRepo() {  async function list(
    conn: DbOrTx,
    input: z.infer<typeof listAcademyClassesInput>,
  ) {
    return conn.query.academyClass.findMany({
      where: input.state ? eq(academyClass.state, input.state) : undefined,
      with: {
        competition: { with: { parent: true } },
        sessions: {
          with: { tutor: true, room: true },
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
          with: { tutor: true, room: true },
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
    insertClass,
    updateClassVersioned,
    listSessionsForClass,
    deleteSessionsExcept,
    shiftSessionSequences,
    insertSessions,
    updateSession,
  };
}
