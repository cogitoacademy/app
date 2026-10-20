import type { MeetingPort } from "./meeting.types";

export interface TestClassMeetingProviderOptions {
  /** Fail once for matching event titles so the browser can exercise retries. */
  failFirstTitlePrefix?: string;
}

/** Deterministic adapter for integration/E2E runs; it never calls a provider. */
export const createTestClassMeetingProvider = (
  options: TestClassMeetingProviderOptions = {},
): NonNullable<MeetingPort["createAcademyClassEvent"]> => {
  const attemptedSessions = new Set<string>();
  return async (sessionId, _startAt, _endAt, _attendee, details) => {
    const shouldFailOnce =
      options.failFirstTitlePrefix &&
      details?.title.startsWith(options.failFirstTitlePrefix) &&
      !attemptedSessions.has(sessionId);
    if (shouldFailOnce) {
      attemptedSessions.add(sessionId);
      return {
        provider: "google_meet",
        status: "failed",
        externalEventId: null,
        meetingUrl: null,
        errorReason: "Controlled test provider failure before event creation",
      };
    }
    return {
      provider: "google_meet",
      status: "created",
      externalEventId: `test-class-event-${sessionId}`,
      meetingUrl: `https://meet.example.test/${sessionId}`,
      errorReason: null,
    };
  };
};
