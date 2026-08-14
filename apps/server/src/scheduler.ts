import { env } from "@cogito-app/env/server";
import { log } from "@cogito-app/api/lib/logger";
import { createSchedulerService } from "@cogito-app/api/modules/scheduler/scheduler.service";
import { scheduleBookingExpiryCheck } from "@cogito-app/api/modules/scheduler/jobs/expire-bookings.job";
import { scheduleHoldReleaseCheck } from "@cogito-app/api/modules/scheduler/jobs/release-holds.job";
import { scheduleCheckTutorLateness } from "@cogito-app/api/modules/scheduler/jobs/check-tutor-lateness.job";
import { scheduleSendNotificationEmail } from "@cogito-app/api/modules/scheduler/jobs/send-notification-email.job";
import { services } from "@cogito-app/api";

let scheduler: ReturnType<typeof createSchedulerService> = null;

/**
 * Initializes the BullMQ scheduler and repeatable jobs when enabled.
 *
 * @returns a promise resolving once the scheduler and repeatable jobs are registered
 */
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
    onReleaseHolds: () => services.booking.releaseExpiredHolds(),
    onCheckTutorLateness: () => services.booking.checkTutorLateness(),
    onSendNotificationEmail: () => services.notification.dispatchQueuedEmails(50),
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
  await scheduleCheckTutorLateness(scheduler.queue);
  await scheduleSendNotificationEmail(scheduler.queue);

  log({
    level: "info",
    action: "scheduler_initialized",
    message: "Scheduler initialized with repeatable jobs",
  });
}

const SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * Gracefully shuts down the scheduler worker and queue, forcing close on timeout.
 *
 * @returns a promise resolving once shutdown completes or the timeout forces close
 */
export async function shutdownScheduler(): Promise<void> {
  if (!scheduler) return;

  log({
    level: "info",
    action: "scheduler_shutdown_start",
    message: "Shutting down scheduler...",
  });

  const forceExit = setTimeout(() => {
    log({
      level: "warn",
      action: "scheduler_shutdown_forced",
      message: `Scheduler shutdown timed out after ${SHUTDOWN_TIMEOUT_MS}ms, forcing close`,
    });
    scheduler!.worker.close(true).catch(() => {});
    scheduler!.queue.close().catch(() => {});
  }, SHUTDOWN_TIMEOUT_MS);

  try {
    await Promise.all([scheduler.worker.close(), scheduler.queue.close()]);
    clearTimeout(forceExit);
    log({
      level: "info",
      action: "scheduler_shutdown",
      message: "Scheduler shut down gracefully",
    });
  } catch (error) {
    clearTimeout(forceExit);
    log({
      level: "error",
      action: "scheduler_shutdown_error",
      error: { message: String(error) },
    });
  }
}
