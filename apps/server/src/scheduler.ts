import { env } from "@cogito-app/env/server";
import { log } from "@cogito-app/api/lib/logger";
import { createSchedulerService } from "@cogito-app/api/modules/scheduler/scheduler.service";
import { scheduleBookingExpiryCheck } from "@cogito-app/api/modules/scheduler/jobs/expire-bookings.job";
import { scheduleHoldReleaseCheck } from "@cogito-app/api/modules/scheduler/jobs/release-holds.job";
import { services } from "@cogito-app/api";

let scheduler: ReturnType<typeof createSchedulerService> = null;

export async function initScheduler(): Promise<void> {
  if (!env.SCHEDULER_ENABLED || !env.REDIS_URL) {
    log({
      level: "info",
      action: "scheduler_skip",
      message: "Scheduler disabled or REDIS_URL not configured",
    });
    return;
  }

  scheduler = createSchedulerService(env.REDIS_URL!, {
    onExpireBookings: () => services.booking.expireBookings(),
    onReleaseHolds: async () => {
      const result = await services.booking.expireBookings();
      return { released: result.expired };
    },
    onSendNotificationEmail: async (data) => {
      log({
        level: "info",
        action: "scheduler_email_dispatch",
        message: "Notification email dispatch",
        data,
      });
    },
  });

  if (!scheduler) {
    log({
      level: "warn",
      action: "scheduler_init_failed",
      message: "Failed to initialize scheduler",
    });
    return;
  }

  await scheduleBookingExpiryCheck(scheduler.queue);
  await scheduleHoldReleaseCheck(scheduler.queue);

  log({
    level: "info",
    action: "scheduler_initialized",
    message: "Scheduler initialized with repeatable jobs",
  });
}

export async function shutdownScheduler(): Promise<void> {
  if (!scheduler) return;
  await scheduler.worker.close();
  await scheduler.queue.close();
  log({
    level: "info",
    action: "scheduler_shutdown",
    message: "Scheduler shut down",
  });
}
