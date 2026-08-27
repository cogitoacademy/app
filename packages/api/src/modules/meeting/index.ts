import type { DbType } from "../../lib/db";
import type { RedisClient } from "../../lib/redis";
import type {
  MeetingEvent,
  MeetingEventDetails,
  MeetingPort,
} from "./meeting.types";
import { createFallbackMeetingProvider } from "./fallback.provider";
import { createGoogleMeetingProviderWithFallback } from "./google-meeting.provider";

export type MeetingModule = MeetingPort;

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

export function createMeetingModule(deps: {
  db: DbType;
  googleMeetEnabled?: boolean;
  googleConfig?: GoogleMeetingConfig;
  redis?: RedisClient;
}): MeetingPort {
  if (deps.googleMeetEnabled && deps.googleConfig) {
    return createGoogleMeetingProviderWithFallback(
      deps.googleConfig,
      deps.db,
      deps.redis,
    );
  }
  return createFallbackMeetingProvider(deps.db);
}

export type { MeetingEvent, MeetingEventDetails, MeetingPort };
