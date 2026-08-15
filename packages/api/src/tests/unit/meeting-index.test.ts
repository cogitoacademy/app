import { describe, expect, mock, test } from "bun:test";

const fallbackMock = mock(() => ({ provider: "fallback" }));
const googleMock = mock(() => ({ provider: "google" }));

mock.module("../../modules/meeting/fallback.provider", () => ({
  createFallbackMeetingProvider: fallbackMock,
}));

mock.module("../../modules/meeting/google-meeting.provider", () => ({
  createGoogleMeetingProviderWithFallback: googleMock,
}));

const { createMeetingModule } = await import("../../modules/meeting/index");

describe("createMeetingModule", () => {
  const db = { query: {} } as never;

  test("returns the Google provider with fallback when enabled with a config", () => {
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

    expect(googleMock).toHaveBeenCalledTimes(1);
    expect(module).toEqual({ provider: "google" });
  });

  test("returns the fallback provider when googleMeetEnabled is false", () => {
    createMeetingModule({ db, googleMeetEnabled: false });

    expect(fallbackMock).toHaveBeenCalledTimes(1);
    expect(fallbackMock).toHaveBeenCalledWith(db);
  });

  test("returns the fallback provider when a config is missing", () => {
    createMeetingModule({ db, googleMeetEnabled: true });

    expect(fallbackMock).toHaveBeenCalledTimes(2);
  });

  test("returns the fallback provider when no options are given", () => {
    createMeetingModule({ db });

    expect(fallbackMock).toHaveBeenCalledTimes(3);
  });
});
