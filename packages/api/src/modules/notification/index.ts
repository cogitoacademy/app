import type { DbType } from "../../lib/db";
import { createNotificationService } from "./notification.service";
import { createNotificationHandler } from "./notification.handler";
import type { NotificationService } from "./notification.service";
import type { NotificationHandler } from "./notification.handler";

export type NotificationModule = ReturnType<typeof createNotificationModule>;

interface NotificationEmailPort {
  send(message: {
    to: string;
    subject: string;
    html: string;
    category: "booking" | "payment" | "refund" | "schedule" | "override";
  }): Promise<{ messageId: string } | { skipped: true }>;
}

export function createNotificationModule(deps: {
  db: DbType;
  email: NotificationEmailPort;
}) {
  const service = createNotificationService(deps.db, deps.email);
  const handler = createNotificationHandler({ notificationService: service });
  return { service, handler };
}

export type { NotificationService, NotificationHandler };
