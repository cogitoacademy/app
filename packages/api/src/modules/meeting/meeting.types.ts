import type { DbOrTx } from "../../lib/tx";

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

export interface MeetingEventDetails {
  /** The human-readable title shown in the provider calendar. */
  title: string;
  /** Optional provider-calendar description, including any app deep link. */
  description?: string;
  /** Optional physical location shown on a non-Meet calendar event. */
  location?: string;
  /** Defaults to true. Offline bookings set this to false. */
  createConference?: boolean;
}

export interface MeetingPort {
  /**
   * Creates a provider-side meeting event and persists the local
   * `meetingEvent` row.
   *
   * When called inside a booking transaction, pass `conn` so the local row
   * commits/rolls back with the booking — otherwise a failed transition would
   * leave an orphan row (L2). The provider-side event cannot be rolled back;
   * callers must best-effort `cancelEvent` on failure.
   */
  createEvent(
    bookingId: string,
    scheduledStartAt?: Date,
    scheduledEndAt?: Date,
    attendees?: MeetingAttendee[],
    conn?: DbOrTx,
    details?: MeetingEventDetails,
  ): Promise<MeetingEvent>;
  /**
   * Moves the provider-side event to a new time after a booking reschedule is
   * committed (FR-21 / OQ-05). No-op when the booking has no provider event
   * (manual link or never created).
   */
  updateEvent(
    bookingId: string,
    changes: { startAt?: Date; endAt?: Date; location?: string },
  ): Promise<void>;
  /**
   * Deletes the provider-side event when the booking reaches a terminal state
   * (cancelled/late_cancelled/declined/expired). No-op for manual links.
   */
  cancelEvent(bookingId: string): Promise<void>;
  /**
   * Records an authorized manual meeting URL on the booking (U1 / FR-21).
   * Updates the existing meetingEvent row (or creates one) as an active
   * manual link — this also stops `retry-failed-meetings` from retrying.
   *
   * When called inside a booking transaction, pass `conn` so the local row
   * commits/rolls back with the booking — otherwise a later tx failure would
   * leave an orphan manual-link row (F10, mirrors createEvent's `conn`).
   */
  setManualLink(
    bookingId: string,
    url: string,
    conn?: DbOrTx,
  ): Promise<MeetingEvent>;
  /**
   * Boot-time connectivity probe (P4.2/X3): verifies the configured Google
   * credentials can reach the Calendar API (e.g. via `calendarList.get`).
   * Logs loudly on failure so a misconfigured Google Meet swap fails at boot,
   * not silently at the first booking. No-op for the manual fallback.
   */
  probe?(): Promise<{ ok: boolean; error?: string }>;
}
