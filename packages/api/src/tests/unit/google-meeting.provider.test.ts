import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { createHash } from "node:crypto";

let logCaptures: any[] = [];
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  logCaptures = [];
  console.log = (...args: unknown[]) => {
    try {
      logCaptures.push(JSON.parse(args[0] as string));
    } catch {
      logCaptures.push(args);
    }
  };
  console.error = (...args: unknown[]) => {
    try {
      logCaptures.push(JSON.parse(args[0] as string));
    } catch {
      logCaptures.push(args);
    }
  };
  console.warn = (...args: unknown[]) => {
    try {
      logCaptures.push(JSON.parse(args[0] as string));
    } catch {
      logCaptures.push(args);
    }
  };
});

afterEach(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
  globalThis.fetch = originalFetch;
});

const mockCalendarEventsInsert = mock(async () => ({
  data: {
    id: "evt_123",
    conferenceData: {
      entryPoints: [{ uri: "https://meet.google.com/abc" }],
    },
  },
}));
const mockCalendarEventsGet = mock(async () => ({
  data: {
    id: "evt_123",
    conferenceData: {
      entryPoints: [
        { entryPointType: "video", uri: "https://meet.google.com/abc" },
      ],
    },
  },
}));
const mockCalendarEventsUpdate = mock(async () => ({
  data: {
    id: "evt_123",
    start: { dateTime: "2030-01-01T10:00:00.000Z" },
    end: { dateTime: "2030-01-01T11:00:00.000Z" },
  },
}));
const mockCalendarEventsDelete = mock(async () => ({ data: "" }));
const mockCalendarList = mock(async () => ({ data: { items: [] } }));

mock.module("googleapis", () => ({
  google: {
    auth: {
      JWT: class {
        constructor(_config: unknown) {}
      },
      OAuth2: class {
        credentials: unknown;
        constructor(_clientId: string, _clientSecret: string) {}
        setCredentials(credentials: unknown) {
          this.credentials = credentials;
        }
      },
    },
    calendar: () => ({
      events: {
        insert: mockCalendarEventsInsert,
        get: mockCalendarEventsGet,
        update: mockCalendarEventsUpdate,
        delete: mockCalendarEventsDelete,
      },
      calendarList: { list: mockCalendarList },
    }),
  },
}));

import {
  createGoogleMeetingProvider,
  createGoogleMeetingProviderWithFallback,
} from "../../modules/meeting/google-meeting.provider";

