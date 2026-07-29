import type { DbType } from "../../lib/db";
import type { RedisClient } from "../../lib/redis";
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
  redis?: RedisClient;
}): MeetingPort {
  if (deps.googleMeetEnabled && deps.googleConfig) {
    return createGoogleMeetingProviderWithFallback(deps.googleConfig, deps.db, deps.redis);
  }
  return createFallbackMeetingProvider(deps.db);
}

export type { MeetingEvent, MeetingPort };
