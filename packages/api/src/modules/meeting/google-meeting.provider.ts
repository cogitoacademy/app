import { google } from "googleapis";
import type { calendar_v3 } from "googleapis";
import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { meetingEvent } from "@cogito-app/db/schema";
import type { DbOrTx } from "../../lib/tx";
import type {
  MeetingAttendee,
  MeetingEvent,
  MeetingEventDetails,
  MeetingPort,
} from "./meeting.types";
import { log } from "../../lib/logger";
import { MAX_MEETING_RETRY_ATTEMPTS } from "../../shared/constants";
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

type GoogleCalendarEvent = calendar_v3.Schema$Event;

function offlineCalendarEventId(bookingId: string): string {
  // Google event ids accept base32hex characters. A stable digest makes
  // concurrent/replayed room assignment safe even before the local row exists.
  return `cogito${createHash("sha256").update(bookingId).digest("hex")}`;
}

interface GoogleOAuthTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
  expires_in?: number;
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
    config.authType === "service_account"
      ? new google.auth.JWT({
          email: config.clientEmail,
          key: config.privateKey?.replace(/\\n/g, "\n"),
          scopes: ["https://www.googleapis.com/auth/calendar"],
          subject: config.impersonatedUser,
        })
      : undefined;

  const calendar =
    config.authType === "service_account"
      ? google.calendar({ version: "v3", auth })
      : undefined;

  function getMeetUrl(event: GoogleCalendarEvent): string | null {
    const meetEntry = event.conferenceData?.entryPoints?.find(
      (entry) => entry.entryPointType === "video",
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
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error(timeoutMessage)),
        timeoutMs,
      );
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      // Never leave the timer alive holding the process open (L1).
      clearTimeout(timeoutId);
    }
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
        throw new Error("Google Meet API timeout after 30s", {
          cause: error,
        });
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  let cachedAccessToken: { token: string; expiresAt: number } | null = null;

  async function refreshOAuthAccessToken(timeoutMs: number): Promise<string> {
    const { clientId, clientSecret, refreshToken } = config;
    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error("Missing Google Meet OAuth configuration");
    }

    // Reuse a cached token until 60s before expiry (M13): avoids a token
    // endpoint round-trip on every calendar call.
    if (
      cachedAccessToken &&
      Date.now() < cachedAccessToken.expiresAt - 60_000
    ) {
      return cachedAccessToken.token;
    }

    // Refresh inside the circuit breaker so a token-endpoint outage trips it
    // instead of bypassing its protection (M13).
    return googleMeetBreaker.execute(async () => {
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
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

      const expiresInSeconds = tokenResponse.expires_in ?? 3600;
      cachedAccessToken = {
        token: tokenResponse.access_token,
        expiresAt: Date.now() + expiresInSeconds * 1000,
      };
      return tokenResponse.access_token;
    });
  }

  /**
   * Boot-time connectivity probe (P4.2/X3): verifies the configured credentials
   * can reach the Calendar API (calendarList.get). For the service-account
   * path this also surfaces misconfigured domain-wide delegation (events would
   * otherwise land on the SA's own calendar and never produce a Meet URL).
   * Logs loudly on failure so a broken Google Meet swap fails at boot.
   */
  async function probe(): Promise<{ ok: boolean; error?: string }> {
    try {
      if (config.authType === "oauth_refresh_token") {
        const accessToken = await refreshOAuthAccessToken(10_000);
        await fetchJson<unknown>(
          "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1",
          {
            method: "GET",
            headers: { authorization: `Bearer ${accessToken}` },
          },
          10_000,
        );
      } else {
        await googleMeetBreaker.execute(async () =>
          withTimeout(
            Promise.resolve(
              calendar!.calendarList.list({ maxResults: 1 }),
            ).then((response) => response.data),
            10_000,
            "Google Meet API timeout after 10s (boot probe)",
          ),
        );
      }
      log({
        level: "info",
        action: "google_meet_probe_ok",
        authType: config.authType,
        calendarId: config.calendarId,
        message: "Google Meet credentials verified against the Calendar API",
      });
      return { ok: true };
    } catch (error) {
      log({
        level: "error",
        action: "google_meet_probe_failed",
        authType: config.authType,
        calendarId: config.calendarId,
        message:
          "Google Meet boot probe failed — check credentials, calendar id, and GOOGLE_IMPERSONATED_USER (service-account mode)",
        error: { message: String(error) },
      });
      return { ok: false, error: String(error) };
    }
  }

  async function insertEventWithOauth(
    accessToken: string,
    bookingId: string,
    start: Date,
    end: Date,
    attendees: MeetingAttendee[] | undefined,
    details: MeetingEventDetails | undefined,
    timeoutMs: number,
  ): Promise<GoogleCalendarEvent> {
    const calendarId = encodeURIComponent(config.calendarId);
    const summary = details?.title?.trim() || `Cogito Booking ${bookingId}`;
    const description = details?.description?.trim();
    return fetchJson<GoogleCalendarEvent>(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?conferenceDataVersion=1`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ...(details?.createConference === false
            ? { id: offlineCalendarEventId(bookingId) }
            : {}),
          summary,
          ...(description ? { description } : {}),
          ...(details?.location?.trim()
            ? { location: details.location.trim() }
            : {}),
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() },
          ...(attendees?.length
            ? {
                attendees: attendees.map((attendee) => ({
                  email: attendee.email,
                  ...(attendee.name ? { displayName: attendee.name } : {}),
                })),
              }
            : {}),
          ...(details?.createConference === false
            ? {}
            : {
                conferenceData: {
                  createRequest: {
                    requestId: bookingId,
                    conferenceSolutionKey: { type: "hangoutsMeet" },
                  },
                },
              }),
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

  async function deleteEventWithOauth(
    accessToken: string,
    eventId: string,
    timeoutMs: number,
  ): Promise<void> {
    const calendarId = encodeURIComponent(config.calendarId);
    const encodedEventId = encodeURIComponent(eventId);
    await fetchJson<unknown>(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodedEventId}`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${accessToken}` },
      },
      timeoutMs,
    );
  }

  /**
   * Finds the newest provider-created (google_meet) meeting event row for a
   * booking. Rows that were never created (failed/manual fallback) or already
   * cancelled have no live provider event to update/delete.
   */
  async function findLiveProviderEvent(bookingId: string) {
    const [row] = await db
      .select()
      .from(meetingEvent)
      .where(
        and(
          eq(meetingEvent.bookingId, bookingId),
          eq(meetingEvent.provider, "google_meet"),
        ),
      )
      .orderBy(desc(meetingEvent.createdAt), desc(meetingEvent.id))
      .limit(1);
    if (!row || !row.externalEventId) return null;
    if (row.status === "failed" || row.status === "cancelled") return null;
    return row;
  }

  async function updateEvent(
    bookingId: string,
    changes: { startAt?: Date; endAt?: Date; location?: string },
  ): Promise<void> {
    if (!changes.startAt && !changes.endAt && changes.location === undefined)
      return;
    const startedAt = Date.now();
    const row = await findLiveProviderEvent(bookingId);
    if (!row) return;

    try {
      await googleMeetBreaker.execute(async () => {
        const TIMEOUT_MS = 30_000;
        const oauthAccessToken =
          config.authType === "oauth_refresh_token"
            ? await refreshOAuthAccessToken(TIMEOUT_MS)
            : null;
        if (config.authType === "oauth_refresh_token") {
          const current = await getEventWithOauth(
            oauthAccessToken!,
            row.externalEventId!,
            TIMEOUT_MS,
          );
          const calendarId = encodeURIComponent(config.calendarId);
          const encodedEventId = encodeURIComponent(row.externalEventId!);
          await fetchJson<GoogleCalendarEvent>(
            `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodedEventId}`,
            {
              method: "PUT",
              headers: {
                authorization: `Bearer ${oauthAccessToken}`,
                "content-type": "application/json",
              },
              body: JSON.stringify({
                ...current,
                ...(changes.startAt
                  ? { start: { dateTime: changes.startAt.toISOString() } }
                  : {}),
                ...(changes.endAt
                  ? { end: { dateTime: changes.endAt.toISOString() } }
                  : {}),
                ...(changes.location !== undefined
                  ? { location: changes.location }
                  : {}),
              }),
            },
            TIMEOUT_MS,
          );
        } else {
          // `events.update` replaces the entire event resource. Fetch the
          // current event first so the human-readable title, description,
          // attendees, and Meet conference are preserved on reschedule.
          const current = await withTimeout(
            Promise.resolve(
              calendar!.events.get({
                calendarId: config.calendarId,
                eventId: row.externalEventId!,
              }),
            ).then((response) => response.data as GoogleCalendarEvent),
            TIMEOUT_MS,
            "Google Meet API timeout after 30s",
          );
          await withTimeout(
            Promise.resolve(
              calendar!.events.update({
                calendarId: config.calendarId,
                eventId: row.externalEventId!,
                requestBody: {
                  ...current,
                  ...(changes.startAt
                    ? { start: { dateTime: changes.startAt.toISOString() } }
                    : {}),
                  ...(changes.endAt
                    ? { end: { dateTime: changes.endAt.toISOString() } }
                    : {}),
                  ...(changes.location !== undefined
                    ? { location: changes.location }
                    : {}),
                },
              }),
            ).then(() => undefined),
            TIMEOUT_MS,
            "Google Meet API timeout after 30s",
          );
        }
      });
      log({
        level: "info",
        action: "google_meet_event_updated",
        bookingId,
        eventId: row.externalEventId,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      log({
        level: "error",
        action: "google_meet_update_failed",
        bookingId,
        durationMs: Date.now() - startedAt,
        error: { message: String(error) },
      });
    }
  }

  async function cancelEvent(bookingId: string): Promise<void> {
    const startedAt = Date.now();
    const row = await findLiveProviderEvent(bookingId);
    if (!row) return;

    try {
      await googleMeetBreaker.execute(async () => {
        const TIMEOUT_MS = 30_000;
        const oauthAccessToken =
          config.authType === "oauth_refresh_token"
            ? await refreshOAuthAccessToken(TIMEOUT_MS)
            : null;
        if (config.authType === "oauth_refresh_token") {
          await deleteEventWithOauth(
            oauthAccessToken!,
            row.externalEventId!,
            TIMEOUT_MS,
          );
        } else {
          await withTimeout(
            Promise.resolve(
              calendar!.events.delete({
                calendarId: config.calendarId,
                eventId: row.externalEventId!,
              }),
            ).then(() => undefined),
            TIMEOUT_MS,
            "Google Meet API timeout after 30s",
          );
        }
      });

      await db
        .update(meetingEvent)
        .set({ status: "cancelled" })
        .where(eq(meetingEvent.id, row.id));

      log({
        level: "info",
        action: "google_meet_event_cancelled",
        bookingId,
        eventId: row.externalEventId,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      log({
        level: "error",
        action: "google_meet_cancel_failed",
        bookingId,
        durationMs: Date.now() - startedAt,
        error: { message: String(error) },
      });
    }
  }

  async function setManualLink(
    bookingId: string,
    url: string,
    conn?: DbOrTx,
  ): Promise<MeetingEvent> {
    // F10: when called inside a booking transaction, the local row must join
    // that transaction so it rolls back with the booking.
    const write = conn ?? db;
    const [existing] = await write
      .select()
      .from(meetingEvent)
      .where(eq(meetingEvent.bookingId, bookingId))
      .orderBy(desc(meetingEvent.createdAt), desc(meetingEvent.id))
      .limit(1);

    const values = {
      provider: "manual",
      status: "created",
      meetingUrl: url,
      errorReason: null,
    } as const;

    if (existing) {
      const [updated] = await write
        .update(meetingEvent)
        .set(values)
        .where(eq(meetingEvent.id, existing.id))
        .returning();
      return updated as typeof meetingEvent.$inferSelect;
    }

    const [created] = await write
      .insert(meetingEvent)
      .values({
        bookingId,
        provider: "manual",
        status: "created",
        meetingUrl: url,
        externalEventId: null,
      })
      .returning();
    return created as typeof meetingEvent.$inferSelect;
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
          : await withTimeout(
              Promise.resolve(
                calendar!.events.get({
                  calendarId: config.calendarId,
                  eventId,
                }),
              ).then((response) => response.data),
              10_000,
              "Google Meet API timeout after 10s (waitForMeetUrl)",
            );
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
    attendees?: MeetingAttendee[],
    conn?: DbOrTx,
    details?: MeetingEventDetails,
  ): Promise<MeetingEvent> {
    const startedAt = Date.now();
    // L2: when called inside a booking transaction, the local meetingEvent row
    // must join that transaction so it rolls back with the booking — a failed
    // transition would otherwise leave an orphan row (and re-accept would
    // duplicate the provider event).
    const write = conn ?? db;
    try {
      // Offline room assignment can be retried by an admin or caller. Reuse a
      // previously-created provider row so a retry never duplicates the
      // physical Calendar event. The online path retains its existing Meet
      // request-id behavior unchanged.
      if (details?.createConference === false) {
        const [existing] = await write
          .select()
          .from(meetingEvent)
          .where(
            and(
              eq(meetingEvent.bookingId, bookingId),
              eq(meetingEvent.provider, "google_meet"),
              eq(meetingEvent.status, "created"),
            ),
          )
          .orderBy(desc(meetingEvent.createdAt), desc(meetingEvent.id))
          .limit(1);
        if (existing?.externalEventId) return existing as MeetingEvent;
      }

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
              attendees,
              details,
              TIMEOUT_MS,
            )
          : withTimeout(
              Promise.resolve(
                calendar!.events.insert({
                  calendarId: config.calendarId,
                  requestBody: {
                    ...(details?.createConference === false
                      ? { id: offlineCalendarEventId(bookingId) }
                      : {}),
                    summary:
                      details?.title?.trim() || `Cogito Booking ${bookingId}`,
                    ...(details?.description?.trim()
                      ? { description: details.description.trim() }
                      : {}),
                    ...(details?.location?.trim()
                      ? { location: details.location.trim() }
                      : {}),
                    start: { dateTime: start.toISOString() },
                    end: { dateTime: end.toISOString() },
                    ...(attendees?.length
                      ? {
                          attendees: attendees.map((attendee) => ({
                            email: attendee.email,
                            ...(attendee.name
                              ? { displayName: attendee.name }
                              : {}),
                          })),
                        }
                      : {}),
                    ...(details?.createConference === false
                      ? {}
                      : {
                          conferenceData: {
                            createRequest: {
                              requestId: bookingId,
                              conferenceSolutionKey: { type: "hangoutsMeet" },
                            },
                          },
                        }),
                  },
                  ...(details?.createConference === false
                    ? {}
                    : { conferenceDataVersion: 1 }),
                }),
              ).then((response) => response.data as GoogleCalendarEvent),
              TIMEOUT_MS,
              "Google Meet API timeout after 30s",
            ),
      );

      const externalEventId = event.id ?? null;
      const immediateMeetingUrl = getMeetUrl(event);
      let meetingUrl: string | null = null;
      if (immediateMeetingUrl) {
        meetingUrl = immediateMeetingUrl;
      } else if (externalEventId && details?.createConference !== false) {
        // R8: the Google event was already created — a failure to poll for
        // the Meet URL must NOT discard the created event (a `failed` row
        // would cause a duplicate Google event on retry). Log and continue
        // with meetingUrl null instead.
        try {
          meetingUrl = await waitForMeetUrl(
            externalEventId,
            oauthAccessToken ?? undefined,
          );
        } catch (error) {
          log({
            level: "warn",
            action: "google_meet_url_poll_failed",
            bookingId,
            eventId: externalEventId,
            error: { message: String(error) },
          });
        }
      }

      const [row] = await write
        .insert(meetingEvent)
        .values({
          bookingId,
          provider: "google_meet",
          externalEventId,
          meetingUrl,
          attendeeEmails: attendees?.map((attendee) => attendee.email) ?? null,
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

      const [row] = await write
        .insert(meetingEvent)
        .values({
          bookingId,
          provider: "google_meet",
          status: "failed",
          errorReason: String(error),
          meetingUrl: null,
          externalEventId: null,
          attendeeEmails: attendees?.map((attendee) => attendee.email) ?? null,
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

  return { createEvent, updateEvent, cancelEvent, setManualLink, probe };
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
    conn?: DbOrTx,
    details?: MeetingEventDetails,
  ): Promise<MeetingEvent> {
    const result = await googleProvider.createEvent(
      bookingId,
      scheduledStartAt,
      scheduledEndAt,
      attendees,
      conn,
      details,
    );
    if (result.status === "failed") {
      // Count this booking's failed google_meet attempts. The retry budget is
      // derived from the number of failed meetingEvent rows (the scheduler
      // retry job stops at MAX_MEETING_RETRY_ATTEMPTS), so the failed row must
      // be left intact for the job to find — only then fall back to manual
      // (M12). Previously the row was rewritten to manual immediately, which
      // made the retry job dead code and left bookings SCHEDULED without a
      // link.
      const read = conn ?? db;
      const write = conn ?? db;
      const [countRow] = await read
        .select({ count: sql<number>`count(*)::int` })
        .from(meetingEvent)
        .where(
          and(
            eq(meetingEvent.bookingId, bookingId),
            eq(meetingEvent.provider, "google_meet"),
            eq(meetingEvent.status, "failed"),
          ),
        );
      const attempts = countRow?.count ?? 0;

      if (attempts >= MAX_MEETING_RETRY_ATTEMPTS) {
        const [row] = await write
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
          action: "meeting_manual_fallback",
          message: `Google Meet creation failed ${attempts} times; falling back to manual link`,
          bookingId,
        });

        return row as typeof meetingEvent.$inferSelect;
      }

      log({
        level: "warn",
        action: "meeting_failed_attempt",
        message: `Google Meet creation failed (attempt ${attempts}); will be retried by the scheduler`,
        bookingId,
      });

      return result;
    }
    return result;
  }

  return {
    createEvent,
    updateEvent: googleProvider.updateEvent,
    cancelEvent: googleProvider.cancelEvent,
    setManualLink: googleProvider.setManualLink,
    probe: googleProvider.probe,
  };
}
