import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";

let logCaptures: any[] = [];
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

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
});

const mockCalendarEventsInsert = mock(async () => ({
  data: {
    id: "evt_123",
    conferenceData: {
      entryPoints: [{ uri: "https://meet.google.com/abc" }],
    },
  },
}));

mock.module("googleapis", () => ({
  google: {
    auth: {
      JWT: class {
        email: string;
        key: string;
        scopes: string[];
        constructor(e: string, k: string, s: string[]) {
          this.email = e;
          this.key = k;
          this.scopes = s;
        }
      },
    },
    calendar: () => ({
      events: {
        insert: mockCalendarEventsInsert,
      },
    }),
  },
}));

mock.module("@cogito-app/db/schema", () => ({
  meetingEvent: {
    bookingId: "bookingId",
    provider: "provider",
    status: "status",
    meetingUrl: "meetingUrl",
    externalEventId: "externalEventId",
    errorReason: "errorReason",
  },
}));

import {
  createGoogleMeetingProvider,
  createGoogleMeetingProviderWithFallback,
} from "../../modules/meeting/google-meeting.provider";

describe("createGoogleMeetingProvider", () => {
  const config = {
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
});

describe("createGoogleMeetingProviderWithFallback", () => {
  const config = {
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

    let callCount = 0;
    const insert = mock(() => ({
      values: mock(() => ({
        returning: mock(async () => {
          callCount++;
          if (callCount === 1) {
            return [
              {
                id: "me2",
                bookingId: "b1",
                provider: "google_meet",
                externalEventId: null,
                meetingUrl: null,
                status: "failed",
                errorReason: "Error: Google API error",
              },
            ];
          }
          return [
            {
              id: "me3",
              bookingId: "b1",
              provider: "manual",
              meetingUrl: null,
              externalEventId: null,
              status: "manual",
              errorReason: null,
            },
          ];
        }),
      })),
    }));

    const db = { insert } as any;
    const provider = createGoogleMeetingProviderWithFallback(config, db);
    const result = await provider.createEvent("b1");

    expect(result.provider).toBe("manual");
    expect(result.status).toBe("manual");
  });
});

describe("createGoogleMeetingProvider timeout", () => {
  const config = {
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
