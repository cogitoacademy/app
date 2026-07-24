import type { DbType } from "../../lib/db";
import type { MeetingEvent, MeetingPort } from "./meeting.types";
import { createFallbackMeetingProvider } from "./fallback.provider";
import { createGoogleMeetingProviderWithFallback } from "./google-meeting.provider";

export type MeetingModule = MeetingPort;

interface GoogleMeetingConfig {
  clientEmail: string;
  privateKey: string;
  calendarId: string;
}

export function createMeetingModule(deps: {
  db: DbType;
  googleMeetEnabled?: boolean;
  googleConfig?: GoogleMeetingConfig;
}): MeetingPort {
  if (deps.googleMeetEnabled && deps.googleConfig) {
    return createGoogleMeetingProviderWithFallback(deps.googleConfig, deps.db);
  }
  return createFallbackMeetingProvider(deps.db);
}

export type { MeetingEvent, MeetingPort };
