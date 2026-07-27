import { google } from "googleapis";
import { meetingEvent } from "@cogito-app/db/schema";
import type { DbOrTx } from "../../lib/tx";
import type { MeetingEvent, MeetingPort } from "./meeting.types";
import { log } from "../../lib/logger";
import { createFallbackMeetingProvider } from "./fallback.provider";

interface GoogleMeetingConfig {
  clientEmail: string;
  privateKey: string;
  calendarId: string;
}

export function createGoogleMeetingProvider(
  config: GoogleMeetingConfig,
  db: DbOrTx,
): MeetingPort {
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
  ): Promise<MeetingEvent> {
    try {
      const now = new Date();
      const start =
        scheduledStartAt ?? new Date(now.getTime() + 60 * 60 * 1000);
      const end = scheduledEndAt ?? new Date(start.getTime() + 90 * 60 * 1000);

      const TIMEOUT_MS = 30_000;
      const response = await Promise.race([
        calendar.events.insert({
          calendarId: config.calendarId,
          requestBody: {
            summary: `Cogito Booking ${bookingId}`,
            start: { dateTime: start.toISOString() },
            end: { dateTime: end.toISOString() },
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
      ]);

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
): MeetingPort {
  const googleProvider = createGoogleMeetingProvider(config, db);
  const fallbackProvider = createFallbackMeetingProvider(db);

  async function createEvent(
    bookingId: string,
    scheduledStartAt?: Date,
    scheduledEndAt?: Date,
  ): Promise<MeetingEvent> {
    const result = await googleProvider.createEvent(
      bookingId,
      scheduledStartAt,
      scheduledEndAt,
    );
    if (result.status === "failed") {
      return fallbackProvider.createEvent(
        bookingId,
        scheduledStartAt,
        scheduledEndAt,
      );
    }
    return result;
  }

  return { createEvent };
}
