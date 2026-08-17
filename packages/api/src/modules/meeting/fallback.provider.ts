import { meetingEvent } from "@cogito-app/db/schema";
import { eq } from "drizzle-orm";
import type { DbOrTx } from "../../lib/tx";
import type {
  MeetingAttendee,
  MeetingEvent,
  MeetingPort,
} from "./meeting.types";
import { log } from "../../lib/logger";

export function createFallbackMeetingProvider(db: DbOrTx): MeetingPort {
  async function createEvent(
    bookingId: string,
    _scheduledStartAt?: Date,
    _scheduledEndAt?: Date,
    attendees?: MeetingAttendee[],
  ): Promise<MeetingEvent> {
    const [row] = await db
      .insert(meetingEvent)
      .values({
        bookingId,
        provider: "manual",
        status: "manual",
        meetingUrl: null,
        externalEventId: null,
        attendeeEmails: attendees?.map((a) => a.email) ?? null,
      })
      .returning();

    log({
      level: "warn",
      action: "meeting_manual_created",
      message:
        "Meeting created with manual provider — admin needs to assign a meeting link",
      bookingId,
    });

    return row as typeof meetingEvent.$inferSelect;
  }

  // Manual links carry no provider-side event: a reschedule is a no-op (the
  // admin re-assigns a link as needed). On cancellation we still reflect the
  // terminal state locally so the booking GET stops surfacing the link.
  async function updateEvent(): Promise<void> {}
  async function cancelEvent(bookingId: string): Promise<void> {
    try {
      await db
        .update(meetingEvent)
        .set({ status: "cancelled" })
        .where(eq(meetingEvent.bookingId, bookingId));
    } catch (error) {
      log({
        level: "error",
        action: "meeting_manual_cancel_failed",
        bookingId,
        error: { message: String(error) },
      });
    }
  }

  async function setManualLink(
    bookingId: string,
    url: string,
  ): Promise<MeetingEvent> {
    const [existing] = await db
      .select()
      .from(meetingEvent)
      .where(eq(meetingEvent.bookingId, bookingId))
      .orderBy(meetingEvent.createdAt)
      .limit(1);

    const values = {
      provider: "manual",
      status: "created",
      meetingUrl: url,
      errorReason: null,
    } as const;

    if (existing) {
      const [updated] = await db
        .update(meetingEvent)
        .set(values)
        .where(eq(meetingEvent.id, existing.id))
        .returning();
      return updated as typeof meetingEvent.$inferSelect;
    }

    const [created] = await db
      .insert(meetingEvent)
      .values({
        bookingId,
        provider: "manual",
        status: "created",
        meetingUrl: url,
        externalEventId: null,
      })
      .returning();
    return created as typeof meetingEvent.$inferSelect;
  }

  return { createEvent, updateEvent, cancelEvent, setManualLink };
}
