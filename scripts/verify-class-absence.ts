/* eslint-disable no-await-in-loop -- Live acceptance and cleanup must finish each fixture in order. */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parse } from "dotenv";

// Live Academy absence/replacement plus Google Calendar attendee acceptance.
// Run manually against the guarded localhost development database only.
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
  subjectCategory,
  academyClass,
  academyClassSession,
  academyClassMeeting,
  academyClassTutorAbsence,
  tutorInvite,
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
const fixtures: { id: string; sessionId: string }[] = [];
const afterStartFixtures: { id: string; sessionId: string }[] = [];
const temporaryTutors: { id: string; inviteId: string }[] = [];
const checks: unknown[] = [];
const result: Record<string, unknown> = {
  target: "localhost:6767/cogito-app",
  testedAt: new Date().toISOString(),
  checks,
};
mkdirSync("tmp/v3-only-dev", { recursive: true });
const evidence = "tmp/v3-only-dev/class-absence-live.json";
function record() {
  writeFileSync(
    evidence,
    JSON.stringify(
      { ...result, fixtures, afterStartFixtures, temporaryTutors },
      null,
      2,
    ),
  );
}

async function readGoogleEvent(eventId: string) {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_MEET_CLIENT_ID || env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_MEET_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET!,
      refresh_token: env.GOOGLE_MEET_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  assert.equal(tokenResponse.ok, true, "Google OAuth token refresh succeeded");
  const { access_token: accessToken } = (await tokenResponse.json()) as {
    access_token: string;
  };
  const calendar = encodeURIComponent(env.GOOGLE_CALENDAR_ID || "primary");
  const event = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendar}/events/${encodeURIComponent(eventId)}`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  assert.equal(event.ok, true, "Google Calendar event remains readable");
  return (await event.json()) as {
    id: string;
    status?: string;
    attendees?: { email: string; displayName?: string }[];
    start?: { dateTime?: string };
    end?: { dateTime?: string };
    hangoutLink?: string;
  };
}

try {
  const [database] = await db.execute(sql`select current_database() as name`);
  assert.equal(database?.name, "cogito-app");
  const [admin] = await db
    .select()
    .from(user)
    .where(eq(user.role, "admin"))
    .limit(1);
  const tutors = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(tutorProfile)
    .innerJoin(user, eq(user.id, tutorProfile.userId))
    .where(
      and(
        eq(user.role, "tutor"),
        eq(tutorProfile.onboardingStatus, "published"),
        inArray(tutorProfile.modality, ["online", "both"]),
      ),
    )
    .limit(1);
  const [competition] = await db
    .select({ id: subjectCategory.id })
    .from(subjectCategory)
    .where(eq(subjectCategory.isActive, true))
    .limit(1);
  assert.ok(
    admin && competition,
    "Seeded admin and active competition required",
  );
  if (tutors.length === 0)
    throw new Error("A seeded published online tutor is required");
  const id = crypto.randomUUID();
  const inviteId = crypto.randomUUID();
  const email = `codex-class-absence-${id}@example.invalid`;
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(user).values({
      id,
      name: "Temporary Calendar replacement tutor",
      email,
      role: "tutor",
    });
    await tx.insert(tutorInvite).values({
      id: inviteId,
      email,
      displayName: "Temporary Calendar replacement tutor",
      token: crypto.randomUUID(),
      status: "accepted",
      invitedBy: admin.id,
      acceptedBy: id,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      acceptedAt: now,
    });
    await tx.insert(tutorProfile).values({
      userId: id,
      inviteId,
      modality: "online",
      onboardingStatus: "published",
      publishedAt: now,
    });
  });
  temporaryTutors.push({ id, inviteId });
  tutors.push({ id, name: "Temporary Calendar replacement tutor", email });
  record();
  assert.ok(tutors.length >= 2, "Two published tutors required");
  assert.ok((await meeting.probe!()).ok, "Google Calendar connectivity probe");

  const startAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
  const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
  let published: Awaited<ReturnType<typeof service.publish>> | undefined;
  let selected: (typeof tutors)[number] | undefined;
  let replacement: (typeof tutors)[number] | undefined;
  let lastDraftError: unknown;
  for (const initial of tutors) {
    const alternate = tutors.find((candidate) => candidate.id !== initial.id);
    if (!alternate) continue;
    try {
      const draft = await service.saveDraft(admin.id, {
        kind: "masterclass",
        competitionId: competition.id,
        titleEn: `Temporary absence verification ${crypto.randomUUID()}`,
        descriptionEn:
          "Temporary acceptance fixture; removed after verification",
        tutorFeeIdr: 250000,
        masterclassRateMarks: 5,
        reason: "Verify same-time tutor replacement and Calendar attendee sync",
        sessions: [
          {
            capacity: 1,
            titleEn: "Temporary session",
            curriculumEn: "Live replacement verification",
            startAt,
            endAt,
            mode: "online",
            tutorId: initial.id,
          },
        ],
      });
      const sessionId = draft.sessions[0]!.id;
      fixtures.push({ id: draft.id, sessionId });
      record();
      published = await service.publish(admin.id, {
        id: draft.id,
        expectedVersion: draft.version,
        reason: "Verify live same-time replacement",
      });
      selected = initial;
      replacement = alternate;
      break;
    } catch (error) {
      lastDraftError = error;
    }
  }
  assert.ok(
    published && selected && replacement,
    `Could not publish a temporary session for two published tutors: ${String(lastDraftError)}`,
  );
  const fixture = fixtures.at(-1)!;
  const sessionId = fixture.sessionId;
  const sessionBefore = published.sessions.find(
    (session) => session.id === sessionId,
  )!;
  assert.equal(sessionBefore.tutorId, selected.id);
  assert.equal(sessionBefore.tutorFeeIdr, 250000);
  const [meetingBefore] = await db
    .select()
    .from(academyClassMeeting)
    .where(eq(academyClassMeeting.sessionId, sessionId));
  assert.ok(meetingBefore?.externalEventId && meetingBefore.meetingUrl);
  assert.equal(meetingBefore.status, "created");
  const originalEvent = await readGoogleEvent(meetingBefore.externalEventId);
  assert.equal(originalEvent.id, meetingBefore.externalEventId);
  assert.deepEqual(
    originalEvent.attendees?.map(({ email }) => email),
    [selected.email],
  );

  const absence = await service.reportTutorAbsence(selected.id, {
    sessionId,
    requestKey: crypto.randomUUID(),
    reason: "Temporary live replacement acceptance",
  });
  assert.equal(absence.late, true);
  const replaced = await service.replaceAbsentTutor(admin.id, {
    sessionId,
    expectedVersion: sessionBefore.version,
    replacementTutorId: replacement.id,
    reason: "Temporary live replacement acceptance",
  });
  const sessionAfter = replaced.sessions.find(
    (session) => session.id === sessionId,
  )!;
  assert.equal(sessionAfter.tutorId, replacement.id);
  assert.equal(sessionAfter.startAt.getTime(), sessionBefore.startAt.getTime());
  assert.equal(sessionAfter.endAt.getTime(), sessionBefore.endAt.getTime());
  assert.equal(sessionAfter.tutorFeeIdr, sessionBefore.tutorFeeIdr);
  const [meetingAfter] = await db
    .select()
    .from(academyClassMeeting)
    .where(eq(academyClassMeeting.sessionId, sessionId));
  assert.equal(meetingAfter?.externalEventId, meetingBefore.externalEventId);
  assert.equal(meetingAfter?.meetingUrl, meetingBefore.meetingUrl);
  assert.equal(meetingAfter?.status, "created");
  const replacedEvent = await readGoogleEvent(meetingBefore.externalEventId);
  assert.equal(replacedEvent.id, originalEvent.id);
  assert.deepEqual(
    replacedEvent.attendees?.map(({ email }) => email),
    [replacement.email],
  );
  assert.ok(
    !replacedEvent.attendees?.some(({ email }) => email === selected.email),
  );
  assert.equal(replacedEvent.start?.dateTime, originalEvent.start?.dateTime);
  assert.equal(replacedEvent.end?.dateTime, originalEvent.end?.dateTime);
  assert.equal(replacedEvent.hangoutLink, originalEvent.hangoutLink);

  await db
    .update(academyClassMeeting)
    .set({
      status: "pending",
      scheduleVersion: sessionAfter.version - 1,
      nextRetryAt: new Date(),
      lockedAt: null,
      errorReason: null,
    })
    .where(eq(academyClassMeeting.sessionId, sessionId));
  const replay = await service.processReadyMeetings(fixture.id);
  assert.equal(replay.processed, 1);
  const replayEvent = await readGoogleEvent(meetingBefore.externalEventId);
  assert.deepEqual(
    replayEvent.attendees?.map(({ email }) => email),
    [replacement.email],
  );

  const afterStartClassId = crypto.randomUUID();
  const afterStartSessionId = crypto.randomUUID();
  const afterStartAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const afterEndAt = new Date(Date.now() + 60 * 60 * 1000);
  await db.transaction(async (tx) => {
    await tx.insert(academyClass).values({
      id: afterStartClassId,
      kind: "masterclass",
      competitionId: competition.id,
      titleEn: `Temporary after-start absence ${crypto.randomUUID()}`,
      descriptionEn: "Temporary DB-only acceptance fixture",
      tutorFeeIdr: 250000,
      masterclassRateMarks: 5,
      state: "published",
      publishedAt: new Date(),
      createdBy: admin.id,
      updatedBy: admin.id,
    });
    await tx.insert(academyClassSession).values({
      id: afterStartSessionId,
      classId: afterStartClassId,
      sequenceNumber: 1,
      capacity: 1,
      titleEn: "Temporary already-started session",
      startAt: afterStartAt,
      endAt: afterEndAt,
      mode: "online",
      tutorId: selected.id,
      tutorFeeIdr: 250000,
      state: "scheduled",
    });
  });
  afterStartFixtures.push({
    id: afterStartClassId,
    sessionId: afterStartSessionId,
  });
  record();
  const afterStartAbsence = await service.reportTutorAbsence(selected.id, {
    sessionId: afterStartSessionId,
    requestKey: crypto.randomUUID(),
    reason: "Temporary after-start acceptance; session remains in progress",
  });
  assert.equal(afterStartAbsence.late, true);
  assert.ok(afterStartAbsence.reportedAt >= afterStartAt);
  assert.ok(afterStartAbsence.reportedAt < afterEndAt);
  assert.equal(
    (
      await db
        .select()
        .from(academyClassMeeting)
        .where(eq(academyClassMeeting.sessionId, afterStartSessionId))
    ).length,
    0,
  );
  checks.push({
    sameTimeTutorReplacement: true,
    sameFee: true,
    sameEventId: originalEvent.id,
    sameMeetLink: true,
    replacementAttendee: replacement.email,
    oldTutorRemoved: true,
    noDuplicateEventAfterReplay: replayEvent.id === originalEvent.id,
    afterStartAbsenceAcceptedWhileInProgress: true,
    sendUpdates: "none",
  });
  result.ok = true;
} catch (error) {
  result.ok = false;
  result.error = error instanceof Error ? error.message : "Verification failed";
} finally {
  const failures: string[] = [];
  for (const fixture of fixtures) {
    let providerClean = true;
    try {
      const [storedMeeting] = await db
        .select()
        .from(academyClassMeeting)
        .where(eq(academyClassMeeting.sessionId, fixture.sessionId));
      await meeting.cancelAcademyClassEvent!(
        storedMeeting?.externalEventId ?? null,
        fixture.sessionId,
        storedMeeting?.creationGeneration,
      );
    } catch {
      providerClean = false;
      failures.push(`Provider cleanup failed: ${fixture.sessionId}`);
    }
    if (!providerClean) continue;
    try {
      await db.transaction(async (tx) => {
        await tx
          .delete(academyClassTutorAbsence)
          .where(eq(academyClassTutorAbsence.sessionId, fixture.sessionId));
        await tx
          .delete(notification)
          .where(sql`${notification.metadata}->>'classId' = ${fixture.id}`);
        await tx
          .delete(auditLog)
          .where(
            and(
              inArray(auditLog.targetId, [fixture.id, fixture.sessionId]),
              inArray(auditLog.targetType, [
                "academy_class",
                "academy_class_session",
              ]),
            ),
          );
        await tx.delete(academyClass).where(eq(academyClass.id, fixture.id));
      });
      assert.equal(
        (
          await db
            .select()
            .from(academyClassSession)
            .where(eq(academyClassSession.id, fixture.sessionId))
        ).length,
        0,
      );
    } catch {
      failures.push(`Database cleanup failed: ${fixture.id}`);
    }
  }
  for (const fixture of afterStartFixtures) {
    try {
      await db.transaction(async (tx) => {
        await tx
          .delete(academyClassTutorAbsence)
          .where(eq(academyClassTutorAbsence.sessionId, fixture.sessionId));
        await tx
          .delete(auditLog)
          .where(
            and(
              inArray(auditLog.targetId, [fixture.id, fixture.sessionId]),
              inArray(auditLog.targetType, [
                "academy_class",
                "academy_class_session",
              ]),
            ),
          );
        await tx.delete(academyClass).where(eq(academyClass.id, fixture.id));
      });
    } catch {
      failures.push(`After-start fixture cleanup failed: ${fixture.id}`);
    }
  }
  for (const tutor of temporaryTutors) {
    try {
      await db.transaction(async (tx) => {
        await tx.delete(tutorInvite).where(eq(tutorInvite.id, tutor.inviteId));
        await tx.delete(user).where(eq(user.id, tutor.id));
      });
    } catch {
      failures.push(`Temporary tutor cleanup failed: ${tutor.id}`);
    }
  }
  result.cleanup = failures.length
    ? failures
    : "Google events deleted; temporary classes, sessions, meeting jobs, absence notices, notifications, audits and tutor identity fixtures removed; seeded identities preserved";
  if (failures.length) result.ok = false;
  record();
  console.log(JSON.stringify(result));
}
process.exit(result.ok ? 0 : 1);
