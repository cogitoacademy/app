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

    const provider = createGoogleMeetingProvider(oauthConfig, db);
    const result = await provider.createEvent("b1", undefined, undefined, [
      { email: "tutor@example.com", name: "Tutor" },
      { email: "student@example.com" },
    ]);

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
      if (url.includes("/events?conferenceDataVersion=1")) {
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
  });

  test("cancelEvent deletes a live provider event via the OAuth API and marks the row cancelled", async () => {
    const methods: string[] = [];
    globalThis.fetch = mock(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token") {
        return tokenResponse({ access_token: "t1" });
      }
      if (url.includes("/events/evt_oauth2")) {
        methods.push(init?.method ?? "GET");
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
