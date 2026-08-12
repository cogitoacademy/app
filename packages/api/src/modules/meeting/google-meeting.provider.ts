import { google } from "googleapis";
import { eq } from "drizzle-orm";
import { meetingEvent } from "@cogito-app/db/schema";
import type { DbOrTx } from "../../lib/tx";
import type {
  MeetingAttendee,
  MeetingEvent,
  MeetingPort,
} from "./meeting.types";
import { log } from "../../lib/logger";
import { CircuitBreaker } from "../../lib/circuit-breaker";
import type { RedisClient } from "../../lib/redis";

interface GoogleMeetingConfig {
  clientEmail: string;
  privateKey: string;
  calendarId: string;
}

export function createGoogleMeetingProvider(
  config: GoogleMeetingConfig,
  db: DbOrTx,
  redis?: RedisClient,
): MeetingPort {
  const googleMeetBreaker = new CircuitBreaker({
    failureThreshold: 5,
    resetTimeoutMs: 60_000,
    halfOpenMaxAttempts: 1,
    redis: redis ?? undefined,
    monitor: (state, error) => {
      log({
        level: state === "open" ? "error" : "info",
        action: "circuit_breaker_state_change",
        service: "google_meet",
        state,
        error: error ? { message: String(error) } : undefined,
      });
    },
  });
  const auth = new google.auth.JWT({
    email: config.clientEmail,
    key: config.privateKey.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });

  const calendar = google.calendar({ version: "v3", auth });

  async function createEvent(
    bookingId: string,
    scheduledStartAt?: Date,
    scheduledEndAt?: Date,
    attendees?: MeetingAttendee[],
  ): Promise<MeetingEvent> {
    try {
      const now = new Date();
      const start =
        scheduledStartAt ?? new Date(now.getTime() + 60 * 60 * 1000);
      const end = scheduledEndAt ?? new Date(start.getTime() + 90 * 60 * 1000);
      const attendeeEmails = attendees?.map((a) => a.email) ?? null;

      const TIMEOUT_MS = 30_000;
      const response = await googleMeetBreaker.execute(() =>
        Promise.race([
          calendar.events.insert({
            calendarId: config.calendarId,
            requestBody: {
              summary: `Cogito Booking ${bookingId}`,
              start: { dateTime: start.toISOString() },
              end: { dateTime: end.toISOString() },
              ...(attendees?.length
                ? {
                    attendees: attendees.map((a) => ({
                      email: a.email,
                      ...(a.name ? { displayName: a.name } : {}),
                    })),
                  }
                : {}),
              conferenceData: {
                createRequest: {
                  requestId: bookingId,
                  conferenceSolutionKey: { type: "hangoutsMeet" },
                },
              },
            },
            conferenceDataVersion: 1,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("Google Meet API timeout after 30s")),
              TIMEOUT_MS,
            ),
          ),
        ]),
      );

      const event = response.data;
      const conferenceEntry = event.conferenceData?.entryPoints?.[0];
      const meetingUrl = conferenceEntry?.uri ?? null;
      const externalEventId = event.id ?? null;

      const [row] = await db
        .insert(meetingEvent)
        .values({
          bookingId,
          provider: "google_meet",
          externalEventId,
          meetingUrl,
          attendeeEmails,
          status: "created",
        })
        .returning();

      return {
        id: row!.id,
        bookingId,
        provider: "google_meet",
        externalEventId,
        meetingUrl,
        status: "created" as const,
        errorReason: null,
      };
    } catch (error) {
      log({
        level: "error",
        action: "google_meet_create_failed",
        bookingId,
        error: { message: String(error) },
      });

      const [row] = await db
        .insert(meetingEvent)
        .values({
          bookingId,
          provider: "google_meet",
          status: "failed",
          errorReason: String(error),
          meetingUrl: null,
          externalEventId: null,
          attendeeEmails: attendees?.map((a) => a.email) ?? null,
        })
        .returning();

      return {
        id: row!.id,
        bookingId,
        provider: "google_meet",
        externalEventId: null,
        meetingUrl: null,
        status: "failed" as const,
        errorReason: String(error),
      };
    }
  }

  return { createEvent };
}

export function createGoogleMeetingProviderWithFallback(
  config: GoogleMeetingConfig,
  db: DbOrTx,
  redis?: RedisClient,
): MeetingPort {
  const googleProvider = createGoogleMeetingProvider(config, db, redis);

  async function createEvent(
    bookingId: string,
    scheduledStartAt?: Date,
    scheduledEndAt?: Date,
    attendees?: MeetingAttendee[],
  ): Promise<MeetingEvent> {
    const result = await googleProvider.createEvent(
      bookingId,
      scheduledStartAt,
      scheduledEndAt,
      attendees,
    );
    if (result.status === "failed") {
      // Update the failed google row in place instead of inserting a second
      // row, so a booking has exactly one meeting_event and the `meeting`
      // one-relation stays deterministic.
      const [row] = await db
        .update(meetingEvent)
        .set({
          provider: "manual",
          status: "manual",
          errorReason: null,
        })
        .where(eq(meetingEvent.id, result.id))
        .returning();

      log({
        level: "warn",
        action: "meeting_manual_created",
        message:
          "Meeting created with manual provider — admin needs to assign a meeting link",
        bookingId,
      });

      return row as typeof meetingEvent.$inferSelect;
    }
    return result;
  }

  return { createEvent };
}
