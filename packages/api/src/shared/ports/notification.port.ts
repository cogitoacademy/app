import type { DbOrTx } from "../../lib/tx";

export type NotificationCategory =
  | "booking"
  | "payment"
  | "refund"
  | "schedule"
  | "achievement"
  | "system"
  | "override";

export type NotificationSeverity = "info" | "action" | "critical";

export interface NotificationWriteParams {
  db: DbOrTx;
  userId: string;
  bookingId?: string;
  category: NotificationCategory;
  title: string;
  body: string;
  severity?: NotificationSeverity;
  eventKey: string;
  metadata?: Record<string, unknown>;
}

export interface InAppNotificationPort {
  write(params: NotificationWriteParams): Promise<void>;
}
