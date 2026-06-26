import { notification } from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type {
  InAppNotificationPort,
  NotificationWriteParams,
} from "../../shared/ports/notification.port";

export type NotificationService = ReturnType<typeof createNotificationService>;

export function createNotificationService(_db: DbType): InAppNotificationPort {
  async function write(params: NotificationWriteParams): Promise<void> {
    await params.db.insert(notification).values({
      userId: params.userId,
      bookingId: params.bookingId ?? null,
      category: params.category,
      title: params.title,
      body: params.body,
      severity: params.severity ?? "info",
      eventKey: params.eventKey,
      metadata: params.metadata ?? {},
    });
  }

  return { write };
}