describe("createGoogleMeetingProvider", () => {
  const config = {
    authType: "service_account" as const,
    clientEmail: "test@example.com",
    privateKey: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
    calendarId: "primary",
  };

  test("createEvent creates event with Google Meet link on success", async () => {
    mockCalendarEventsInsert.mockImplementationOnce(async () => ({
      data: {
        id: "evt_123",
        conferenceData: {
          entryPoints: [{ uri: "https://meet.google.com/abc" }],
        },
      },
    }));

    const successRow = {
      id: "me1",
      bookingId: "b1",
      provider: "google_meet",
      externalEventId: "evt_123",
      meetingUrl: "https://meet.google.com/abc",
      status: "created",
      errorReason: null,
    };

    const returning = mock(async () => [successRow]);
    const values = mock(() => ({ returning }));
    const insert = mock(() => ({ values }));
    const db = { insert } as any;

    const provider = createGoogleMeetingProvider(config, db);
    const result = await provider.createEvent("b1", undefined, undefined, [
      { email: "tutor@example.com", name: "Tutor" },
      { email: "student@example.com" },
    ]);

    expect(result.bookingId).toBe("b1");
    expect(result.provider).toBe("google_meet");
    expect(result.status).toBe("created");
    expect(result.meetingUrl).toBe("https://meet.google.com/abc");
    expect(result.externalEventId).toBe("evt_123");
    expect(result.errorReason).toBeNull();
  });

  test("createEvent passes attendees to calendar insert and persists attendeeEmails", async () => {
    mockCalendarEventsInsert.mockImplementationOnce(async () => ({
      data: {
        id: "evt_123",
        conferenceData: {
          entryPoints: [{ uri: "https://meet.google.com/abc" }],
        },
      },
    }));

    const successRow = {
      id: "me1",
      bookingId: "b1",
      provider: "google_meet",
      externalEventId: "evt_123",
      meetingUrl: "https://meet.google.com/abc",
      attendeeEmails: ["tutor@example.com", "student@example.com"],
      status: "created",
      errorReason: null,
    };

    const returning = mock(async () => [successRow]);
    const values = mock(() => ({ returning }));
    const insert = mock(() => ({ values }));
    const db = { insert } as any;

    const provider = createGoogleMeetingProvider(config, db);
    await provider.createEvent(
      "b1",
      undefined,
      undefined,
      [
        { email: "tutor@example.com", name: "Tutor" },
        { email: "student@example.com" },
      ],
      undefined,
      {
        title: "Solo session with Tutor & Student",
        description:
          "Open this booking in Cogito: https://app.cogito.test/bookings/b1",
      },
    );

    const insertCall = mockCalendarEventsInsert.mock.calls.at(-1)?.[0];
    expect(insertCall?.sendUpdates).toBe("none");
    expect(insertCall?.requestBody?.attendees).toEqual([
      { email: "tutor@example.com", displayName: "Tutor" },
      { email: "student@example.com" },
    ]);
    expect(insertCall?.requestBody?.summary).toBe(
      "Solo session with Tutor & Student",
    );
    expect(insertCall?.requestBody?.description).toBe(
      "Open this booking in Cogito: https://app.cogito.test/bookings/b1",
    );

    const insertValues = values.mock.calls[0]?.[0] as {
      attendeeEmails: string[] | null;
    };
    expect(insertValues.attendeeEmails).toEqual([
      "tutor@example.com",
      "student@example.com",
    ]);
  });

  test("createEvent creates an idempotent offline Calendar event without Meet", async () => {
    mockCalendarEventsInsert.mockImplementationOnce(async () => ({
      data: { id: "evt_offline" },
    }));
    const row = {
      id: "me-offline",
      bookingId: "offline-1",
      provider: "google_meet",
      externalEventId: "evt_offline",
      meetingUrl: null,
      status: "created",
      errorReason: null,
    };
    let lookup = 0;
    const db = {
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            orderBy: mock(() => ({
              limit: mock(async () => (lookup++ === 0 ? [] : [row])),
            })),
          })),
        })),
      })),
      insert: mock(() => ({
        values: mock(() => ({ returning: mock(async () => [row]) })),
      })),
    } as any;
    const provider = createGoogleMeetingProvider(config, db);
    const start = new Date("2030-03-01T08:00:00Z");
    const end = new Date("2030-03-01T09:30:00Z");
    const details = {
      title: "Cogito - IMO | Tutor x Student",
      description: "Session details",
      location: "Room A — Main Campus",
      createConference: false,
    };

    const first = await provider.createEvent(
      "offline-1",
      start,
      end,
      [{ email: "student@example.com" }],
      undefined,
      details,
    );
    const second = await provider.createEvent(
      "offline-1",
      start,
      end,
      [{ email: "student@example.com" }],
      undefined,
      details,
    );

    expect(first.meetingUrl).toBeNull();
    expect(second).toEqual(row);
    const offlineCalls = mockCalendarEventsInsert.mock.calls.filter(
      (call) => call[0]?.requestBody?.summary === details.title,
    );
    expect(offlineCalls).toHaveLength(1);
    expect(offlineCalls[0]?.[0]?.requestBody?.description).toBe(
      details.description,
    );
    expect(offlineCalls[0]?.[0]?.requestBody?.location).toBe(details.location);
    expect(offlineCalls[0]?.[0]?.requestBody?.id).toMatch(/^cogito[0-9a-f]+$/);
    expect(offlineCalls[0]?.[0]?.requestBody?.conferenceData).toBeUndefined();
    expect(offlineCalls[0]?.[0]?.conferenceDataVersion).toBeUndefined();
  });

  test("createEvent returns failed status on Google API error", async () => {
    mockCalendarEventsInsert.mockImplementationOnce(async () => {
      throw new Error("Google API error");
    });

    const failedRow = {
      id: "me2",
      bookingId: "b1",
      provider: "google_meet",
      externalEventId: null,
      meetingUrl: null,
      status: "failed",
      errorReason: "Error: Google API error",
    };

    const returning = mock(async () => [failedRow]);
    const values = mock(() => ({ returning }));
    const insert = mock(() => ({ values }));
    const db = { insert } as any;

    logCaptures = [];
    const provider = createGoogleMeetingProvider(config, db);
    const result = await provider.createEvent("b1", undefined, undefined, [
      { email: "student@example.com" },
    ]);

    expect(result.bookingId).toBe("b1");
    expect(result.provider).toBe("google_meet");
    expect(result.status).toBe("failed");
    expect(result.errorReason).toBeDefined();
    expect(values.mock.calls[0]?.[0]).toMatchObject({
      attendeeEmails: ["student@example.com"],
    });

    const errorLog = logCaptures.find(
      (e) => e.action === "google_meet_create_failed",
    );
    expect(errorLog).toBeDefined();
  });

  test("createEvent keeps the created event when the URL poll fails (R8)", async () => {
    // Insert succeeds but returns no conferenceData, so createEvent must poll
    // for the Meet URL — and the poll throws.
    mockCalendarEventsInsert.mockImplementationOnce(async () => ({
      data: { id: "evt_123" },
    }));
    const originalGet = mockCalendarEventsGet.mockImplementation;
    mockCalendarEventsGet.mockImplementation(async () => {
      throw new Error("poll network error");
    });

    const createdRow = {
      id: "me1",
      bookingId: "b1",
      provider: "google_meet",
      externalEventId: "evt_123",
      meetingUrl: null,
      status: "created",
      errorReason: null,
    };

    const returning = mock(async () => [createdRow]);
    const values = mock(() => ({ returning }));
    const insert = mock(() => ({ values }));
    const db = { insert } as any;

    const provider = createGoogleMeetingProvider(config, db);
    const result = await provider.createEvent("b1");

    // Restore the default get mock so later tests are unaffected.
    mockCalendarEventsGet.mockImplementation(originalGet);

    // The event was created on Google's side — a poll failure must not turn
    // the row into `failed` (that would cause a duplicate event on retry).
    expect(result.status).toBe("created");
    expect(result.externalEventId).toBe("evt_123");
    expect(result.meetingUrl).toBeNull();
    expect(insert).toHaveBeenCalledTimes(1);
    const insertValues = values.mock.calls[0][0] as Record<string, unknown>;
    expect(insertValues.status).toBe("created");
  });

  test("createEvent creates event with OAuth refresh token flow", async () => {
    const oauthConfig = {
      authType: "oauth_refresh_token" as const,
      clientId: "oauth-client-id",
      clientSecret: "oauth-client-secret",
      refreshToken: "oauth-refresh-token",
      calendarId: "primary",
    };
    let oauthRequestBody: Record<string, unknown> | undefined;

    globalThis.fetch = mock(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url === "https://oauth2.googleapis.com/token") {
          return new Response(
            JSON.stringify({ access_token: "oauth-access-token" }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }

        if (
          url ===
          "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=none"
        ) {
          oauthRequestBody = JSON.parse(String(init?.body)) as Record<
            string,
            unknown
          >;
          return new Response(
            JSON.stringify({
              id: "evt_oauth",
              conferenceData: {
                entryPoints: [
                  {
                    entryPointType: "video",
                    uri: "https://meet.google.com/oauth",
                  },
                ],
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }

        throw new Error(`Unexpected fetch URL: ${url}`);
      },
    ) as typeof globalThis.fetch;

    const successRow = {
      id: "me_oauth",
      bookingId: "b1",
      provider: "google_meet",
      externalEventId: "evt_oauth",
      meetingUrl: "https://meet.google.com/oauth",
      status: "created",
      errorReason: null,
    };

    const returning = mock(async () => [successRow]);
    const values = mock(() => ({ returning }));
    const insert = mock(() => ({ values }));
    const db = { insert } as any;

    const provider = createGoogleMeetingProvider(oauthConfig, db);
    const result = await provider.createEvent(
      "b1",
      undefined,
      undefined,
      [
        { email: "tutor@example.com", name: "Tutor" },
        { email: "student@example.com" },
      ],
      undefined,
      {
        title: "Solo session with Tutor & Student",
        description:
          "Open this booking in Cogito: https://app.cogito.test/bookings/b1",
      },
    );

    expect(result.bookingId).toBe("b1");
    expect(result.provider).toBe("google_meet");
    expect(result.status).toBe("created");
    expect(result.meetingUrl).toBe("https://meet.google.com/oauth");
    expect(result.externalEventId).toBe("evt_oauth");
    expect(result.errorReason).toBeNull();
    expect(oauthRequestBody).toMatchObject({
      summary: "Solo session with Tutor & Student",
      description:
        "Open this booking in Cogito: https://app.cogito.test/bookings/b1",
    });
  });
});

describe("createGoogleMeetingProviderWithFallback", () => {
  const config = {
    authType: "service_account" as const,
    clientEmail: "test@example.com",
    privateKey: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
    calendarId: "primary",
  };

  test("returns Google result when successful", async () => {
    mockCalendarEventsInsert.mockImplementationOnce(async () => ({
      data: {
        id: "evt_123",
        conferenceData: {
          entryPoints: [{ uri: "https://meet.google.com/abc" }],
        },
      },
    }));

    const successRow = {
      id: "me1",
      bookingId: "b1",
      provider: "google_meet",
      meetingUrl: "https://meet.google.com/abc",
      externalEventId: "evt_123",
      status: "created",
      errorReason: null,
    };

    const returning = mock(async () => [successRow]);
    const values = mock(() => ({ returning }));
    const insert = mock(() => ({ values }));
    const db = { insert } as any;

    const provider = createGoogleMeetingProviderWithFallback(config, db);
    const result = await provider.createEvent("b1");

    expect(result.provider).toBe("google_meet");
    expect(result.status).toBe("created");
  });

  test("falls back to manual when Google provider fails", async () => {
    mockCalendarEventsInsert.mockImplementationOnce(async () => {
      throw new Error("Google API error");
    });

    const failedRow = {
      id: "me2",
      bookingId: "b1",
      provider: "google_meet",
      externalEventId: null,
      meetingUrl: null,
      status: "failed",
      errorReason: "Error: Google API error",
    };
    const manualRow = {
      id: "me2",
      bookingId: "b1",
      provider: "manual",
      externalEventId: null,
      meetingUrl: null,
      status: "manual",
      errorReason: null,
    };

    const insert = mock(() => ({
      values: mock(() => ({
        returning: mock(async () => [failedRow]),
      })),
    }));
    const returning = mock(async () => [manualRow]);
    const where = mock(() => ({ returning }));
    const set = mock(() => ({ where }));
    const update = mock(() => ({ set }));
    const countSelect = mock(() => ({
      from: mock(() => ({
        where: mock(async () => [{ count: 1 }]),
      })),
    }));
    const db = { insert, update, select: countSelect } as any;

    const provider = createGoogleMeetingProviderWithFallback(config, db);
    const result = await provider.createEvent("b1");

    expect(insert).toHaveBeenCalledTimes(1);
    // Attempt 1 of 3: the failed row stays intact for the scheduler retry job
    // (M12) — no immediate manual fallback.
    expect(update).not.toHaveBeenCalled();
    expect(result.provider).toBe("google_meet");
    expect(result.status).toBe("failed");
  });

  test("falls back to manual only after MAX_MEETING_RETRY_ATTEMPTS failures (M12)", async () => {
    mockCalendarEventsInsert.mockImplementationOnce(async () => {
      throw new Error("Google API error");
    });

    const failedRow = {
      id: "me1",
      bookingId: "b1",
      provider: "google_meet",
      externalEventId: null,
      meetingUrl: null,
      status: "failed",
      errorReason: "Error: Google API error",
    };
    const manualRow = {
      id: "me2",
      bookingId: "b1",
      provider: "manual",
      externalEventId: null,
      meetingUrl: null,
      status: "manual",
      errorReason: null,
    };

    const insert = mock(() => ({
      values: mock(() => ({
        returning: mock(async () => [failedRow]),
      })),
    }));
    const returning = mock(async () => [manualRow]);
    const where = mock(() => ({ returning }));
    const set = mock(() => ({ where }));
    const update = mock(() => ({ set }));
    const countSelect = mock(() => ({
      from: mock(() => ({
        where: mock(async () => [{ count: 3 }]),
      })),
    }));
    const db = { insert, update, select: countSelect } as any;

    const provider = createGoogleMeetingProviderWithFallback(config, db);
    const result = await provider.createEvent("b1");

    expect(insert).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "manual", status: "manual" }),
    );
    expect(result.provider).toBe("manual");
    expect(result.status).toBe("manual");
  });

  test("probes service-account calendar connectivity successfully", async () => {
    mockCalendarList.mockResolvedValueOnce({ data: { items: [] } });
    const provider = createGoogleMeetingProvider(config, {} as any);

    await expect(provider.probe?.()).resolves.toEqual({ ok: true });
    expect(mockCalendarList).toHaveBeenCalledTimes(1);
  });

  test("returns a failed service-account probe without throwing", async () => {
    mockCalendarList.mockImplementationOnce(async () => {
      throw new Error("calendar unavailable");
    });
    const provider = createGoogleMeetingProvider(config, {} as any);

    await expect(provider.probe?.()).resolves.toEqual({
      ok: false,
      error: "Error: calendar unavailable",
    });
  });
});

