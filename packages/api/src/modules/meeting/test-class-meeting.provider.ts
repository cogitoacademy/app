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
  const eventIds = new Map<string, string>();
  return async (sessionId, _startAt, _endAt, _attendee, details) => {
    const shouldFailOnce =
      options.failFirstTitlePrefix &&
      details?.title.startsWith(options.failFirstTitlePrefix) &&
      !attemptedSessions.has(sessionId);
    if (shouldFailOnce) {
      attemptedSessions.add(sessionId);
      const externalEventId = `test-class-event-${sessionId}`;
      eventIds.set(sessionId, externalEventId);
      return {
        provider: "google_meet",
        status: "failed",
        externalEventId,
        meetingUrl: null,
        errorReason: "Controlled Meet link is pending for the accepted event",
      };
    }
    const existingEventId = eventIds.get(sessionId);
    if (existingEventId && details?.externalEventId !== existingEventId) {
      return {
        provider: "google_meet",
        status: "failed",
        externalEventId: existingEventId,
        meetingUrl: null,
        errorReason: "Retry did not resume the original controlled event",
      };
    }
    return {
      provider: "google_meet",
      status: "created",
      externalEventId:
        details?.externalEventId ??
        existingEventId ??
        `test-class-event-${sessionId}`,
      meetingUrl: `https://meet.example.test/${sessionId}`,
      errorReason: null,
    };
  };
};
