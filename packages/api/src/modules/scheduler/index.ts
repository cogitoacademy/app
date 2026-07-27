import { createSchedulerService } from "./scheduler.service";
import type { SchedulerService } from "./scheduler.service";

export type SchedulerModule = ReturnType<typeof createSchedulerModule>;

export interface SchedulerHandlers {
  onExpireBookings: () => Promise<{ expired: number; failed: number }>;
  onReleaseHolds: () => Promise<{ released: number }>;
  onSendNotificationEmail: (data: {
    notificationId: string;
    userId: string;
  }) => Promise<void>;
}

export function createSchedulerModule(deps: {
  redisUrl: string;
  handlers: SchedulerHandlers;
}): SchedulerService | null {
  return createSchedulerService(deps.redisUrl, deps.handlers);
}

export type { SchedulerService };
