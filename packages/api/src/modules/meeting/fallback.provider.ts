import {
  meetingEvent,
  type meetingEvent as meetingEventTable,
} from "@cogito-app/db/schema";
import type { DbOrTx } from "../../lib/tx";
import type {
  MeetingEvent,
  MeetingPort,
} from "../../shared/ports/meeting.port";

export function createFallbackMeetingProvider(db: DbOrTx): MeetingPort {
  async function createEvent(bookingId: string): Promise<MeetingEvent> {
    const [row] = await db
      .insert(meetingEvent)
      .values({
        bookingId,
        provider: "manual",
        status: "manual",
        meetingUrl: null,
        externalEventId: null,
      })
      .returning();
    return row as unknown as typeof meetingEventTable.$inferSelect;
  }

  return { createEvent };
}
