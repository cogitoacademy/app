import { expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { db } from "@cogito-app/db";
import * as s from "@cogito-app/db/schema";
import { createAcademyClassService } from "../../modules/academy-class/academy-class.service";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
const isolatedTest =
  process.env.NODE_ENV === "test" &&
  url.port === "6769" &&
  url.pathname === "/cogito-test";
const approvedDev =
  process.env.ACADEMY_CLASS_ABSENCE_DEV_ACCEPTANCE === "true" &&
  process.env.NODE_ENV === "development" &&
  url.port === "6767" &&
  url.pathname === "/cogito-app";
if (
  (!isolatedTest && !approvedDev) ||
  !["postgres:", "postgresql:"].includes(url.protocol) ||
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  url.search ||
  url.hash ||
  process.env.TEST_DATABASE_ALLOW_RESET !== undefined ||
  process.env.TEST_DATABASE_RESET_TARGET !== undefined
)
  throw new Error(
    "Academy absence requires isolated test 6769/cogito-test or explicit dev acceptance; resets are forbidden",
  );
test("absence notices and same-time replacement preserve assignment history and earned ownership", async () => {
  const rollback = new Error("ROLLBACK_ABSENCE_FIXTURES");
  const tag = crypto.randomUUID();
  let createdUserIds: string[] = [];
  let fixtureClassId = "";
  let checked = false;
  try {
    await db.transaction(async (tx) => {
      const adminId = crypto.randomUUID();
      const tutorIds = [crypto.randomUUID(), crypto.randomUUID()];
      createdUserIds = [adminId, ...tutorIds];
      await tx.insert(s.user).values([
        {
          id: adminId,
          name: "Absence test admin",
          email: `absence-admin-${tag}@example.invalid`,
          role: "admin",
        },
        ...tutorIds.map((id, index) => ({
          id,
          name: `Absence tutor ${index + 1}`,
          email: `absence-tutor-${index}-${tag}@example.invalid`,
          role: "tutor",
        })),
      ]);
      const invites = await tx
        .insert(s.tutorInvite)
        .values(
          tutorIds.map((id, index) => ({
            email: `absence-tutor-${index}-${tag}@example.invalid`,
            displayName: `Absence tutor ${index + 1}`,
            token: crypto.randomUUID(),
            status: "accepted",
            invitedBy: adminId,
            acceptedBy: id,
            expiresAt: new Date("2091-01-01T00:00:00.000Z"),
            acceptedAt: new Date(),
          })),
        )
        .returning();
      await tx.insert(s.tutorProfile).values(
        tutorIds.map((id, index) => ({
          userId: id,
          inviteId: invites[index]!.id,
          modality: "online",
          onboardingStatus: "published",
          publishedAt: new Date(),
        })),
      );
      const [competition] = await tx
        .insert(s.subjectCategory)
        .values({
          slug: `absence-${tag}`,
          name: "Absence acceptance",
          isActive: true,
          lightTextColor: "oklch(0.1 0 0)",
          lightBackgroundColor: "oklch(0.9 0 0)",
          darkTextColor: "oklch(0.9 0 0)",
          darkBackgroundColor: "oklch(0.1 0 0)",
        })
        .returning({ id: s.subjectCategory.id });
      if (!competition)
        throw new Error("Acceptance competition fixture was not created");
      const classId = crypto.randomUUID();
      fixtureClassId = classId;
      const sessionId = crypto.randomUUID();
      const future = new Date("2090-11-01T12:00:00.000Z");
      const end = new Date(future.getTime() + 60 * 60 * 1000);
      await tx.insert(s.academyClass).values({
        id: classId,
        kind: "masterclass",
        competitionId: competition.id,
        titleEn: `Absence acceptance ${tag}`,
        descriptionEn: "Scoped rollback fixture",
        masterclassRateMarks: 5,
        tutorFeeIdr: 300_000,
        state: "published",
      });
      await tx.insert(s.academyClassSession).values({
        id: sessionId,
        classId,
        sequenceNumber: 1,
        capacity: 1,
        titleEn: "Test session",
        startAt: future,
        endAt: end,
        mode: "online",
        roomId: null,
        tutorId: tutorIds[0]!,
        tutorFeeIdr: 300_000,
        state: "scheduled",
      });
      await tx.insert(s.academyClassMeeting).values({
        sessionId,
        provider: "google_meet",
        externalEventId: `test-${tag}`,
        meetingUrl: "https://meet.example.invalid",
        status: "created",
        scheduleVersion: 1,
      });
      const feeSessionId = crypto.randomUUID();
      await tx.insert(s.academyClassSession).values({
        id: feeSessionId,
        classId,
        sequenceNumber: 2,
        capacity: 1,
        titleEn: "Earned fee guard",
        startAt: future,
        endAt: end,
        mode: "online",
        roomId: null,
        tutorId: tutorIds[0]!,
        tutorFeeIdr: 300_000,
        state: "scheduled",
      });
      await tx.insert(s.tutorSessionFee).values({
        academyClassSessionId: feeSessionId,
        tutorId: tutorIds[0]!,
        scheduledStartAt: future,
        earnedAt: future,
        eventKey: `absence-fee-${tag}`,
        grossHonorariumIdr: 300_000,
      });
      const audits: unknown[] = [];
      const notifications: unknown[] = [];
      const attendees: unknown[] = [];
      const service = createAcademyClassService({
        db: tx as unknown as typeof db,
        audit: {
          record: async (record) => {
            audits.push(record);
          },
        },
        notification: {
          write: async (record) => {
            notifications.push(record);
          },
        },
        meeting: {
          updateAcademyClassEvent: async (
            _eventId,
            _sessionId,
            startAt,
            endAt,
            attendee,
          ) => {
            attendees.push({ startAt, endAt, attendee });
          },
        },
      });
      await expect(
        service.replaceAbsentTutor(adminId, {
          sessionId: feeSessionId,
          expectedVersion: 1,
          replacementTutorId: tutorIds[1]!,
          reason: "Must not rewrite earned ownership",
        }),
      ).rejects.toThrow("report or earned tutor fee");
      const requestKey = crypto.randomUUID();
      const noticeInput = {
        sessionId,
        requestKey,
        reason: "Unexpected illness",
      };
      await expect(
        service.reportTutorAbsence(tutorIds[1]!, noticeInput),
      ).rejects.toThrow("Class not found");
      const noticeA = await service.reportTutorAbsence(
        tutorIds[0]!,
        noticeInput,
      );
      expect(
        await service.reportTutorAbsence(tutorIds[0]!, noticeInput),
      ).toEqual(noticeA);
      await expect(
        service.reportTutorAbsence(tutorIds[0]!, {
          ...noticeInput,
          reason: "Different reason",
        }),
      ).rejects.toThrow();
      await expect(
        service.replaceAbsentTutor(adminId, {
          sessionId,
          expectedVersion: 99,
          replacementTutorId: tutorIds[1]!,
          reason: "Stale replacement",
        }),
      ).rejects.toThrow();
      await service.replaceAbsentTutor(adminId, {
        sessionId,
        expectedVersion: 1,
        replacementTutorId: tutorIds[1]!,
        reason: "Approved replacement",
      });
      const noticeB = await service.reportTutorAbsence(tutorIds[1]!, {
        sessionId,
        requestKey: crypto.randomUUID(),
        reason: "Replacement tutor illness",
      });
      expect(noticeB.assignmentVersion).toBe(2);
      await service.replaceAbsentTutor(adminId, {
        sessionId,
        expectedVersion: 2,
        replacementTutorId: tutorIds[0]!,
        reason: "Second replacement",
      });
      const noticeA2 = await service.reportTutorAbsence(tutorIds[0]!, {
        sessionId,
        requestKey: crypto.randomUUID(),
        reason: "Returned tutor illness",
      });
      expect(noticeA2.assignmentVersion).toBe(3);
      await service.replaceAbsentTutor(adminId, {
        sessionId,
        expectedVersion: 3,
        replacementTutorId: tutorIds[1]!,
        reason: "Third assignment",
      });
      const [session] = await tx
        .select()
        .from(s.academyClassSession)
        .where(eq(s.academyClassSession.id, sessionId));
      const history = await tx
        .select()
        .from(s.academyClassTutorAbsence)
        .where(eq(s.academyClassTutorAbsence.sessionId, sessionId));
      expect(session?.tutorId).toBe(tutorIds[1]!);
      expect(session?.version).toBe(4);
      expect(session?.startAt).toEqual(future);
      expect(session?.tutorFeeIdr).toBe(300_000);
      expect(history.map((item) => item.assignmentVersion)).toEqual([1, 2, 3]);
      expect(attendees.length).toBe(3);
      expect(audits).toHaveLength(6);
      expect(notifications.length).toBeGreaterThanOrEqual(6);
      checked = true;
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  expect(checked).toBe(true);
  expect(
    await db
      .select({ id: s.user.id })
      .from(s.user)
      .where(inArray(s.user.id, createdUserIds)),
  ).toEqual([]);
  expect(
    await db
      .select({ id: s.academyClass.id })
      .from(s.academyClass)
      .where(eq(s.academyClass.id, fixtureClassId)),
  ).toEqual([]);
});
