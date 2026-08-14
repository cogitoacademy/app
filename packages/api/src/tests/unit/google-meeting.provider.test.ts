import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";

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
    const result = await provider.createEvent("b1");

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
    await provider.createEvent("b1", undefined, undefined, [
      { email: "tutor@example.com", name: "Tutor" },
      { email: "student@example.com" },
    ]);

    const insertCall = mockCalendarEventsInsert.mock.calls.at(-1)?.[0];
    expect(insertCall?.requestBody?.attendees).toEqual([
      { email: "tutor@example.com", displayName: "Tutor" },
      { email: "student@example.com" },
    ]);

    const insertValues = values.mock.calls[0]?.[0] as {
      attendeeEmails: string[] | null;
    };
    expect(insertValues.attendeeEmails).toEqual([
      "tutor@example.com",
      "student@example.com",
    ]);
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
    const result = await provider.createEvent("b1");

    expect(result.bookingId).toBe("b1");
    expect(result.provider).toBe("google_meet");
    expect(result.status).toBe("failed");
    expect(result.errorReason).toBeDefined();

    const errorLog = logCaptures.find(
      (e) => e.action === "google_meet_create_failed",
    );
    expect(errorLog).toBeDefined();
  });

  test("createEvent creates event with OAuth refresh token flow", async () => {
    const config = {
      authType: "oauth_refresh_token" as const,
      clientId: "oauth-client-id",
      clientSecret: "oauth-client-secret",
      refreshToken: "oauth-refresh-token",
      calendarId: "primary",
    };

    globalThis.fetch = mock(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "https://oauth2.googleapis.com/token") {
        return new Response(
          JSON.stringify({ access_token: "oauth-access-token" }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (
        url ===
        "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1"
      ) {
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
    }) as typeof globalThis.fetch;

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

    const provider = createGoogleMeetingProvider(config, db);
    const result = await provider.createEvent("b1");

    expect(result.bookingId).toBe("b1");
    expect(result.provider).toBe("google_meet");
    expect(result.status).toBe("created");
    expect(result.meetingUrl).toBe("https://meet.google.com/oauth");
    expect(result.externalEventId).toBe("evt_oauth");
    expect(result.errorReason).toBeNull();
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
    const db = { insert, update } as any;

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
    const provider = createGoogleMeetingProvider(config, db);
    const start = new Date("2030-02-01T08:00:00Z");
    const end = new Date("2030-02-01T09:30:00Z");

    await provider.updateEvent("b1", { startAt: start, endAt: end });

    const call = mockCalendarEventsUpdate.mock.calls.at(-1)?.[0];
    expect(call?.eventId).toBe("evt_123");
    expect(call?.calendarId).toBe("primary");
    expect(call?.requestBody?.start?.dateTime).toBe(start.toISOString());
    expect(call?.requestBody?.end?.dateTime).toBe(end.toISOString());
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

  test("cancelEvent deletes the provider event and marks the row cancelled", async () => {
    const db = makeSelectDb(liveRow);
    const provider = createGoogleMeetingProvider(config, db);

    await provider.cancelEvent("b1");

    expect(mockCalendarEventsDelete).toHaveBeenCalledTimes(1);
    const call = mockCalendarEventsDelete.mock.calls[0]?.[0];
    expect(call?.eventId).toBe("evt_123");
    expect(db.update).toHaveBeenCalledTimes(1);
    const setMock = db.update.mock.results[0]?.value?.set as ReturnType<
      typeof mock
    >;
    expect(setMock).toHaveBeenCalledWith({ status: "cancelled" });
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
    const { createFallbackMeetingProvider } = await import(
      "../../modules/meeting/fallback.provider"
    );
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
});
