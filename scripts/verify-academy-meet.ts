/* eslint-disable no-await-in-loop -- Live acceptance and cleanup must finish each fixture in order. */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parse } from "dotenv";

// Live provider acceptance only. Never included in unit/normal CI runs.
const env = parse(readFileSync("apps/server/.env"));
const target = new URL(env.DATABASE_URL!);
assert.ok(
  ["localhost", "127.0.0.1"].includes(target.hostname) &&
    target.port === "6767" &&
    target.pathname === "/cogito-app" &&
    env.NODE_ENV === "development",
  "Expected localhost:6767/cogito-app development database",
);
assert.equal(env.GOOGLE_MEET_ENABLED, "true");
Object.assign(process.env, env, {
  GOOGLE_MEET_ENABLED: "false",
  PAYMENT_PROVIDER: "stub",
  RESEND_API_KEY: "",
});
const { db } = await import("../packages/db/src");
const { eq, and, sql, inArray } =
  await import("../packages/db/node_modules/drizzle-orm");
const {
  user,
  tutorProfile,
  tutorProfileSubject,
  subjectCategory,
  academyClass,
  academyClassSession,
  academyClassMeeting,
  auditLog,
  notification,
} = await import("../packages/db/src/schema");
const { services } = await import("../packages/api/src/services");
const { createAcademyClassService } =
  await import("../packages/api/src/modules/academy-class/academy-class.service");
const { createGoogleMeetingProvider } =
  await import("../packages/api/src/modules/meeting/google-meeting.provider");
