import {
  meetingEvent,
  type meetingEvent as meetingEventTable,
} from "@cogito-app/db/schema";
import type { DbOrTx } from "../../lib/tx";
import type { MeetingEvent, MeetingPort } from "./meeting.types";
import { log } from "../../lib/logger";

export function createFallbackMeetingProvider(db: DbOrTx): MeetingPort {
  async function createEvent(
    bookingId: string,
    _scheduledStartAt?: Date,
    _scheduledEndAt?: Date,
  ): Promise<MeetingEvent> {
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

    log({
      level: "warn",
      action: "meeting_manual_created",
      message:
        "Meeting created with manual provider — admin needs to assign a meeting link",
      bookingId,
    });

    return row as unknown as typeof meetingEventTable.$inferSelect;
  }

  return { createEvent };
}
