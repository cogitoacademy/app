import { env } from "@cogito-app/env/server";
import { log } from "@cogito-app/api/lib/logger";
import { createSchedulerService } from "@cogito-app/api/modules/scheduler/scheduler.service";
import { scheduleBookingExpiryCheck } from "@cogito-app/api/modules/scheduler/jobs/expire-bookings.job";
import { scheduleHoldReleaseCheck } from "@cogito-app/api/modules/scheduler/jobs/release-holds.job";
import { scheduleSendNotificationEmail } from "@cogito-app/api/modules/scheduler/jobs/send-notification-email.job";
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
    onReleaseHolds: () => services.booking.releaseExpiredHolds(),
    onSendNotificationEmail: async (data) => {
      try {
        const db = (await import("@cogito-app/db")).db;
        const { notification: notificationTable, user: userTable } =
          await import("@cogito-app/db/schema");
        const { eq } = await import("drizzle-orm");
        const [notifRow] = await db
          .select()
          .from(notificationTable)
          .where(eq(notificationTable.id, data.notificationId))
          .limit(1);
        if (!notifRow) return;

        const [userRow] = await db
          .select({ email: userTable.email })
          .from(userTable)
          .where(eq(userTable.id, data.userId))
          .limit(1);
        if (!userRow?.email) return;

        const emailCategory =
          (notifRow.category as string) === "booking"
            ? "booking"
            : (notifRow.category as string) === "payment"
              ? "payment"
              : (notifRow.category as string) === "refund"
                ? "refund"
                : (notifRow.category as string) === "schedule"
                  ? "schedule"
                  : "override";

        await services.email.send({
          to: userRow.email,
          subject: notifRow.title,
          html: notifRow.body,
          category: emailCategory as
            | "booking"
            | "payment"
            | "refund"
            | "schedule"
            | "override",
        });
      } catch (error) {
        log({
          level: "error",
          action: "scheduler_email_dispatch_failed",
          error: { message: String(error) },
          data,
        });
      }
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
  await scheduleSendNotificationEmail(scheduler.queue);

  log({
    level: "info",
    action: "scheduler_initialized",
    message: "Scheduler initialized with repeatable jobs",
  });
}

const SHUTDOWN_TIMEOUT_MS = 10_000;

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
