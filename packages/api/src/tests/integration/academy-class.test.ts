import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  academyClass,
  academyClassMeeting,
  academyClassSession,
  auditLog,
  notification,
  room,
  subjectCategory,
  tutorInvite,
  tutorProfile,
  user,
} from "@cogito-app/db/schema";
import {
  createTestClient,
  createTestContext,
  resetDatabase,
  setUserRole,
  signUpAndSignIn,
} from "../helpers/test-client";

describe("academy class drafts and published reads", () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let adminClient: ReturnType<typeof createTestClient>;
  let adminId = "";
  let tutorId = "";
  let competitionId = "";
  let roomId = "";

  beforeAll(async () => {
    await resetDatabase();

    const adminAuth = await signUpAndSignIn(
      `class-admin-${suffix}@example.com`,
      "TestPassword123!",
      "Class Admin",
    );
    const admin = await db.query.user.findFirst({
      where: eq(user.email, `class-admin-${suffix}@example.com`),
    });
    if (!admin) throw new Error("Admin fixture was not created");
    adminId = admin.id;
    await setUserRole(adminId, "admin");
    adminClient = createTestClient(await createTestContext(adminAuth.cookie));

    await signUpAndSignIn(
      `class-tutor-${suffix}@example.com`,
      "TestPassword123!",
      "Class Tutor",
    );
    const tutor = await db.query.user.findFirst({
      where: eq(user.email, `class-tutor-${suffix}@example.com`),
    });
    if (!tutor) throw new Error("Tutor fixture was not created");
    tutorId = tutor.id;
    await setUserRole(tutorId, "tutor");
    const [invite] = await db
      .insert(tutorInvite)
      .values({
        email: tutor.email,
        displayName: tutor.name,
        token: `academy-class-${suffix}`,
        status: "accepted",
        invitedBy: adminId,
        acceptedBy: tutorId,
        expiresAt: new Date("2036-01-01T00:00:00.000Z"),
        acceptedAt: new Date("2034-01-01T00:00:00.000Z"),
      })
      .returning();
    if (!invite) throw new Error("Tutor invite fixture was not created");
    await db.insert(tutorProfile).values({
      userId: tutorId,
      inviteId: invite.id,
      onboardingStatus: "published",
      modality: "both",
      onlineMaxClassSize: 6,
      offlineMaxClassSize: 6,
    });

    const competition = await db.query.subjectCategory.findFirst({
      where: eq(subjectCategory.isActive, true),
    });
    if (!competition)
      throw new Error("Active competition fixture was not found");
    competitionId = competition.id;

    const [managedRoom] = await db
      .insert(room)
      .values({ name: "Test room", location: "Jakarta", capacity: 5 })
      .returning();
    if (!managedRoom) throw new Error("Room fixture was not created");
    roomId = managedRoom.id;
  });

  test("creates and edits auditable multi-mode cohort drafts without changing session IDs", async () => {
    const input = {
      kind: "cohort" as const,
      competitionId,
      titleEn: "Debate Foundations",
      titleId: "Dasar Debat",
      descriptionEn: "A guided cohort for debate fundamentals.",
      descriptionId: "Kelas kelompok untuk dasar debat.",
      tutorFeeIdr: 400_000,
      minimumEnrollment: 2,
      minimumCheckAt: "2034-12-01T00:00:00.000Z",
      fullRateMarks: 20,
      halfRateMarks: 22,
      singleRateMarks: 25,
      reason: "Create class draft for integration test",
      sessions: [
        {
          capacity: 5,
          titleEn: "Case construction",
          titleId: "Menyusun kasus",
          curriculumEn: "Build claims, reasoning, and evidence.",
          curriculumId: "Menyusun klaim dan bukti.",
          startAt: "2035-01-05T10:00:00.000Z",
          endAt: "2035-01-05T11:00:00.000Z",
          mode: "online" as const,
          roomId: null,
          tutorId,
        },
        {
          capacity: 5,
          titleEn: "Rebuttal practice",
          titleId: "Latihan sanggahan",
          curriculumEn: "Practice clear and responsive rebuttals.",
          curriculumId: "Berlatih menyampaikan sanggahan.",
          startAt: "2035-01-12T10:00:00.000Z",
          endAt: "2035-01-12T11:00:00.000Z",
          mode: "in_person" as const,
          roomId,
          tutorId,
        },
      ],
    };

    const created = await adminClient.admin.saveAcademyClassDraft(input);
    expect(created.state).toBe("draft");
    expect(created.kind).toBe("cohort");
    expect(created.sessions).toHaveLength(2);
    expect(created.sessions.map((session) => session.tutorFeeIdr)).toEqual([
      400_000, 400_000,
    ]);
    expect(created.sessions.map((session) => session.mode)).toEqual([
      "online",
      "in_person",
    ]);
    const sessionIds = created.sessions.map((session) => session.id);

    const updated = await adminClient.admin.saveAcademyClassDraft({
      ...input,
      id: created.id,
      expectedVersion: created.version,
      reason: "Reorder draft sessions after schedule review",
      sessions: created.sessions.toReversed().map((session) => ({
        id: session.id,
        capacity: session.capacity,
        titleEn: session.titleEn,
        titleId: session.titleId,
        curriculumEn: session.curriculumEn,
        curriculumId: session.curriculumId,
        startAt: session.startAt.toISOString(),
        endAt: session.endAt.toISOString(),
        mode: session.mode as "online" | "in_person",
        roomId: session.roomId,
        tutorId: session.tutorId,
      })),
    });

    expect(updated.version).toBe(created.version + 1);
    expect(updated.sessions.map((session) => session.id)).toEqual([
      sessionIds[1],
      sessionIds[0],
    ]);
    expect(updated.sessions.map((session) => session.sequenceNumber)).toEqual([
      1, 2,
    ]);

    const audits = await db.query.auditLog.findMany({
      where: eq(auditLog.targetId, created.id),
    });
    expect(audits.map((entry) => entry.action)).toEqual(
      expect.arrayContaining([
        "academy_class.draft_created",
        "academy_class.draft_updated",
      ]),
    );
    expect(
      audits.find((entry) => entry.action === "academy_class.draft_updated")
        ?.details,
    ).toMatchObject({
      reason: "Reorder draft sessions after schedule review",
    });

    await expect(
      adminClient.admin.saveAcademyClassDraft({
        ...input,
        id: created.id,
        expectedVersion: created.version,
      }),
    ).rejects.toThrow("changed in another admin session");
  });

  test("rejects session capacity above an active room's capacity", async () => {
    const before = await db.select().from(academyClass);
    const input = {
      kind: "masterclass" as const,
      competitionId,
      titleEn: "Practice Masterclass",
      descriptionEn: "A single-session practice class.",
      tutorFeeIdr: 300_000,
      masterclassRateMarks: 5,
      reason: "Validate in-person capacity before draft save",
      sessions: [
        {
          capacity: 6,
          titleEn: "Final round strategy",
          startAt: "2035-02-01T10:00:00.000Z",
          endAt: "2035-02-01T11:00:00.000Z",
          mode: "in_person" as const,
          roomId,
          tutorId,
        },
      ],
    };

    await expect(
      adminClient.admin.saveAcademyClassDraft(input),
    ).rejects.toThrow("exceeds the selected room's capacity");
    const after = await db.select().from(academyClass);
    expect(after).toHaveLength(before.length);
  });

  test("rejects overlapping cohort sessions without creating a draft", async () => {
    const before = await db.select().from(academyClass);
    const input = {
      kind: "cohort" as const,
      competitionId,
      titleEn: "Overlapping cohort",
      descriptionEn: "A draft with an invalid schedule.",
      tutorFeeIdr: 400_000,
      minimumEnrollment: 1,
      minimumCheckAt: "2035-02-01T00:00:00.000Z",
      fullRateMarks: 20,
      halfRateMarks: 22,
      singleRateMarks: 25,
      reason: "Validate cohort schedule before saving",
      sessions: [
        {
          capacity: 4,
          titleEn: "First session",
          curriculumEn: "First topic.",
          startAt: "2035-03-01T10:00:00.000Z",
          endAt: "2035-03-01T11:00:00.000Z",
          mode: "online" as const,
          tutorId,
        },
        {
          capacity: 4,
          titleEn: "Second session",
          curriculumEn: "Second topic.",
          startAt: "2035-03-01T10:30:00.000Z",
          endAt: "2035-03-01T11:30:00.000Z",
          mode: "online" as const,
          tutorId,
        },
      ],
    };

    await expect(
      adminClient.admin.saveAcademyClassDraft(input),
    ).rejects.toThrow("Sessions in one class cannot overlap");
    const after = await db.select().from(academyClass);
    expect(after).toHaveLength(before.length);
  });

  test("rejects a tutor who does not support the session mode", async () => {
    const before = await db.select().from(academyClass);
    await db
      .update(tutorProfile)
      .set({ modality: "online" })
      .where(eq(tutorProfile.userId, tutorId));

    try {
      await expect(
        adminClient.admin.saveAcademyClassDraft({
          kind: "masterclass",
          competitionId,
          titleEn: "In-person Masterclass",
          descriptionEn: "A single in-person session.",
          tutorFeeIdr: 300_000,
          masterclassRateMarks: 5,
          reason: "Validate tutor delivery mode",
          sessions: [
            {
              capacity: 1,
              titleEn: "Practice",
              startAt: "2035-04-01T10:00:00.000Z",
              endAt: "2035-04-01T11:00:00.000Z",
              mode: "in_person",
              roomId,
              tutorId,
            },
          ],
        }),
      ).rejects.toThrow("does not support this session mode");
      const after = await db.select().from(academyClass);
      expect(after).toHaveLength(before.length);
    } finally {
      await db
        .update(tutorProfile)
        .set({ modality: "both" })
        .where(eq(tutorProfile.userId, tutorId));
    }
  });

  test("publishes both modes once and exposes only the public class DTO", async () => {
    const startAt = new Date("2036-01-05T10:00:00.000Z");
    const input = {
      kind: "cohort" as const,
      competitionId,
      titleEn: `Published cohort ${suffix}`,
      descriptionEn: "Integration fixture for public class reads.",
      tutorFeeIdr: 400_000,
      minimumEnrollment: 2,
      minimumCheckAt: new Date("2035-12-01T00:00:00.000Z"),
      fullRateMarks: 20,
      halfRateMarks: 22,
      singleRateMarks: 25,
      reason: "Exercise class publication",
      sessions: [
        {
          capacity: 4,
          titleEn: "Online session",
          curriculumEn: "Online curriculum fixture.",
          startAt,
          endAt: new Date(startAt.getTime() + 60 * 60 * 1000),
          mode: "online" as const,
          roomId: null,
          tutorId,
        },
        {
          capacity: 4,
          titleEn: "In-person session",
          curriculumEn: "In-person curriculum fixture.",
          startAt: new Date(startAt.getTime() + 7 * 24 * 60 * 60 * 1000),
          endAt: new Date(
            startAt.getTime() + 7 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000,
          ),
          mode: "in_person" as const,
          roomId,
          tutorId,
        },
      ],
    };
    const draft = await adminClient.admin.saveAcademyClassDraft(input);
    const anonymousClient = createTestClient(await createTestContext());

    expect(draft.state).toBe("draft");
    expect(
      (await anonymousClient.classes.list()).some(
        (record) => record.id === draft.id,
      ),
    ).toBe(false);
    await expect(anonymousClient.classes.get({ id: draft.id })).rejects.toThrow(
      "Class not found",
    );

    const publishInput = {
      id: draft.id,
      expectedVersion: draft.version,
      reason: "Publish approved cohort fixture",
    };
    const outcomes = await Promise.allSettled([
      adminClient.admin.publishAcademyClass(publishInput),
      adminClient.admin.publishAcademyClass(publishInput),
    ]);
    expect(
      outcomes.filter((outcome) => outcome.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      outcomes.filter((outcome) => outcome.status === "rejected"),
    ).toHaveLength(1);

    const published = await adminClient.admin.getAcademyClass({ id: draft.id });
    expect(published.state).toBe("published");
    expect(published.sessions.map((session) => session.tutorFeeIdr)).toEqual([
      400_000, 400_000,
    ]);
    const meetingRows = await db
      .select({ meeting: academyClassMeeting, session: academyClassSession })
      .from(academyClassMeeting)
      .innerJoin(
        academyClassSession,
        eq(academyClassMeeting.sessionId, academyClassSession.id),
      )
      .where(eq(academyClassSession.classId, draft.id));
    expect(meetingRows).toHaveLength(1);
    expect(meetingRows[0]?.meeting.status).toBe("created");

    const tutorNotifications = await db
      .select()
      .from(notification)
      .where(
        eq(
          notification.eventKey,
          `academy_class_published:${draft.id}:tutor:${tutorId}`,
        ),
      );
    expect(tutorNotifications).toHaveLength(1);
    const publishAudits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.targetId, draft.id));
    expect(
      publishAudits.filter(
        (entry) => entry.action === "academy_class.published",
      ),
    ).toHaveLength(1);

    const publicRecord = await anonymousClient.classes.get({ id: draft.id });
    expect(publicRecord.state).toBe("published");
    expect(publicRecord.sessions.map((session) => session.mode)).toEqual([
      "online",
      "in_person",
    ]);
    expect("tutorFeeIdr" in publicRecord).toBe(false);
    for (const session of publicRecord.sessions) {
      expect(Object.keys(session)).not.toContain("tutorId");
      expect(Object.keys(session)).not.toContain("roomId");
      expect(Object.keys(session)).not.toContain("meeting");
      expect(Object.keys(session.tutor ?? {})).toEqual(["name"]);
    }
  });

  test("rejects an outdated publish version and a non-approved tutor fee", async () => {
    const startAt = new Date("2036-03-01T10:00:00.000Z");
    const input = {
      kind: "masterclass" as const,
      competitionId,
      titleEn: `Versioned masterclass ${suffix}`,
      descriptionEn: "Integration fixture for publish version checks.",
      tutorFeeIdr: 300_000,
      masterclassRateMarks: 5,
      reason: "Create masterclass for publish version test",
      sessions: [
        {
          capacity: 4,
          titleEn: "Masterclass session",
          startAt,
          endAt: new Date(startAt.getTime() + 60 * 60 * 1000),
          mode: "online" as const,
          roomId: null,
          tutorId,
        },
      ],
    };
    const draft = await adminClient.admin.saveAcademyClassDraft(input);
    const updated = await adminClient.admin.saveAcademyClassDraft({
      ...input,
      id: draft.id,
      expectedVersion: draft.version,
      descriptionEn: "Updated after another admin reviewed the draft.",
      reason: "Update masterclass before publish",
    });

    await expect(
      adminClient.admin.publishAcademyClass({
        id: draft.id,
        expectedVersion: draft.version,
        reason: "Attempt stale publish",
      }),
    ).rejects.toThrow("changed in another admin session");
    expect(
      (await adminClient.admin.getAcademyClass({ id: draft.id })).state,
    ).toBe("draft");
    expect(updated.version).toBe(draft.version + 1);

    const wrongFee = await adminClient.admin.saveAcademyClassDraft({
      ...input,
      titleEn: `Wrong-fee masterclass ${suffix}`,
      tutorFeeIdr: 250_000,
      reason: "Create draft with non-approved fee",
    });
    await expect(
      adminClient.admin.publishAcademyClass({
        id: wrongFee.id,
        expectedVersion: wrongFee.version,
        reason: "Reject non-approved tutor fee",
      }),
    ).rejects.toThrow(
      "approved masterclass tutor fee is Rp300,000 per session",
    );
    expect(
      (await adminClient.admin.getAcademyClass({ id: wrongFee.id })).state,
    ).toBe("draft");
  });
});
