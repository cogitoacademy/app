import type { DbType } from "../../lib/db";
import type { RedisClient } from "../../lib/redis";
import type {
  AcademyClassMeetingResult,
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
  sendUpdates?: "none" | "all" | "externalOnly";
}

export function createMeetingModule(deps: {
  db: DbType;
  googleMeetEnabled?: boolean;
  googleConfig?: GoogleMeetingConfig;
  redis?: RedisClient;
  classMeetingCancellationProvider?: NonNullable<
    MeetingPort["cancelAcademyClassEvent"]
  >;
  classMeetingProvider?: NonNullable<MeetingPort["createAcademyClassEvent"]>;
}): MeetingPort {
  const provider =
    deps.googleMeetEnabled && deps.googleConfig
      ? createGoogleMeetingProviderWithFallback(
          deps.googleConfig,
          deps.db,
          deps.redis,
        )
      : createFallbackMeetingProvider(deps.db);
  return {
    ...provider,
    ...(deps.classMeetingProvider
      ? { createAcademyClassEvent: deps.classMeetingProvider }
      : {}),
    ...(deps.classMeetingCancellationProvider
      ? { cancelAcademyClassEvent: deps.classMeetingCancellationProvider }
      : {}),
  };
}

export type {
  AcademyClassMeetingResult,
  MeetingEvent,
  MeetingEventDetails,
  MeetingPort,
};