describe("createGoogleMeetingProvider updateEvent/cancelEvent (OQ-05)", () => {
  const config = {
    authType: "service_account" as const,
    clientEmail: "test@example.com",
    privateKey: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
    calendarId: "primary",
  };

  function makeSelectDb(row: unknown) {
    return {
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            orderBy: mock(() => ({
              limit: mock(async () => (row ? [row] : [])),
            })),
          })),
        })),
      })),
      update: mock(() => ({
        set: mock(() => ({ where: mock(async () => []) })),
      })),
      insert: mock(() => ({
        values: mock(() => ({ returning: mock(async () => []) })),
      })),
    } as any;
  }

  const liveRow = {
    id: "me1",
    bookingId: "b1",
    provider: "google_meet",
    externalEventId: "evt_123",
    meetingUrl: "https://meet.google.com/abc",
    status: "created",
    errorReason: null,
  };

  beforeEach(() => {
    mockCalendarEventsUpdate.mockClear();
    mockCalendarEventsDelete.mockClear();
  });

  test("updateEvent moves the provider event start/end", async () => {
    const db = makeSelectDb(liveRow);
    mockCalendarEventsGet.mockImplementationOnce(async () => ({
      data: {
        id: "evt_123",
        summary: "Solo session with Tutor & Student",
        description:
          "Open this booking in Cogito: https://app.cogito.test/bookings/b1",
        conferenceData: {
          entryPoints: [
            { entryPointType: "video", uri: "https://meet.google.com/abc" },
          ],
        },
      },
    }));
    const provider = createGoogleMeetingProvider(config, db);
    const start = new Date("2030-02-01T08:00:00Z");
    const end = new Date("2030-02-01T09:30:00Z");

    await provider.updateEvent("b1", { startAt: start, endAt: end });

    const call = mockCalendarEventsUpdate.mock.calls.at(-1)?.[0];
    expect(call?.eventId).toBe("evt_123");
    expect(call?.calendarId).toBe("primary");
    expect(call?.sendUpdates).toBe("none");
    expect(call?.conferenceDataVersion).toBe(1);
    expect(call?.requestBody?.summary).toBe(
      "Solo session with Tutor & Student",
    );
    expect(call?.requestBody?.description).toBe(
      "Open this booking in Cogito: https://app.cogito.test/bookings/b1",
    );
    expect(call?.requestBody?.start?.dateTime).toBe(start.toISOString());
    expect(call?.requestBody?.end?.dateTime).toBe(end.toISOString());
  });

  test("updateEvent relocates an offline provider event without adding Meet", async () => {
    const db = makeSelectDb({ ...liveRow, meetingUrl: null });
    mockCalendarEventsGet.mockImplementationOnce(async () => ({
      data: {
        id: "evt_123",
        summary: "Cogito offline session",
        location: "Room A — Main Campus",
      },
    }));
    const provider = createGoogleMeetingProvider(config, db);

    await provider.updateEvent("b1", {
      location: "Room B — North Campus",
      description: "Site: North Campus\nRoom: Room B\n\nSession details",
    });

    const call = mockCalendarEventsUpdate.mock.calls.at(-1)?.[0];
    expect(call?.requestBody?.location).toBe("Room B — North Campus");
    expect(call?.requestBody?.description).toBe(
      "Site: North Campus\nRoom: Room B\n\nSession details",
    );
    expect(call?.requestBody?.conferenceData).toBeUndefined();
  });

  test("updateEvent is a no-op without a live provider event", async () => {
    const db = makeSelectDb(null);
    const provider = createGoogleMeetingProvider(config, db);

    await provider.updateEvent("b1", {
      startAt: new Date("2030-02-01T08:00:00Z"),
      endAt: new Date("2030-02-01T09:30:00Z"),
    });

    expect(mockCalendarEventsUpdate).not.toHaveBeenCalled();
  });

  test("respects an explicit sendUpdates=all config on insert/update/delete", async () => {
    const allConfig = { ...config, sendUpdates: "all" as const };
    mockCalendarEventsInsert.mockImplementationOnce(async () => ({
      data: {
        id: "evt_all",
        conferenceData: {
          entryPoints: [{ uri: "https://meet.google.com/all" }],
        },
      },
    }));
    const createdRow = {
      id: "me_all",
      bookingId: "b1",
      provider: "google_meet",
      externalEventId: "evt_all",
      meetingUrl: "https://meet.google.com/all",
      status: "created",
      errorReason: null,
    };
    const returning = mock(async () => [createdRow]);
    const values = mock(() => ({ returning }));
    const insert = mock(() => ({ values }));
    const liveRowAll = { ...createdRow };
    const db = {
      insert,
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            orderBy: mock(() => ({
              limit: mock(async () => [liveRowAll]),
            })),
          })),
        })),
      })),
      update: mock(() => ({
        set: mock(() => ({ where: mock(async () => []) })),
      })),
    } as any;

    const provider = createGoogleMeetingProvider(allConfig, db);
    await provider.createEvent("b1");
    expect(mockCalendarEventsInsert.mock.calls.at(-1)?.[0]?.sendUpdates).toBe(
      "all",
    );

    mockCalendarEventsGet.mockImplementationOnce(async () => ({
      data: { id: "evt_all" },
    }));
    await provider.updateEvent("b1", {
      startAt: new Date("2030-02-01T08:00:00Z"),
    });
    expect(mockCalendarEventsUpdate.mock.calls.at(-1)?.[0]?.sendUpdates).toBe(
      "all",
    );

    await provider.cancelEvent("b1");
    expect(mockCalendarEventsDelete.mock.calls.at(-1)?.[0]?.sendUpdates).toBe(
      "all",
    );
  });

  test("cancelEvent deletes the provider event and marks the row cancelled", async () => {
    const db = makeSelectDb(liveRow);
    const provider = createGoogleMeetingProvider(config, db);

    await provider.cancelEvent("b1");

    expect(mockCalendarEventsDelete).toHaveBeenCalledTimes(1);
    const call = mockCalendarEventsDelete.mock.calls[0]?.[0];
    expect(call?.eventId).toBe("evt_123");
    expect(call?.sendUpdates).toBe("none");
    expect(db.update).toHaveBeenCalledTimes(1);
    const setMock = db.update.mock.results[0]?.value?.set as ReturnType<
      typeof mock
    >;
    expect(setMock).toHaveBeenCalledWith({ status: "cancelled" });
  });

  test("accepted reschedule updates the same online event; only cancellation deletes it", async () => {
    const db = makeSelectDb(liveRow);
    mockCalendarEventsGet.mockImplementationOnce(async () => ({
      data: {
        id: liveRow.externalEventId,
        status: "confirmed",
        hangoutLink: liveRow.meetingUrl,
        conferenceData: {
          entryPoints: [{ entryPointType: "video", uri: liveRow.meetingUrl }],
        },
      },
    }));
    const provider = createGoogleMeetingProvider(config, db);
    const startAt = new Date("2030-03-01T08:00:00Z");
    const endAt = new Date("2030-03-01T09:30:00Z");

    await provider.updateEvent("b1", { startAt, endAt });

    expect(mockCalendarEventsUpdate).toHaveBeenCalledTimes(1);
    expect(mockCalendarEventsUpdate.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        eventId: liveRow.externalEventId,
        sendUpdates: "none",
        conferenceDataVersion: 1,
        requestBody: expect.objectContaining({
          status: "confirmed",
          hangoutLink: liveRow.meetingUrl,
          start: { dateTime: startAt.toISOString() },
          end: { dateTime: endAt.toISOString() },
        }),
      }),
    );
    expect(mockCalendarEventsDelete).not.toHaveBeenCalled();

    await provider.cancelEvent("b1");

    expect(mockCalendarEventsDelete).toHaveBeenCalledTimes(1);
    expect(mockCalendarEventsDelete.mock.calls[0]?.[0]?.eventId).toBe(
      liveRow.externalEventId,
    );
    expect(mockCalendarEventsDelete.mock.calls[0]?.[0]?.sendUpdates).toBe(
      "none",
    );
  });

  test("cancelEvent is a no-op without a live provider event", async () => {
    const db = makeSelectDb(null);
    const provider = createGoogleMeetingProvider(config, db);

    await provider.cancelEvent("b1");

    expect(mockCalendarEventsDelete).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  test("fallback provider update is a no-op; cancel marks the local row cancelled", async () => {
    const db = makeSelectDb(liveRow);
    const { createFallbackMeetingProvider } =
      await import("../../modules/meeting/fallback.provider");
    const provider = createFallbackMeetingProvider(db);

    await provider.updateEvent("b1", {
      startAt: new Date("2030-02-01T08:00:00Z"),
      endAt: new Date("2030-02-01T09:30:00Z"),
    });
    await provider.cancelEvent("b1");

    expect(mockCalendarEventsUpdate).not.toHaveBeenCalled();
    expect(mockCalendarEventsDelete).not.toHaveBeenCalled();
    expect(db.update).toHaveBeenCalledTimes(1);
    const setMock = db.update.mock.results[0]?.value?.set as ReturnType<
      typeof mock
    >;
    expect(setMock).toHaveBeenCalledWith({ status: "cancelled" });
  });

  test("setManualLink updates the latest meeting row", async () => {
    const updated = {
      ...liveRow,
      provider: "manual",
      status: "created",
      meetingUrl: "https://zoom.us/j/updated",
      errorReason: null,
    };
    const returning = mock(async () => [updated]);
    const where = mock(() => ({ returning }));
    const set = mock(() => ({ where }));
    const db = {
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            orderBy: mock(() => ({ limit: mock(async () => [liveRow]) })),
          })),
        })),
      })),
      update: mock(() => ({ set })),
      insert: mock(() => ({
        values: mock(() => ({ returning: mock(async () => []) })),
      })),
    } as any;
    const provider = createGoogleMeetingProvider(config, db);

    await expect(
      provider.setManualLink?.("b1", "https://zoom.us/j/updated"),
    ).resolves.toEqual(updated);
    expect(set).toHaveBeenCalledWith({
      provider: "manual",
      status: "created",
      meetingUrl: "https://zoom.us/j/updated",
      errorReason: null,
    });
  });

  test("setManualLink inserts a meeting row when none exists", async () => {
    const created = {
      ...liveRow,
      id: "manual-1",
      provider: "manual",
      status: "created",
      meetingUrl: "https://zoom.us/j/new",
      externalEventId: null,
      errorReason: null,
    };
    const returning = mock(async () => [created]);
    const values = mock(() => ({ returning }));
    const db = {
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            orderBy: mock(() => ({ limit: mock(async () => []) })),
          })),
        })),
      })),
      update: mock(() => ({
        set: mock(() => ({ where: mock(async () => []) })),
      })),
      insert: mock(() => ({ values })),
    } as any;
    const provider = createGoogleMeetingProvider(config, db);

    await expect(
      provider.setManualLink?.("b1", "https://zoom.us/j/new"),
    ).resolves.toEqual(created);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: "b1",
        provider: "manual",
        meetingUrl: "https://zoom.us/j/new",
        externalEventId: null,
      }),
    );
  });
});

