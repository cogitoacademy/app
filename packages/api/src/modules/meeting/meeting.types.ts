export interface MeetingEvent {
  id: string;
  bookingId: string;
  provider: string;
  externalEventId: string | null;
  meetingUrl: string | null;
  status: string;
  errorReason: string | null;
}

export interface MeetingAttendee {
  email: string;
  name?: string;
}

export interface MeetingPort {
  createEvent(
    bookingId: string,
    scheduledStartAt?: Date,
    scheduledEndAt?: Date,
    attendees?: MeetingAttendee[],
  ): Promise<MeetingEvent>;
  /**
   * Moves the provider-side event to a new time after a booking reschedule is
   * committed (FR-21 / OQ-05). No-op when the booking has no provider event
   * (manual link or never created).
   */
  updateEvent(
    bookingId: string,
    changes: { startAt?: Date; endAt?: Date },
  ): Promise<void>;
  /**
   * Deletes the provider-side event when the booking reaches a terminal state
   * (cancelled/late_cancelled/declined/expired). No-op for manual links.
   */
  cancelEvent(bookingId: string): Promise<void>;
  /**
   * Records an admin-pasted manual meeting URL on the booking (U1 / FR-21).
   * Updates the existing meetingEvent row (or creates one) as an active
   * manual link — this also stops `retry-failed-meetings` from retrying.
   */
  setManualLink(bookingId: string, url: string): Promise<MeetingEvent>;
}
