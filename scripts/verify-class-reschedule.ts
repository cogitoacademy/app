/* eslint-disable no-await-in-loop -- Live acceptance and cleanup must finish each fixture in order. */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parse } from "dotenv";

// Live Google Calendar acceptance only; never included in CI.
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
  booking,
  tutorProfile,
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
const fixtures: { id: string; sessionId: string }[] = [];
let bookingSnapshotBefore: string | undefined;
const checks: unknown[] = [];
const result: Record<string, unknown> = {
  target: "localhost:6767/cogito-app",
  testedAt: new Date().toISOString(),
  checks,
};
mkdirSync("tmp/v3-only-dev", { recursive: true });
const evidence = "tmp/v3-only-dev/class-reschedule-live.json";
function record() {
  writeFileSync(evidence, JSON.stringify({ ...result, fixtures }, null, 2));
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

function assertEventTimes(
  event: Awaited<ReturnType<typeof readGoogleEvent>>,
  startAt: Date,
  endAt: Date,
) {
  assert.equal(
    new Date(event.start?.dateTime ?? "").getTime(),
    startAt.getTime(),
  );
  assert.equal(new Date(event.end?.dateTime ?? "").getTime(), endAt.getTime());
}

try {
  const [database] = await db.execute(sql`select current_database() as name`);
  assert.equal(database?.name, "cogito-app");
  const bookingRows = await db.select().from(booking);
  bookingSnapshotBefore = JSON.stringify(
    bookingRows.toSorted((left, right) => left.id.localeCompare(right.id)),
  );
  result.bookingCount = bookingRows.length;
  assert.equal((await meeting.probe!()).ok, true);
  const [admin] = await db
    .select()
    .from(user)
    .where(eq(user.role, "admin"))
    .limit(1);
  const [assignment] = await db
    .select({ id: user.id, email: user.email })
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
  assert.ok(admin && assignment && competition);

  const minuteAlignedNow = Math.floor(Date.now() / 60000) * 60000;
  const originalStartAt = new Date(minuteAlignedNow + 14 * 86400000);
  const originalEndAt = new Date(originalStartAt.getTime() + 60 * 60 * 1000);
  const draft = await service.saveDraft(admin.id, {
    kind: "masterclass",
    competitionId: competition.id,
    titleEn: `Temporary reschedule verification ${crypto.randomUUID()}`,
    descriptionEn: "Temporary acceptance fixture; removed after verification",
    tutorFeeIdr: 250000,
    masterclassRateMarks: 5,
    reason: "Verify live Google Calendar session reschedule",
    sessions: [
      {
        capacity: 1,
        titleEn: "Temporary session",
        curriculumEn: "Live reschedule verification",
        startAt: originalStartAt,
        endAt: originalEndAt,
        mode: "online",
        tutorId: assignment.id,
      },
    ],
  });
  const sessionId = draft.sessions[0]!.id;
  fixtures.push({ id: draft.id, sessionId });
  record();
  const published = await service.publish(admin.id, {
    id: draft.id,
    expectedVersion: draft.version,
    reason: "Verify live same-event reschedule",
  });
  const before = published.sessions.find(
    (session) => session.id === sessionId,
  )!;
  assert.equal(before.state, "scheduled");
  assert.equal(before.mode, "online");
  assert.equal(before.tutorId, assignment.id);
  assert.equal(before.tutorFeeIdr, 250000);
  const [meetingBefore] = await db
    .select()
    .from(academyClassMeeting)
    .where(eq(academyClassMeeting.sessionId, sessionId));
  assert.ok(meetingBefore?.externalEventId && meetingBefore.meetingUrl);
  assert.equal(meetingBefore.status, "created");
  assert.match(meetingBefore.meetingUrl, /^https:\/\/meet\.google\.com\//);
  const originalEvent = await readGoogleEvent(meetingBefore.externalEventId);
  assert.equal(originalEvent.status, "confirmed");
  assert.deepEqual(
    originalEvent.attendees?.map(({ email }) => email),
    [assignment.email],
  );
  assertEventTimes(originalEvent, before.startAt, before.endAt);

  const startAt = new Date(minuteAlignedNow + 16 * 86400000);
  const endAt = new Date(startAt.getTime() + 75 * 60 * 1000);
  const changed = await service.rescheduleSession(admin.id, {
    sessionId,
    expectedVersion: before.version,
    startAt,
    endAt,
    reason: "Verify durable live Google Calendar reschedule",
  });
  const after = changed.sessions.find((session) => session.id === sessionId)!;
  assert.equal(after.version, before.version + 1);
  assert.equal(after.startAt.getTime(), startAt.getTime());
  assert.equal(after.endAt.getTime(), endAt.getTime());
  assert.equal(after.mode, before.mode);
  assert.equal(after.roomId, before.roomId);
  assert.equal(after.tutorId, before.tutorId);
  assert.equal(after.tutorFeeIdr, before.tutorFeeIdr);
  assert.equal(after.scheduleChangeVersion, after.version);
  assert.ok(after.scheduleChangeNotifiedAt instanceof Date);
  assert.ok(after.scheduleChangeExitUntil instanceof Date);
  assert.equal(
    after.scheduleChangeExitUntil.getTime(),
    Math.min(
      after.scheduleChangeNotifiedAt.getTime() + 24 * 60 * 60 * 1000,
      startAt.getTime(),
    ),
  );
  const [meetingAfter] = await db
    .select()
    .from(academyClassMeeting)
    .where(eq(academyClassMeeting.sessionId, sessionId));
  assert.equal(meetingAfter?.externalEventId, meetingBefore.externalEventId);
  assert.equal(meetingAfter?.meetingUrl, meetingBefore.meetingUrl);
  assert.equal(meetingAfter?.status, "created");
  const changedEvent = await readGoogleEvent(meetingBefore.externalEventId);
  assert.equal(changedEvent.id, originalEvent.id);
  assert.equal(changedEvent.status, "confirmed");
  assertEventTimes(changedEvent, startAt, endAt);
  assert.deepEqual(
    changedEvent.attendees?.map(({ email }) => email),
    [assignment.email],
  );
  assert.equal(changedEvent.hangoutLink, originalEvent.hangoutLink);

  // Put the durable job back in the ready state to prove retry updates this event idempotently.
  await db
    .update(academyClassMeeting)
    .set({
      status: "pending",
      scheduleVersion: before.version,
      nextRetryAt: new Date(),
      lockedAt: null,
      errorReason: null,
    })
    .where(eq(academyClassMeeting.sessionId, sessionId));
  const replay = await service.processReadyMeetings(draft.id);
  assert.equal(replay.processed, 1);
  assert.equal(replay.created, 1);
  const replayEvent = await readGoogleEvent(meetingBefore.externalEventId);
  assert.equal(replayEvent.id, originalEvent.id);
  assertEventTimes(replayEvent, startAt, endAt);
  assert.deepEqual(
    replayEvent.attendees?.map(({ email }) => email),
    [assignment.email],
  );
  assert.equal(replayEvent.hangoutLink, originalEvent.hangoutLink);

  checks.push({
    createdGoogleEvent: true,
    rescheduled: true,
    eventIdPreserved: true,
    meetLinkPreserved: true,
    attendeeSetPreserved: true,
    classTermsPreserved: true,
    exitDeadlineBoundedBy24HoursAndNewStart: true,
    retryUpdatedSameEvent: true,
    sendUpdates: "none",
  });
  result.ok = true;
} catch (error) {
  result.ok = false;
  result.error =
    error instanceof Error
      ? `${error.name}: ${error.message.slice(0, 400).replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[redacted-email]")}`
      : "Verification failed";
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
      failures.push(`Google event cleanup failed: ${fixture.sessionId}`);
    }
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
      failures.push(`Database fixture cleanup failed: ${fixture.id}`);
    }
  }
  if (bookingSnapshotBefore !== undefined) {
    try {
      const bookingRowsAfter = await db.select().from(booking);
      const preserved =
        JSON.stringify(
          bookingRowsAfter.toSorted((left, right) =>
            left.id.localeCompare(right.id),
          ),
        ) === bookingSnapshotBefore;
      result.bookingsPreserved = preserved;
      if (!preserved) failures.push("Existing booking rows changed");
    } catch {
      result.bookingsPreserved = false;
      failures.push("Existing booking preservation check failed");
    }
  }
  result.cleanup = failures.length
    ? failures
    : `Google event deleted; temporary class, session, meeting job, notifications and audits removed; all ${result.bookingCount ?? 0} existing booking rows unchanged`;
  if (failures.length) result.ok = false;
  record();
  console.log(JSON.stringify(result));
}
process.exit(result.ok ? 0 : 1);