describe("createGoogleMeetingProvider timeout", () => {
  const config = {
    authType: "service_account" as const,
    clientEmail: "test@example.com",
    privateKey: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
    calendarId: "primary",
  };

  test("createEvent handles timeout error from Promise.race", async () => {
    mockCalendarEventsInsert.mockImplementationOnce(async () => {
      throw new Error("Google Meet API timeout after 30s");
    });

    const failedRow = {
      id: "me_timeout",
      bookingId: "b1",
      provider: "google_meet",
      externalEventId: null,
      meetingUrl: null,
      status: "failed",
      errorReason: "Error: Google Meet API timeout after 30s",
    };

    const returning = mock(async () => [failedRow]);
    const values = mock(() => ({ returning }));
    const insert = mock(() => ({ values }));
    const db = { insert } as any;

    logCaptures = [];
    const provider = createGoogleMeetingProvider(config, db);
    const result = await provider.createEvent("b1");

    expect(result.status).toBe("failed");
    expect(result.errorReason).toContain("timeout");

    const errorLog = logCaptures.find(
      (e) => e.action === "google_meet_create_failed",
    );
    expect(errorLog).toBeDefined();
  });

  test("executes the service-account timeout callback", async () => {
    const originalSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((
      callback: TimerHandler,
      delay?: number,
      ...args: unknown[]
    ) => {
      if (delay === 30_000 && typeof callback === "function") {
        callback(...(args as []));
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }
      return originalSetTimeout(callback, delay, ...(args as []));
    }) as typeof setTimeout;

    const failedRow = {
      id: "me_timeout_callback",
      bookingId: "b1",
      provider: "google_meet",
      externalEventId: null,
      meetingUrl: null,
      status: "failed",
      errorReason: "Error: Google Meet API timeout after 30s",
    };
    const returning = mock(async () => [failedRow]);
    const values = mock(() => ({ returning }));
    const insert = mock(() => ({ values }));

    try {
      mockCalendarEventsInsert.mockImplementationOnce(async () => ({
        data: { id: "evt_timeout_callback" },
      }));
      const provider = createGoogleMeetingProvider(config, { insert } as any);
      const result = await provider.createEvent("b1");

      expect(result.status).toBe("failed");
      expect(result.errorReason).toContain("timeout");
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  test("executes the OAuth fetch timeout callback", async () => {
    const originalSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((
      callback: TimerHandler,
      delay?: number,
      ...args: unknown[]
    ) => {
      if (delay === 30_000 && typeof callback === "function") {
        callback(...(args as []));
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }
      return originalSetTimeout(callback, delay, ...(args as []));
    }) as typeof setTimeout;

    const oauthConfig = {
      authType: "oauth_refresh_token" as const,
      clientId: "oauth-client-id",
      clientSecret: "oauth-client-secret",
      refreshToken: "oauth-refresh-token",
      calendarId: "primary",
    };
    const row = {
      id: "me_oauth_timeout_callback",
      bookingId: "b1",
      provider: "google_meet",
      externalEventId: "evt_oauth_timeout_callback",
      meetingUrl: "https://meet.google.com/timeout-callback",
      status: "created",
      errorReason: null,
    };
    const returning = mock(async () => [row]);
    const values = mock(() => ({ returning }));
    const insert = mock(() => ({ values }));

    try {
      globalThis.fetch = mock(async (input: unknown) => {
        const url = String(input);
        if (url === "https://oauth2.googleapis.com/token") {
          return new Response(JSON.stringify({ access_token: "t-timeout" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({
            id: "evt_oauth_timeout_callback",
            conferenceData: {
              entryPoints: [
                {
                  entryPointType: "video",
                  uri: "https://meet.google.com/timeout-callback",
                },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof globalThis.fetch;

      const provider = createGoogleMeetingProvider(oauthConfig, {
        insert,
      } as any);
      const result = await provider.createEvent("b1");

      expect(result.status).toBe("created");
      expect(result.meetingUrl).toBe(
        "https://meet.google.com/timeout-callback",
      );
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });
});

describe("createGoogleMeetingProvider OAuth flows", () => {
  const config = {
    authType: "service_account" as const,
    clientEmail: "test@example.com",
    privateKey: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
    calendarId: "primary",
  };
  const oauthConfig = {
    authType: "oauth_refresh_token" as const,
    clientId: "oauth-client-id",
    clientSecret: "oauth-client-secret",
    refreshToken: "oauth-refresh-token",
    calendarId: "primary",
  };

  function makeInsertDb(row: unknown) {
    const returning = mock(async () => [row]);
    const values = mock(() => ({ returning }));
    const insert = mock(() => ({ values }));
    return { insert };
  }

  function tokenResponse(payload: unknown) {
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  beforeEach(() => {
    mockCalendarEventsInsert.mockReset();
    mockCalendarEventsGet.mockReset();
    mockCalendarEventsGet.mockImplementation(async () => ({
      data: {
        id: "evt_123",
        conferenceData: {
          entryPoints: [
            { entryPointType: "video", uri: "https://meet.google.com/abc" },
          ],
        },
      },
    }));
    mockCalendarEventsUpdate.mockReset();
    mockCalendarEventsDelete.mockReset();
  });

  test("reuses the cached OAuth token on a second createEvent call (M13)", async () => {
    let tokenCalls = 0;
    globalThis.fetch = mock(async (input: unknown) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token") {
        tokenCalls++;
        return tokenResponse({ access_token: "t1" });
      }
      if (url.includes("/events?")) {
        expect(url).toContain("sendUpdates=none");
        return tokenResponse({
          id: "evt_1",
          conferenceData: {
            entryPoints: [
              { entryPointType: "video", uri: "https://meet.google.com/1" },
            ],
          },
        });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    }) as typeof globalThis.fetch;

    const db = makeInsertDb({
      id: "me1",
      bookingId: "b1",
      provider: "google_meet",
      externalEventId: "evt_1",
      meetingUrl: "https://meet.google.com/1",
      status: "created",
      errorReason: null,
    }) as any;
    const provider = createGoogleMeetingProvider(oauthConfig, db);

    await provider.createEvent("b1");
    await provider.createEvent("b2");

    expect(tokenCalls).toBe(1);
  });

  test("createEvent fails when the token endpoint returns no access_token", async () => {
    globalThis.fetch = mock(async () =>
      tokenResponse({ error: "invalid_grant" }),
    ) as typeof globalThis.fetch;

    const db = makeInsertDb({
      id: "me1",
      bookingId: "b1",
      provider: "google_meet",
      status: "failed",
      errorReason: "invalid_grant",
    }) as any;
    const provider = createGoogleMeetingProvider(oauthConfig, db);

    const result = await provider.createEvent("b1");

    expect(result.status).toBe("failed");
    expect(result.errorReason).toContain("invalid_grant");
  });

  test("createEvent reports a non-OK OAuth calendar response", async () => {
    globalThis.fetch = mock(async (input: unknown) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token") {
        return tokenResponse({ access_token: "t-error" });
      }
      return new Response(
        JSON.stringify({ error: { message: "calendar denied" } }),
        {
          status: 403,
          headers: { "content-type": "application/json" },
        },
      );
    }) as typeof globalThis.fetch;
    const provider = createGoogleMeetingProvider(
      oauthConfig,
      makeInsertDb({
        id: "me_error",
        bookingId: "b1",
        provider: "google_meet",
        status: "failed",
        errorReason: "calendar denied",
      }) as any,
    );

    const result = await provider.createEvent("b1");

    expect(result.status).toBe("failed");
    expect(result.errorReason).toContain("calendar denied");
  });

  test("createEvent converts an OAuth AbortError into a timeout error", async () => {
    globalThis.fetch = mock(async (input: unknown) => {
      if (String(input) === "https://oauth2.googleapis.com/token") {
        return tokenResponse({ access_token: "t-timeout" });
      }
      const error = new Error("request aborted");
      error.name = "AbortError";
      throw error;
    }) as typeof globalThis.fetch;
    const provider = createGoogleMeetingProvider(
      oauthConfig,
      makeInsertDb({
        id: "me_timeout",
        bookingId: "b1",
        provider: "google_meet",
        status: "failed",
        errorReason: "timeout",
      }) as any,
    );

    const result = await provider.createEvent("b1");

    expect(result.status).toBe("failed");
    expect(result.errorReason).toContain("Google Meet API timeout after 30s");
  });

  test("probes OAuth calendar connectivity", async () => {
    globalThis.fetch = mock(async (input: unknown) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token") {
        return tokenResponse({ access_token: "t-probe" });
      }
      return tokenResponse({ items: [] });
    }) as typeof globalThis.fetch;
    const provider = createGoogleMeetingProvider(oauthConfig, {} as any);

    await expect(provider.probe?.()).resolves.toEqual({ ok: true });
  });

  test("returns a failed OAuth probe when Calendar rejects the request", async () => {
    globalThis.fetch = mock(async (input: unknown) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token") {
        return tokenResponse({ access_token: "t-probe-fail" });
      }
      return new Response(
        JSON.stringify({ error_description: "probe denied" }),
        {
          status: 401,
          headers: { "content-type": "application/json" },
        },
      );
    }) as typeof globalThis.fetch;
    const provider = createGoogleMeetingProvider(oauthConfig, {} as any);

    await expect(provider.probe?.()).resolves.toEqual({
      ok: false,
      error: "Error: probe denied",
    });
  });

  test("createEvent fails fast when the OAuth config is incomplete", async () => {
    const db = makeInsertDb({
      id: "me1",
      bookingId: "b1",
      provider: "google_meet",
      status: "failed",
      errorReason: "Missing Google Meet OAuth configuration",
    }) as any;
    const provider = createGoogleMeetingProvider(
      { authType: "oauth_refresh_token", calendarId: "primary" },
      db,
    );

    const result = await provider.createEvent("b1");

    expect(result.status).toBe("failed");
    expect(result.errorReason).toContain(
      "Missing Google Meet OAuth configuration",
    );
  });

  test("updateEvent moves a live provider event via the OAuth API", async () => {
    const methods: string[] = [];
    const updateUrls: string[] = [];
    globalThis.fetch = mock(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token") {
        return tokenResponse({ access_token: "t1" });
      }
      if (url.includes("/events/evt_oauth1")) {
        methods.push(init?.method ?? "GET");
        if (init?.method === "GET") {
          return tokenResponse({ id: "evt_oauth1" });
        }
        updateUrls.push(url);
        return tokenResponse({ id: "evt_oauth1", status: "confirmed" });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    }) as typeof globalThis.fetch;

    const liveRow = {
      id: "me1",
      bookingId: "b1",
      provider: "google_meet",
      externalEventId: "evt_oauth1",
      meetingUrl: "https://meet.google.com/oauth1",
      status: "created",
      errorReason: null,
    };
    const db = {
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            orderBy: mock(() => ({
              limit: mock(async () => [liveRow]),
            })),
          })),
        })),
      })),
      update: mock(() => ({
        set: mock(() => ({ where: mock(async () => []) })),
      })),
      insert: mock(() => ({
        values: mock(() => ({ returning: mock(async () => []) })),
      })),
    } as any;

    const provider = createGoogleMeetingProvider(oauthConfig, db);
    await provider.updateEvent("b1", {
      startAt: new Date("2030-02-01T08:00:00Z"),
      endAt: new Date("2030-02-01T09:00:00Z"),
    });

    expect(methods).toEqual(["GET", "PUT"]);
    expect(updateUrls).toHaveLength(1);
    const updateUrl = new URL(updateUrls[0]!);
    expect(updateUrl.searchParams.get("sendUpdates")).toBe("none");
    expect(updateUrl.searchParams.get("conferenceDataVersion")).toBe("1");
  });

  test("OAuth insert honors an explicit sendUpdates=all config", async () => {
    const allOauthConfig = { ...oauthConfig, sendUpdates: "all" as const };
    let insertUrl = "";
    globalThis.fetch = mock(async (input: unknown) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token") {
        return tokenResponse({ access_token: "t-all" });
      }
      insertUrl = url;
      return tokenResponse({
        id: "evt_all",
        conferenceData: {
          entryPoints: [
            { entryPointType: "video", uri: "https://meet.google.com/all" },
          ],
        },
      });
    }) as typeof globalThis.fetch;
    const db = makeInsertDb({
      id: "me_all",
      bookingId: "b1",
      provider: "google_meet",
      externalEventId: "evt_all",
      meetingUrl: "https://meet.google.com/all",
      status: "created",
      errorReason: null,
    }) as any;

    const provider = createGoogleMeetingProvider(allOauthConfig, db);
    await provider.createEvent("b1");

    expect(new URL(insertUrl).searchParams.get("sendUpdates")).toBe("all");
  });

  test("cancelEvent deletes a live provider event via the OAuth API and marks the row cancelled", async () => {
    const methods: string[] = [];
    const deleteUrls: string[] = [];
    globalThis.fetch = mock(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token") {
        return tokenResponse({ access_token: "t1" });
      }
      if (url.includes("/events/evt_oauth2")) {
        methods.push(init?.method ?? "GET");
        deleteUrls.push(url);
        return new Response("", { status: 200 });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    }) as typeof globalThis.fetch;

    const liveRow = {
      id: "me2",
      bookingId: "b1",
      provider: "google_meet",
      externalEventId: "evt_oauth2",
      meetingUrl: "https://meet.google.com/oauth2",
      status: "created",
      errorReason: null,
    };
    const update = mock(() => ({
      set: mock(() => ({ where: mock(async () => []) })),
    }));
    const db = {
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            orderBy: mock(() => ({
              limit: mock(async () => [liveRow]),
            })),
          })),
        })),
      })),
      update,
      insert: mock(() => ({
        values: mock(() => ({ returning: mock(async () => []) })),
      })),
    } as any;

    const provider = createGoogleMeetingProvider(oauthConfig, db);
    await provider.cancelEvent("b1");

    expect(methods).toEqual(["DELETE"]);
    expect(new URL(deleteUrls[0]!).searchParams.get("sendUpdates")).toBe(
      "none",
    );
    expect(update).toHaveBeenCalledTimes(1);
  });

  test("updateEvent logs an error when the calendar update throws", async () => {
    mockCalendarEventsUpdate.mockImplementation(async () => {
      throw new Error("update failed");
    });

    const liveRow = {
      id: "me1",
      bookingId: "b1",
      provider: "google_meet",
      externalEventId: "evt_123",
      meetingUrl: "https://meet.google.com/abc",
      status: "created",
      errorReason: null,
    };
    const db = {
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            orderBy: mock(() => ({
              limit: mock(async () => [liveRow]),
            })),
          })),
        })),
      })),
      update: mock(() => ({
        set: mock(() => ({ where: mock(async () => []) })),
      })),
      insert: mock(() => ({
        values: mock(() => ({ returning: mock(async () => []) })),
      })),
    } as any;

    logCaptures = [];
    const provider = createGoogleMeetingProvider(config, db);
    await provider.updateEvent("b1", {
      startAt: new Date("2030-02-01T08:00:00Z"),
    });

    const errorLog = logCaptures.find(
      (e) => e.action === "google_meet_update_failed",
    );
    expect(errorLog).toBeDefined();
  });

  test("updateEvent trips the circuit breaker after repeated failures", async () => {
    mockCalendarEventsUpdate.mockImplementation(async () => {
      throw new Error("boom");
    });

    const liveRow = {
      id: "me1",
      bookingId: "b1",
      provider: "google_meet",
      externalEventId: "evt_123",
      meetingUrl: "https://meet.google.com/abc",
      status: "created",
      errorReason: null,
    };
    const db = {
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            orderBy: mock(() => ({
              limit: mock(async () => [liveRow]),
            })),
          })),
        })),
      })),
      update: mock(() => ({
        set: mock(() => ({ where: mock(async () => []) })),
      })),
      insert: mock(() => ({
        values: mock(() => ({ returning: mock(async () => []) })),
      })),
    } as any;

    const provider = createGoogleMeetingProvider(config, db);
    for (let i = 0; i < 5; i++) {
      await provider.updateEvent("b1", {
        startAt: new Date("2030-02-01T08:00:00Z"),
      });
    }
    expect(mockCalendarEventsUpdate).toHaveBeenCalledTimes(5);

    await provider.updateEvent("b1", {
      startAt: new Date("2030-02-01T08:00:00Z"),
    });
    expect(mockCalendarEventsUpdate).toHaveBeenCalledTimes(5);
  });

  test("cancelEvent logs an error when the calendar delete throws", async () => {
    mockCalendarEventsDelete.mockImplementation(async () => {
      throw new Error("delete failed");
    });

    const liveRow = {
      id: "me1",
      bookingId: "b1",
      provider: "google_meet",
      externalEventId: "evt_123",
      meetingUrl: "https://meet.google.com/abc",
      status: "created",
      errorReason: null,
    };
    const db = {
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            orderBy: mock(() => ({
              limit: mock(async () => [liveRow]),
            })),
          })),
        })),
      })),
      update: mock(() => ({
        set: mock(() => ({ where: mock(async () => []) })),
      })),
      insert: mock(() => ({
        values: mock(() => ({ returning: mock(async () => []) })),
      })),
    } as any;

    logCaptures = [];
    const provider = createGoogleMeetingProvider(config, db);
    await provider.cancelEvent("b1");

    const errorLog = logCaptures.find(
      (e) => e.action === "google_meet_cancel_failed",
    );
    expect(errorLog).toBeDefined();
  });

  test("polls for the Meet URL when the insert has no immediate URL", async () => {
    mockCalendarEventsInsert.mockImplementation(async () => ({
      data: { id: "evt_poll" },
    }));
    mockCalendarEventsGet.mockImplementation(async () => ({
      data: {
        id: "evt_poll",
        conferenceData: {
          entryPoints: [
            { entryPointType: "video", uri: "https://meet.google.com/polled" },
          ],
        },
      },
    }));

    const createdRow = {
      id: "me1",
      bookingId: "b1",
      provider: "google_meet",
      externalEventId: "evt_poll",
      meetingUrl: "https://meet.google.com/polled",
      status: "created",
      errorReason: null,
    };
    const db = makeInsertDb(createdRow) as any;

    const provider = createGoogleMeetingProvider(config, db);
    const result = await provider.createEvent("b1");

    expect(result.status).toBe("created");
    expect(result.meetingUrl).toBe("https://meet.google.com/polled");
  });

  test("returns a created event when polling never yields a Meet URL", async () => {
    mockCalendarEventsInsert.mockImplementation(async () => ({
      data: { id: "evt_no_url" },
    }));
    mockCalendarEventsGet.mockImplementation(async () => ({
      data: { id: "evt_no_url" },
    }));

    const originalSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((
      callback: TimerHandler,
      delay?: number,
      ...args: unknown[]
    ) => {
      if (delay === 750 && typeof callback === "function") {
        callback(...(args as []));
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }
      return originalSetTimeout(callback, delay, ...(args as []));
    }) as typeof setTimeout;
    try {
      const createdRow = {
        id: "me_no_url",
        bookingId: "b1",
        provider: "google_meet",
        externalEventId: "evt_no_url",
        meetingUrl: null,
        status: "created",
        errorReason: null,
      };
      const db = makeInsertDb(createdRow) as any;
      const provider = createGoogleMeetingProvider(config, db);
      const result = await provider.createEvent("b1");

      expect(result.status).toBe("created");
      expect(result.meetingUrl).toBeNull();
      expect(mockCalendarEventsGet).toHaveBeenCalledTimes(8);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });
});

