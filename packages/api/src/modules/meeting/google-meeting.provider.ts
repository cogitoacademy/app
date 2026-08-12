import { google } from "googleapis";
import { meetingEvent } from "@cogito-app/db/schema";
import type { DbOrTx } from "../../lib/tx";
import type { MeetingEvent, MeetingPort } from "./meeting.types";
import { log } from "../../lib/logger";
import { createFallbackMeetingProvider } from "./fallback.provider";
import { CircuitBreaker } from "../../lib/circuit-breaker";
import type { RedisClient } from "../../lib/redis";

interface GoogleMeetingConfig {
  authType: "service_account" | "oauth_refresh_token";
  calendarId: string;
  clientEmail?: string;
  privateKey?: string;
  impersonatedUser?: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
}

interface GoogleCalendarEvent {
  id?: string | null;
  hangoutLink?: string | null;
  conferenceData?: {
    entryPoints?: Array<{
      entryPointType?: string;
      uri?: string | null;
    }>;
  };
}

interface GoogleOAuthTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
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
  const auth =
    config.authType === "oauth_refresh_token"
      ? null
      : new google.auth.JWT({
          email: config.clientEmail,
          key: config.privateKey?.replace(/\\n/g, "\n"),
          scopes: ["https://www.googleapis.com/auth/calendar"],
          subject: config.impersonatedUser,
        });

  const calendar =
    config.authType === "service_account"
      ? google.calendar({ version: "v3", auth })
      : null;

  function getMeetUrl(event: GoogleCalendarEvent): string | null {
    const meetEntry = event.conferenceData?.entryPoints?.find(
      (entry: { entryPointType?: string }) => entry.entryPointType === "video",
    );
    return (
      meetEntry?.uri ??
      event.conferenceData?.entryPoints?.[0]?.uri ??
      event.hangoutLink ??
      null
    );
  }

  async function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string,
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs),
      ),
    ]);
  }

  async function fetchJson<T>(
    url: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      const bodyText = await response.text();
      const body = bodyText ? JSON.parse(bodyText) : null;

      if (!response.ok) {
        const errorMessage =
          body?.error?.message ??
          body?.error_description ??
          `Google Calendar API request failed with ${response.status}`;
        throw new Error(errorMessage);
      }

      return body as T;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Google Meet API timeout after 30s");
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function refreshOAuthAccessToken(timeoutMs: number): Promise<string> {
    if (!config.clientId || !config.clientSecret || !config.refreshToken) {
      throw new Error("Missing Google Meet OAuth configuration");
    }

    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    });

    const tokenResponse = await fetchJson<GoogleOAuthTokenResponse>(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      },
      timeoutMs,
    );

    if (!tokenResponse.access_token) {
      throw new Error(
        tokenResponse.error_description ??
          tokenResponse.error ??
          "Google OAuth token refresh failed",
      );
    }

    return tokenResponse.access_token;
  }

  async function insertEventWithOauth(
    accessToken: string,
    bookingId: string,
    start: Date,
    end: Date,
    timeoutMs: number,
  ): Promise<GoogleCalendarEvent> {
    const calendarId = encodeURIComponent(config.calendarId);
    return fetchJson<GoogleCalendarEvent>(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?conferenceDataVersion=1`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          summary: `Cogito Booking ${bookingId}`,
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() },
          conferenceData: {
            createRequest: {
              requestId: bookingId,
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
        }),
      },
      timeoutMs,
    );
  }

  async function getEventWithOauth(
    accessToken: string,
    eventId: string,
    timeoutMs: number,
  ): Promise<GoogleCalendarEvent> {
    const calendarId = encodeURIComponent(config.calendarId);
    const encodedEventId = encodeURIComponent(eventId);
    return fetchJson<GoogleCalendarEvent>(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodedEventId}`,
      {
        method: "GET",
        headers: { authorization: `Bearer ${accessToken}` },
      },
      timeoutMs,
    );
  }

  async function waitForMeetUrl(
    eventId: string,
    accessToken?: string,
  ): Promise<string | null> {
    const POLL_ATTEMPTS = 8;
    const POLL_DELAY_MS = 750;

    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_DELAY_MS));

      const event =
        config.authType === "oauth_refresh_token"
          ? await getEventWithOauth(accessToken!, eventId, 10_000)
          : (
              await calendar!.events.get({
                calendarId: config.calendarId,
                eventId,
              })
            ).data;
      const meetingUrl = getMeetUrl(event);
      if (meetingUrl) {
        return meetingUrl;
      }
    }

    return null;
  }

  async function createEvent(
    bookingId: string,
    scheduledStartAt?: Date,
    scheduledEndAt?: Date,
  ): Promise<MeetingEvent> {
    const startedAt = Date.now();
    try {
      const TIMEOUT_MS = 30_000;
      const oauthAccessToken =
        config.authType === "oauth_refresh_token"
          ? await refreshOAuthAccessToken(TIMEOUT_MS)
          : null;

      const now = new Date();
      const start =
        scheduledStartAt ?? new Date(now.getTime() + 60 * 60 * 1000);
      const end = scheduledEndAt ?? new Date(start.getTime() + 90 * 60 * 1000);

      const event = await googleMeetBreaker.execute(() =>
        config.authType === "oauth_refresh_token"
          ? insertEventWithOauth(
              oauthAccessToken!,
              bookingId,
              start,
              end,
              TIMEOUT_MS,
            )
          : withTimeout(
              Promise.resolve(
                calendar!.events.insert({
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
              ).then((response) => response.data as GoogleCalendarEvent),
              TIMEOUT_MS,
              "Google Meet API timeout after 30s",
            ),
      );

      const externalEventId = event.id ?? null;
      const immediateMeetingUrl = getMeetUrl(event);
      const meetingUrl =
        immediateMeetingUrl ??
        (externalEventId
          ? await waitForMeetUrl(externalEventId, oauthAccessToken ?? undefined)
          : null);

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
        durationMs: Date.now() - startedAt,
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
  redis?: RedisClient,
): MeetingPort {
  const googleProvider = createGoogleMeetingProvider(config, db, redis);
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
