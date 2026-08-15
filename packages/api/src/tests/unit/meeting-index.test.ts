import { describe, expect, mock, test } from "bun:test";

import { createMeetingModule } from "../../modules/meeting/index";

describe("createMeetingModule", () => {
  test("returns a meeting port with all operations when enabled with a config", () => {
    const db = { insert: mock(() => ({ values: mock(() => ({ returning: mock(async () => []) })) })) } as never;
    const module = createMeetingModule({
      db,
      googleMeetEnabled: true,
      googleConfig: {
        authType: "oauth_refresh_token",
        calendarId: "primary",
        clientId: "cid",
        clientSecret: "csec",
        refreshToken: "rtok",
      },
    });

    expect(module).toBeTruthy();
    expect(typeof module.createEvent).toBe("function");
    expect(typeof module.updateEvent).toBe("function");
    expect(typeof module.cancelEvent).toBe("function");
  });

  test("returns the fallback provider when googleMeetEnabled is false", async () => {
    const returning = mock(async () => [
      {
        id: "me1",
        bookingId: "b1",
        provider: "manual",
        status: "manual",
        meetingUrl: null,
        externalEventId: null,
      },
    ]);
    const values = mock(() => ({ returning }));
    const insert = mock(() => ({ values }));
    const db = { insert } as never;

    const module = createMeetingModule({ db, googleMeetEnabled: false });
    const event = await module.createEvent("b1");

    expect(event.provider).toBe("manual");
    expect(event.status).toBe("manual");
    expect(insert).toHaveBeenCalledTimes(1);
  });

  test("returns the fallback provider when a config is missing", async () => {
    const returning = mock(async () => [
      {
        id: "me1",
        bookingId: "b1",
        provider: "manual",
        status: "manual",
        meetingUrl: null,
        externalEventId: null,
      },
    ]);
    const values = mock(() => ({ returning }));
    const insert = mock(() => ({ values }));
    const db = { insert } as never;

    const module = createMeetingModule({ db, googleMeetEnabled: true });
    const event = await module.createEvent("b1");

    expect(event.provider).toBe("manual");
  });

  test("returns the fallback provider when no options are given", async () => {
    const returning = mock(async () => [
      {
        id: "me1",
        bookingId: "b1",
        provider: "manual",
        status: "manual",
        meetingUrl: null,
        externalEventId: null,
      },
    ]);
    const values = mock(() => ({ returning }));
    const insert = mock(() => ({ values }));
    const db = { insert } as never;

    const module = createMeetingModule({ db });
    const event = await module.createEvent("b1");

    expect(event.provider).toBe("manual");
  });
});
