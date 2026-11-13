import { Queue, Worker } from "bullmq";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../lib/db";
import { booking, officeOutbox } from "@cogito-app/db/schema";
import {
  OFFICE_OPEN_BOOKING_STATES,
  officeEscalationDeadline,
} from "./office-contract";
import { deliverOfficeEvent, enqueueOfficeEvent } from "./office-events";
import { log } from "../../lib/logger";

const options = {
  attempts: 8,
  backoff: { type: "exponential", delay: 1000 },
  removeOnComplete: true,
  removeOnFail: { count: 100 },
};

async function enqueueDueEvents() {
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('office-payment-mode'))`,
    );
    const previous = await tx.execute(
      sql`SELECT payload->>'state' AS state FROM office_outbox WHERE type='payment_mode.changed' ORDER BY created_at DESC LIMIT 1`,
    );
    const mode = process.env.MIDTRANS_MODE === "live" ? "live" : "sandbox";
    if (previous[0]?.state !== mode)
      await enqueueOfficeEvent(tx, "payment_mode.changed", { state: mode });
  });
  await db.execute(sql`INSERT INTO office_outbox(id,type,payload)
    SELECT 'ticket-warning-' || id, 'ticket.sla_warning', jsonb_build_object('id',id)
    FROM support_ticket WHERE status IN ('open','in_progress') AND sla_deadline > now() AND sla_deadline <= now()+interval '4 hours'
    ON CONFLICT DO NOTHING`);
  await db.execute(sql`INSERT INTO office_outbox(id,type,payload)
    SELECT 'ticket-breached-' || id, 'ticket.sla_breached', jsonb_build_object('id',id)
    FROM support_ticket WHERE status IN ('open','in_progress') AND sla_deadline <= now()
    ON CONFLICT DO NOTHING`);
  // Reuse the dashboard's authoritative WIB SLA calculator, rather than a second SQL interpretation.
  const exceptions = await db
    .select({
      id: booking.id,
      meta: booking.overrideMeta,
      state: booking.currentState,
    })
    .from(booking)
    .where(
      and(
        sql`${booking.overrideMeta} IS NOT NULL`,
        inArray(booking.currentState, [...OFFICE_OPEN_BOOKING_STATES]),
      ),
    );
  const escalations: Promise<void>[] = [];
  for (const row of exceptions) {
    const at = (row.meta as { overriddenAt?: string } | null)?.overriddenAt;
    if (at && officeEscalationDeadline(row.state, row.meta, new Date())) {
      escalations.push(
        enqueueOfficeEvent(
          db,
          "booking.escalated",
          { id: row.id },
          `booking-escalated-${row.id}-${Date.parse(at)}`,
        ),
      );
    }
  }
  await Promise.all(escalations);
}

export function startOfficeOutboxScheduler(
  redisUrl: string,
  receiverFetch: typeof fetch = fetch,
) {
  if (!process.env.OFFICE_WEBHOOK_URL) return null;
  const connection = { url: redisUrl };
  const queue = new Queue("cogito-office", {
    connection,
    defaultJobOptions: options,
  });
  const worker = new Worker(
    "cogito-office",
    async (job) => {
      const url = process.env.OFFICE_WEBHOOK_URL;
      const secret = process.env.OFFICE_WEBHOOK_SECRET;
      if (!url || !secret) return;
      const target = new URL(url);
      if (target.protocol !== "https:" || target.username || target.password)
        throw new Error("Invalid Office webhook configuration");
      if (job.name === "dispatch") {
        await enqueueDueEvents();
        const rows = await db
          .select({ id: officeOutbox.id })
          .from(officeOutbox)
          .where(
            and(isNull(officeOutbox.sentAt), sql`${officeOutbox.attempts} < 8`),
          )
          .limit(100);
        await Promise.all(
          rows.map((row) =>
            queue.add("deliver", { id: row.id }, { jobId: row.id, ...options }),
          ),
        );
        return;
      }
      const failed = await db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(officeOutbox)
          .where(eq(officeOutbox.id, job.data.id))
          .for("update");
        if (!row || row.sentAt || row.attempts >= 8) return false;
        try {
          await deliverOfficeEvent(row, { url, secret, fetch: receiverFetch });
          await tx
            .update(officeOutbox)
            .set({
              sentAt: new Date(),
              attempts: row.attempts + 1,
              lastError: null,
            })
            .where(eq(officeOutbox.id, row.id));
          return false;
        } catch {
          await tx
            .update(officeOutbox)
            .set({
              attempts: row.attempts + 1,
              lastError: "Office delivery failed",
            })
            .where(eq(officeOutbox.id, row.id));
          return true;
        }
      });
      if (failed) throw new Error("Office delivery failed");
    },
    { connection, concurrency: 4 },
  );
  worker.on("failed", (job) => {
    if (!job || job.name !== "deliver" || job.attemptsMade < 8) return;
    // Existing ops Discord webhook; only the event ID is sent, never error response bodies.
    const discord = process.env.DISCORD_WEBHOOK_URL;
    log({
      level: "error",
      action: "office_outbox_exhausted",
      eventId: job.data.id,
    });
    if (discord)
      void fetch(discord, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `Cogito Office event delivery exhausted: ${job.data.id}`,
        }),
        signal: AbortSignal.timeout(10_000),
      }).catch(() =>
        log({ level: "error", action: "office_ops_alert_failed" }),
      );
  });
  return {
    start: () =>
      queue.upsertJobScheduler(
        "office-dispatch",
        { every: 15_000 },
        { name: "dispatch", data: {}, opts: options },
      ),
    close: async () => {
      await worker.close();
      await queue.close();
    },
  };
}