describe("createGoogleMeetingProvider academy class events", () => {
  const config = {
    authType: "service_account" as const,
    clientEmail: "test@example.com",
    privateKey: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
    calendarId: "primary",
  };

  test("updateEvent skips empty changes before reading the booking event", async () => {
    const select = mock(() => {
      throw new Error("Empty changes must not read the booking event");
    });
    const provider = createGoogleMeetingProvider(config, { select } as never);

    await provider.updateEvent("booking-1", {});

    expect(select).not.toHaveBeenCalled();
  });

  test("class update treats a cancelled service-account event as missing", async () => {
    mockCalendarEventsGet.mockReset();
    mockCalendarEventsGet.mockImplementationOnce(async () => ({
      data: { id: "cancelled-class-event", status: "cancelled" },
    }));
    const provider = createGoogleMeetingProvider(config, {} as never);

    await expect(
      provider.updateAcademyClassEvent!(
        "cancelled-class-event",
        "session-cancelled",
        new Date("2035-02-01T10:00:00.000Z"),
        new Date("2035-02-01T11:00:00.000Z"),
      ),
    ).rejects.toMatchObject({ code: 410, missingClassEvent: true });
  });

  test("OAuth class update treats a cancelled event as missing", async () => {
    globalThis.fetch = mock(async (input: unknown) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token")
        return new Response(
          JSON.stringify({ access_token: "class-update-token" }),
          { status: 200 },
        );
      return new Response(
        JSON.stringify({ id: "oauth-cancelled-class", status: "cancelled" }),
        { status: 200 },
      );
    }) as typeof fetch;
    const provider = createGoogleMeetingProvider(
      {
        authType: "oauth_refresh_token",
        clientId: "client-id",
        clientSecret: "client-secret",
        refreshToken: "refresh-token",
        calendarId: "primary",
      },
      {} as never,
    );

    await expect(
      provider.updateAcademyClassEvent!(
        "oauth-cancelled-class",
        "session-oauth-cancelled",
        new Date("2035-02-01T10:00:00.000Z"),
        new Date("2035-02-01T11:00:00.000Z"),
      ),
    ).rejects.toMatchObject({ code: 410, missingClassEvent: true });
  });

  test("resumes a cancelled OAuth class event as a missing event", async () => {
    globalThis.fetch = mock(async (input: unknown) => {
      if (String(input) === "https://oauth2.googleapis.com/token")
        return new Response(
          JSON.stringify({ access_token: "class-resume-token" }),
          { status: 200 },
        );
      return new Response(
        JSON.stringify({ id: "cancelled-resume-event", status: "cancelled" }),
        { status: 200 },
      );
    }) as typeof fetch;
    const provider = createGoogleMeetingProvider(
      {
        authType: "oauth_refresh_token",
        clientId: "client-id",
        clientSecret: "client-secret",
        refreshToken: "refresh-token",
        calendarId: "primary",
      },
      {} as never,
    );

    const result = await provider.createAcademyClassEvent!(
      "session-resume-cancelled",
      new Date("2035-02-01T10:00:00.000Z"),
      new Date("2035-02-01T11:00:00.000Z"),
      undefined,
      {
        title: "Resume cancelled class event",
        externalEventId: "cancelled-resume-event",
        creationGeneration: 2,
      },
    );

    expect(result).toMatchObject({ status: "failed", missingEvent: true });
  });

  test.each([
    ["cancelled tombstone", 200, { id: "existing", status: "cancelled" }, true],
    ["temporary lookup failure", 503, { error: "unavailable" }, false],
  ] as const)(
    "OAuth idempotent class insert handles a %s lookup",
    async (_label, lookupStatus, lookupPayload, missingEvent) => {
      const sessionId = `session-oauth-idempotent-${lookupStatus}`;
      const idempotencyKey = `academy-class-session:${sessionId}:generation:2`;
      const providerEventId = `cogito${createHash("sha256")
        .update(idempotencyKey)
        .digest("hex")}`;
      const calls: Array<{ url: string; method: string }> = [];
      globalThis.fetch = mock(async (input: unknown, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        calls.push({ url, method });
        if (url === "https://oauth2.googleapis.com/token")
          return new Response(
            JSON.stringify({ access_token: "idempotent-class-token" }),
            { status: 200 },
          );
        if (method === "POST")
          return new Response(JSON.stringify({ error: "already exists" }), {
            status: 409,
          });
        return new Response(JSON.stringify(lookupPayload), {
          status: lookupStatus,
        });
      }) as typeof fetch;
      const provider = createGoogleMeetingProvider(
        {
          authType: "oauth_refresh_token",
          clientId: "client-id",
          clientSecret: "client-secret",
          refreshToken: "refresh-token",
          calendarId: "primary",
        },
        {} as never,
      );

      const result = await provider.createAcademyClassEvent!(
        sessionId,
        new Date("2035-02-01T10:00:00.000Z"),
        new Date("2035-02-01T11:00:00.000Z"),
        undefined,
        { title: "Retry class event", creationGeneration: 2 },
      );

      expect(calls.map(({ method }) => method)).toEqual([
        "POST",
        "POST",
        "GET",
      ]);
      expect(calls.at(-1)?.url).toContain(encodeURIComponent(providerEventId));
      expect(result.status).toBe("failed");
      expect(result.missingEvent ?? false).toBe(missingEvent);
    },
  );

  test("class cancellation requires an event or session identity", async () => {
    const provider = createGoogleMeetingProvider(config, {} as never);

    await expect(provider.cancelAcademyClassEvent!(null)).rejects.toThrow(
      "Class event cancellation requires a provider or session identity",
    );
  });

  test("reuses a stable Google event ID after an ambiguous successful insert", async () => {
    mockCalendarEventsInsert.mockReset();
    mockCalendarEventsGet.mockReset();
    mockCalendarEventsInsert.mockImplementationOnce(async () => ({
      data: {
        id: "stable-class-event",
        conferenceData: {
          entryPoints: [
            { entryPointType: "video", uri: "https://meet.google.com/class" },
          ],
        },
      },
    }));
    mockCalendarEventsInsert.mockImplementationOnce(async () => {
      throw Object.assign(new Error("Google Calendar returned 409"), {
        code: 409,
      });
    });
    mockCalendarEventsGet.mockImplementationOnce(async () => ({
      data: {
        id: "stable-class-event",
        conferenceData: {
          entryPoints: [
            { entryPointType: "video", uri: "https://meet.google.com/class" },
          ],
        },
      },
    }));

    const localInsert = mock(() => ({
      values: mock(() => ({ returning: mock(async () => []) })),
    }));
    const provider = createGoogleMeetingProviderWithFallback(config, {
      insert: localInsert,
    } as any);
    const sessionId = "class-session-retry";
    const startAt = new Date("2035-02-01T10:00:00.000Z");
    const endAt = new Date("2035-02-01T11:00:00.000Z");

    const first = await provider.createAcademyClassEvent!(
      sessionId,
      startAt,
      endAt,
      { email: "tutor@example.com", name: "Test Tutor" },
      { title: "Cogito class retry" },
    );
    const retry = await provider.createAcademyClassEvent!(
      sessionId,
      startAt,
      endAt,
      { email: "tutor@example.com", name: "Test Tutor" },
      { title: "Cogito class retry" },
    );

    const firstRequest = mockCalendarEventsInsert.mock.calls[0]?.[0] as
      | {
          requestBody?: {
            id?: string;
            conferenceData?: { createRequest?: { requestId?: string } };
          };
        }
      | undefined;
    const retryRequest = mockCalendarEventsInsert.mock.calls[1]?.[0] as
      | {
          requestBody?: {
            id?: string;
            conferenceData?: { createRequest?: { requestId?: string } };
          };
        }
      | undefined;
    expect(first.status).toBe("created");
    expect(retry.status).toBe("created");
    expect(retry.externalEventId).toBe(first.externalEventId);
    expect(firstRequest?.requestBody?.id).toBe(retryRequest?.requestBody?.id);
    expect(
      firstRequest?.requestBody?.conferenceData?.createRequest?.requestId,
    ).toBe(retryRequest?.requestBody?.conferenceData?.createRequest?.requestId);
    expect(mockCalendarEventsGet).toHaveBeenCalledTimes(1);
    expect(localInsert).not.toHaveBeenCalled();
  });

  for (const missing of [
    { label: "404", status: 404, tombstone: false },
    { label: "410", status: 410, tombstone: false },
    { label: "cancelled tombstone", status: 410, tombstone: true },
  ]) {
    test(`recreates a missing class event with one durable generation after ${missing.label}`, async () => {
      mockCalendarEventsInsert.mockReset();
      mockCalendarEventsGet.mockReset();
      mockCalendarEventsDelete.mockReset();

      const sessionId = `class-session-recreate-${missing.label.replaceAll(" ", "-")}`;
      const firstKey = `academy-class-session:${sessionId}`;
      const nextKey = `${firstKey}:generation:2`;
      const oldEventId = `cogito${createHash("sha256").update(firstKey).digest("hex")}`;
      const nextEventId = `cogito${createHash("sha256").update(nextKey).digest("hex")}`;
      const calendarEvents = new Map<string, Record<string, unknown>>();
      calendarEvents.set(oldEventId, { id: oldEventId, status: "cancelled" });
      let acceptedResponseLost = false;

      mockCalendarEventsGet.mockImplementation(async () => {
        const request = mockCalendarEventsGet.mock.calls.at(-1)?.[0] as
          | { eventId?: string }
          | undefined;
        if (request?.eventId === oldEventId) {
          if (missing.tombstone)
            return { data: { id: oldEventId, status: "cancelled" } };
          throw Object.assign(new Error("Stored event is gone"), {
            response: { status: missing.status },
          });
        }
        const event = calendarEvents.get(request?.eventId ?? "");
        if (!event)
          throw Object.assign(new Error("Event not found"), { code: 404 });
        return { data: event };
      });
      mockCalendarEventsInsert.mockImplementation(async () => {
        const request = mockCalendarEventsInsert.mock.calls.at(-1)?.[0] as
          | {
              requestBody?: {
                id?: string;
                attendees?: Array<{ email: string; displayName?: string }>;
                conferenceData?: {
                  createRequest?: { requestId?: string };
                };
              };
            }
          | undefined;
        const eventId = request?.requestBody?.id;
        if (eventId && calendarEvents.has(eventId))
          throw Object.assign(
            new Error("Requested identifier already exists"),
            {
              code: 409,
            },
          );
        const created = {
          ...request?.requestBody,
          id: eventId,
          status: "confirmed",
          conferenceData: {
            ...request?.requestBody?.conferenceData,
            entryPoints: [
              {
                entryPointType: "video",
                uri: "https://meet.google.com/generation-two",
              },
            ],
          },
        };
        if (eventId) calendarEvents.set(eventId, created);
        if (!acceptedResponseLost) {
          acceptedResponseLost = true;
          throw Object.assign(
            new Error("Google accepted the insert but its response was lost"),
            { code: 503 },
          );
        }
        return { data: created };
      });
      mockCalendarEventsDelete.mockImplementation(async () => {
        const request = mockCalendarEventsDelete.mock.calls.at(-1)?.[0] as
          | { eventId?: string }
          | undefined;
        const event = calendarEvents.get(request?.eventId ?? "");
        if (event && request?.eventId)
          calendarEvents.set(request.eventId, {
            ...event,
            status: "cancelled",
          });
        return { data: "" };
      });

      const localInsert = mock(() => ({
        values: mock(() => ({ returning: mock(async () => []) })),
      }));
      const provider = createGoogleMeetingProvider(config, {
        insert: localInsert,
      } as any);
      const startAt = new Date("2035-02-01T10:00:00.000Z");
      const endAt = new Date("2035-02-01T11:00:00.000Z");
      const attendee = { email: "tutor@example.com", name: "Test Tutor" };
      const stale = await provider.createAcademyClassEvent!(
        sessionId,
        startAt,
        endAt,
        attendee,
        {
          title: "Cogito class recreation",
          creationGeneration: 1,
          externalEventId: oldEventId,
        },
      );
      expect(stale).toMatchObject({
        status: "failed",
        externalEventId: null,
        missingEvent: true,
      });

      const nextDetails = {
        title: "Cogito class recreation",
        creationGeneration: 2,
      };
      const accepted = await provider.createAcademyClassEvent!(
        sessionId,
        startAt,
        endAt,
        attendee,
        nextDetails,
      );
      expect(accepted.status).toBe("failed");
      const retry = await provider.createAcademyClassEvent!(
        sessionId,
        startAt,
        endAt,
        attendee,
        nextDetails,
      );

      expect(retry).toMatchObject({
        status: "created",
        externalEventId: nextEventId,
        meetingUrl: "https://meet.google.com/generation-two",
      });
      expect(
        [...calendarEvents.values()].filter(
          (event) => event.status === "confirmed",
        ),
      ).toHaveLength(1);
      expect(calendarEvents.get(nextEventId)).toMatchObject({
        attendees: [{ email: attendee.email, displayName: attendee.name }],
        conferenceData: { createRequest: { requestId: nextKey } },
      });
      expect(mockCalendarEventsInsert).toHaveBeenCalledTimes(2);
      for (const call of mockCalendarEventsInsert.mock.calls) {
        const request = call[0] as {
          requestBody?: {
            id?: string;
            conferenceData?: { createRequest?: { requestId?: string } };
          };
        };
        expect(request.requestBody?.id).toBe(nextEventId);
        expect(
          request.requestBody?.conferenceData?.createRequest?.requestId,
        ).toBe(nextKey);
      }

      await provider.cancelAcademyClassEvent!(nextEventId, sessionId, 2);
      expect(mockCalendarEventsDelete).toHaveBeenCalledWith({
        calendarId: "primary",
        eventId: nextEventId,
        sendUpdates: "none",
      });
      expect(
        [...calendarEvents.values()].filter(
          (event) => event.status === "confirmed",
        ),
      ).toHaveLength(0);
      expect(localInsert).not.toHaveBeenCalled();
    });
  }

  test("resumes the accepted event until the pending Meet link is available", async () => {
    mockCalendarEventsInsert.mockReset();
    mockCalendarEventsGet.mockReset();
    const sessionId = "class-session-pending-link";
    const externalEventId = `cogito${createHash("sha256")
      .update(`academy-class-session:${sessionId}`)
      .digest("hex")}`;
    mockCalendarEventsInsert.mockImplementationOnce(async () => ({
      data: {
        id: externalEventId,
        conferenceData: { createRequest: { status: "pending" } },
      },
    }));
    for (let attempt = 0; attempt < 8; attempt += 1) {
      mockCalendarEventsGet.mockImplementationOnce(async () => ({
        data: {
          id: externalEventId,
          conferenceData: { createRequest: { status: "pending" } },
        },
      }));
    }
    mockCalendarEventsGet.mockImplementationOnce(async () => ({
      data: {
        id: externalEventId,
        conferenceData: {
          entryPoints: [
            {
              entryPointType: "video",
              uri: "https://meet.google.com/pending-link-ready",
            },
          ],
        },
      },
    }));

    const originalSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((
      callback: TimerHandler,
      delay?: number,
      ...args: unknown[]
    ) => {
      if (delay === 750 && typeof callback === "function") {
        callback(...(args as []));
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }
      return originalSetTimeout(callback, delay, ...(args as []));
    }) as typeof setTimeout;

    try {
      const localInsert = mock(() => ({
        values: mock(() => ({ returning: mock(async () => []) })),
      }));
      const provider = createGoogleMeetingProvider(config, {
        insert: localInsert,
      } as any);
      const startAt = new Date("2035-02-01T10:00:00.000Z");
      const endAt = new Date("2035-02-01T11:00:00.000Z");
      const details = { title: "Pending class link" };
      const pending = await provider.createAcademyClassEvent(
        sessionId,
        startAt,
        endAt,
        undefined,
        details,
      );
      const ready = await provider.createAcademyClassEvent(
        sessionId,
        startAt,
        endAt,
        undefined,
        { ...details, externalEventId: pending.externalEventId ?? undefined },
      );
      const firstRequest = mockCalendarEventsInsert.mock.calls[0]?.[0] as
        | { requestBody?: { id?: string } }
        | undefined;

      expect(pending.status).toBe("failed");
      expect(pending.externalEventId).toBe(externalEventId);
      expect(pending.meetingUrl).toBeNull();
      expect(ready.status).toBe("created");
      expect(ready.externalEventId).toBe(externalEventId);
      expect(ready.meetingUrl).toBe(
        "https://meet.google.com/pending-link-ready",
      );
      expect(firstRequest?.requestBody?.id).toBe(externalEventId);
      expect(mockCalendarEventsInsert).toHaveBeenCalledTimes(1);
      expect(mockCalendarEventsGet).toHaveBeenCalledTimes(9);
      expect(localInsert).not.toHaveBeenCalled();
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  test("updates the class event by its external ID without a booking-row lookup", async () => {
    mockCalendarEventsGet.mockReset();
    mockCalendarEventsUpdate.mockReset();
    const currentEvent = {
      id: "class-calendar-event-42",
      summary: "Cogito class: debate",
      attendees: [{ email: "tutor@example.com" }],
      conferenceData: {
        entryPoints: [
          { entryPointType: "video", uri: "https://meet.google.com/kept" },
        ],
      },
      start: { dateTime: "2035-02-01T10:00:00.000Z" },
      end: { dateTime: "2035-02-01T11:00:00.000Z" },
    };
    mockCalendarEventsGet.mockImplementationOnce(async () => ({
      data: currentEvent,
    }));
    const select = mock(() => {
      throw new Error("Class event must not query meetingEvent.bookingId");
    });
    const provider = createGoogleMeetingProvider(config, { select } as never);
    const startAt = new Date("2035-02-08T10:00:00.000Z");
    const endAt = new Date("2035-02-08T11:00:00.000Z");

    await provider.updateAcademyClassEvent!(
      "class-calendar-event-42",
      "session-42",
      startAt,
      endAt,
    );

    expect(select).not.toHaveBeenCalled();
    expect(mockCalendarEventsGet).toHaveBeenCalledWith({
      calendarId: "primary",
      eventId: "class-calendar-event-42",
    });
    expect(mockCalendarEventsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: "primary",
        eventId: "class-calendar-event-42",
        requestBody: expect.objectContaining({
          summary: currentEvent.summary,
          attendees: currentEvent.attendees,
          conferenceData: currentEvent.conferenceData,
          start: { dateTime: startAt.toISOString() },
          end: { dateTime: endAt.toISOString() },
        }),
      }),
    );
  });

  test("class update propagates provider failure for durable worker retry", async () => {
    mockCalendarEventsGet.mockReset();
    mockCalendarEventsUpdate.mockReset();
    mockCalendarEventsGet.mockImplementationOnce(async () => ({
      data: { id: "class-calendar-event-503" },
    }));
    mockCalendarEventsUpdate.mockImplementationOnce(async () => {
      throw Object.assign(new Error("Provider temporarily unavailable"), {
        code: 503,
      });
    });
    const provider = createGoogleMeetingProvider(config, {} as never);

    await expect(
      provider.updateAcademyClassEvent!(
        "class-calendar-event-503",
        "session-503",
        new Date("2035-02-08T10:00:00.000Z"),
        new Date("2035-02-08T11:00:00.000Z"),
      ),
    ).rejects.toThrow("temporarily unavailable");
  });

  test("OAuth class update PUTs the supplied external event ID and new times", async () => {
    const currentEvent = {
      id: "oauth-class-event",
      summary: "Cogito class: debate",
      attendees: [{ email: "tutor@example.com" }],
      conferenceData: {
        entryPoints: [
          { entryPointType: "video", uri: "https://meet.google.com/kept" },
        ],
      },
    };
    const calls: Array<{
      method: string;
      url: string;
      body: string | undefined;
    }> = [];
    globalThis.fetch = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({
        method,
        url,
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      if (url === "https://oauth2.googleapis.com/token")
        return new Response(
          JSON.stringify({ access_token: "synthetic-token", expires_in: 3600 }),
          { status: 200 },
        );
      return new Response(JSON.stringify(currentEvent), { status: 200 });
    }) as typeof fetch;
    const select = mock(() => {
      throw new Error("Class event must not query meetingEvent.bookingId");
    });
    const provider = createGoogleMeetingProvider(
      {
        authType: "oauth_refresh_token",
        calendarId: "primary",
        clientId: "synthetic-client",
        clientSecret: "synthetic-secret",
        refreshToken: "synthetic-refresh-token",
      },
      { select } as never,
    );
    const startAt = new Date("2035-02-15T10:00:00.000Z");
    const endAt = new Date("2035-02-15T11:00:00.000Z");

    await provider.updateAcademyClassEvent!(
      "oauth-class-event",
      "session-oauth",
      startAt,
      endAt,
    );

    expect(select).not.toHaveBeenCalled();
    expect(calls.map(({ method }) => method)).toEqual(["POST", "GET", "PUT"]);
    expect(calls[1]?.url).toContain("/events/oauth-class-event");
    expect(calls[2]?.url).toContain("/events/oauth-class-event?");
    expect(JSON.parse(calls[2]?.body ?? "{}")).toMatchObject({
      summary: currentEvent.summary,
      attendees: currentEvent.attendees,
      conferenceData: currentEvent.conferenceData,
      start: { dateTime: startAt.toISOString() },
      end: { dateTime: endAt.toISOString() },
    });
  });
});