const meeting = createGoogleMeetingProvider(
  {
    authType: "oauth_refresh_token",
    calendarId: env.GOOGLE_CALENDAR_ID || "primary",
    clientId: env.GOOGLE_MEET_CLIENT_ID || env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_MEET_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET,
    refreshToken: env.GOOGLE_MEET_REFRESH_TOKEN,
    sendUpdates: "none",
  },
  db,
);
const service = createAcademyClassService({
  db,
  audit: services.audit,
  notification: services.notification,
  meeting,
});
const fixtures: { id: string; sessionIds: string[] }[] = [];
const checks: unknown[] = [];
const result: Record<string, unknown> = {
  target: "localhost:6767/cogito-app",
  testedAt: new Date().toISOString(),
  checks,
};
mkdirSync("tmp/v3-only-dev", { recursive: true });
const evidence = "tmp/v3-only-dev/academy-meet-live.json";
function record() {
  writeFileSync(evidence, JSON.stringify({ ...result, fixtures }, null, 2));
}
try {
  const [database] = await db.execute(sql`select current_database() as name`);
  assert.equal(database?.name, "cogito-app");
  assert.equal((await meeting.probe!()).ok, true);
  const [admin] = await db
    .select()
    .from(user)
    .where(eq(user.role, "admin"))
    .limit(1);
  const [assignment] = await db
    .select({ tutorId: tutorProfile.userId, competitionId: subjectCategory.id })
    .from(tutorProfile)
    .innerJoin(
      tutorProfileSubject,
      eq(tutorProfileSubject.tutorProfileId, tutorProfile.id),
    )
    .innerJoin(
      subjectCategory,
      eq(subjectCategory.id, tutorProfileSubject.subjectId),
    )
    .where(
      and(
        eq(tutorProfile.onboardingStatus, "published"),
        eq(subjectCategory.isActive, true),
      ),
    )
    .limit(1);
  assert.ok(
    admin && assignment,
    "Seeded admin and published tutor assignment required",
  );
  for (const [index, kind] of (["masterclass", "cohort"] as const).entries()) {
    const startAt = new Date(Date.now() + (14 + index) * 86400000);
    const common = {
      competitionId: assignment.competitionId,
      titleEn: `Temporary live Meet verification ${crypto.randomUUID()}`,
      descriptionEn: "Temporary acceptance fixture; removed after verification",
      tutorFeeIdr: kind === "masterclass" ? 250000 : 500000,
      reason: "Verify custom class fee and live Google Meet",
      sessions: [
        {
          capacity: 1,
          titleEn: "Temporary session",
          curriculumEn: "Integration verification",
          startAt,
          endAt: new Date(startAt.getTime() + 1800000),
          mode: "online" as const,
          tutorId: assignment.tutorId,
        },
      ],
    };
    const input =
      kind === "masterclass"
        ? { ...common, kind, masterclassRateMarks: 5 }
        : {
            ...common,
            kind,
            fullRateMarks: 20,
            halfRateMarks: 22,
            singleRateMarks: 25,
            minimumEnrollment: 1,
            minimumCheckAt: new Date(startAt.getTime() - 86400000),
          };
    const draft = await service.saveDraft(admin.id, input);
    fixtures.push({
      id: draft.id,
      sessionIds: draft.sessions.map((s) => s.id),
    });
    record();
    await assert.rejects(() =>
      service.publish(admin.id, {
        id: draft.id,
        expectedVersion: draft.version + 1,
        reason: "Verify stale publish rejection",
      }),
    );
    assert.equal((await service.get(draft.id)).state, "draft");
    const published = await service.publish(admin.id, {
      id: draft.id,
      expectedVersion: draft.version,
      reason: "Verify live publish with agreed custom fee",
    });
    assert.equal(published.state, "published");
    assert.equal(published.tutorFeeIdr, common.tutorFeeIdr);
    assert.ok(
      published.sessions.every((s) => s.tutorFeeIdr === common.tutorFeeIdr),
    );
    const meetings = await db
      .select()
      .from(academyClassMeeting)
      .where(
        inArray(academyClassMeeting.sessionId, fixtures.at(-1)!.sessionIds),
      );
    assert.equal(meetings.length, 1);
    assert.equal(meetings[0]!.status, "created");
    assert.match(meetings[0]!.meetingUrl!, /^https:\/\/meet\.google\.com\//);
    const replay = await service.processReadyMeetings(draft.id);
    assert.equal(replay.processed, 0);
    const [after] = await db
      .select()
      .from(academyClassMeeting)
      .where(eq(academyClassMeeting.id, meetings[0]!.id));
    assert.equal(after!.externalEventId, meetings[0]!.externalEventId);
    await assert.rejects(() =>
      service.saveDraft(admin.id, {
        ...input,
        id: published.id,
        expectedVersion: published.version,
        tutorFeeIdr: 100000,
        reason: "Verify published fee cannot change",
      }),
    );
    checks.push({
      kind,
      customFeeIdr: common.tutorFeeIdr,
      state: published.state,
      meetingStatus: after!.status,
      meetingUrl: after!.meetingUrl,
      stalePublishRejected: true,
      publishedEditRejected: true,
      replayProcessed: replay.processed,
    });
    record();
  }
  result.ok = true;
} catch (error) {
  result.ok = false;
  result.error = error instanceof Error ? error.message : "Verification failed";
} finally {
  const failures: string[] = [];
  for (const fixture of fixtures) {
    let providerClean = true;
    for (const sessionId of fixture.sessionIds) {
      try {
        await meeting.cancelAcademyClassEvent!(null, sessionId);
      } catch {
        providerClean = false;
        failures.push(`Provider cleanup failed: ${sessionId}`);
      }
    }
    // Keep identities for retry when provider cleanup fails.
    if (!providerClean) continue;
    try {
      await db.transaction(async (tx) => {
        await tx
          .delete(notification)
          .where(sql`${notification.metadata}->>'classId' = ${fixture.id}`);
        await tx
          .delete(auditLog)
          .where(
            and(
              eq(auditLog.targetType, "academy_class"),
              eq(auditLog.targetId, fixture.id),
            ),
          );
        await tx.delete(academyClass).where(eq(academyClass.id, fixture.id));
      });
      assert.equal(
        (
          await db
            .select()
            .from(academyClassSession)
            .where(eq(academyClassSession.classId, fixture.id))
        ).length,
        0,
      );
    } catch {
      failures.push(`Database cleanup failed: ${fixture.id}`);
    }
  }
  result.cleanup = failures.length
    ? failures
    : "Google events deleted; temporary classes, sessions, meeting jobs, notifications and audits removed";
  if (failures.length) result.ok = false;
  record();
  console.log(JSON.stringify(result));
}
process.exit(result.ok ? 0 : 1);