describe("durable class event deletion", () => {
  const config = {
    authType: "service_account" as const,
    clientEmail: "test@example.test",
    privateKey: "synthetic",
    calendarId: "primary",
    sendUpdates: "all" as const,
  };
  test("deletes the exact class event and propagates retryable failures", async () => {
    mockCalendarEventsDelete.mockReset();
    mockCalendarEventsDelete.mockImplementationOnce(async () => ({ data: "" }));
    const provider = createGoogleMeetingProvider(config, {} as never);
    await provider.cancelAcademyClassEvent!("class-event-001");
    expect(mockCalendarEventsDelete).toHaveBeenCalledWith({
      calendarId: "primary",
      eventId: "class-event-001",
      sendUpdates: "all",
    });
    mockCalendarEventsDelete.mockImplementationOnce(async () => {
      throw Object.assign(new Error("Provider temporarily unavailable"), {
        code: 503,
      });
    });
    await expect(
      provider.cancelAcademyClassEvent!("class-event-001"),
    ).rejects.toThrow("temporarily unavailable");
  });
  test.each([404, 410])(
    "already deleted class event (%i) is an idempotent success",
    async (code) => {
      mockCalendarEventsDelete.mockReset();
      mockCalendarEventsDelete.mockImplementationOnce(async () => {
        throw Object.assign(new Error("Event absent"), {
          response: { status: code },
        });
      });
      const provider = createGoogleMeetingProvider(config, {} as never);
      await expect(
        provider.cancelAcademyClassEvent!("already-deleted"),
      ).resolves.toBeUndefined();
    },
  );
  test("an ambiguous class create can be deleted using its stable session identity", async () => {
    mockCalendarEventsDelete.mockReset();
    mockCalendarEventsDelete.mockImplementationOnce(async () => ({ data: "" }));
    const provider = createGoogleMeetingProvider(config, {} as never);
    await provider.cancelAcademyClassEvent!(null, "stable-session");
    expect(mockCalendarEventsDelete).toHaveBeenCalledWith({
      calendarId: "primary",
      eventId: `cogito${createHash("sha256").update("academy-class-session:stable-session").digest("hex")}`,
      sendUpdates: "all",
    });
  });
  test("OAuth deletion preserves HTTP status for idempotent absence handling", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url = String(input);
      calls.push(`${init?.method} ${url}`);
      if (url === "https://oauth2.googleapis.com/token")
        return new Response(
          JSON.stringify({ access_token: "synthetic-token", expires_in: 3600 }),
          { status: 200 },
        );
      return new Response(JSON.stringify({ error: { message: "Not found" } }), {
        status: 404,
      });
    }) as typeof fetch;
    const provider = createGoogleMeetingProvider(
      {
        authType: "oauth_refresh_token",
        calendarId: "primary",
        clientId: "synthetic",
        clientSecret: "synthetic",
        refreshToken: "synthetic",
        sendUpdates: "all",
      },
      {} as never,
    );
    await expect(
      provider.cancelAcademyClassEvent!("event / id"),
    ).resolves.toBeUndefined();
    expect(
      calls.some(
        (url) =>
          url.includes("DELETE ") &&
          url.includes("event%20%2F%20id?sendUpdates=all"),
      ),
    ).toBe(true);
  });
});
