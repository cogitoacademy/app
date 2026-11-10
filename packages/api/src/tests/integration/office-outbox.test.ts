import { resetDatabase } from "../helpers/test-client";
import { beforeAll, describe, expect, test } from "bun:test";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@cogito-app/db";
import { officeOutbox, supportTicket, user } from "@cogito-app/db/schema";
import { assertSafeTestDatabaseUrl } from "../helpers/test-database-safety";
import { Queue } from "bullmq";
import { startOfficeOutboxScheduler } from "../../modules/office/office-worker";

describe("Office transactional outbox", () => {
  beforeAll(async () => {
    assertSafeTestDatabaseUrl(process.env.DATABASE_URL, process.env.NODE_ENV);
    await resetDatabase();
  });

  test.skipIf(!process.env.REDIS_URL)(
    "BullMQ retries a failing receiver and persists attempts and success",
    async () => {
      const id = crypto.randomUUID();
      const originalUrl = process.env.OFFICE_WEBHOOK_URL;
      const originalSecret = process.env.OFFICE_WEBHOOK_SECRET;
      process.env.OFFICE_WEBHOOK_URL =
        "https://office.cogitoacademy.id/hooks/app";
      process.env.OFFICE_WEBHOOK_SECRET = "test-secret-not-a-real-key";
      let calls = 0;
      const receiver = (async () =>
        new Response(null, {
          status: ++calls === 1 ? 503 : 200,
        })) as typeof fetch;
      const scheduler = startOfficeOutboxScheduler(
        process.env.REDIS_URL!,
        receiver,
      )!;
      const queue = new Queue("cogito-office", {
        connection: { url: process.env.REDIS_URL! },
      });
      try {
        await db.insert(officeOutbox).values({
          id,
          type: "ticket.opened",
          payload: { id: "ticket-test" },
        });
        const job = await queue.add(
          "deliver",
          { id },
          {
            jobId: id,
            attempts: 8,
            backoff: { type: "exponential", delay: 100 },
          },
        );
        const deadline = Date.now() + 10_000;
        let row: typeof officeOutbox.$inferSelect | undefined;
        do {
          [row] = await db
            .select()
            .from(officeOutbox)
            .where(eq(officeOutbox.id, id));
          if (row?.sentAt) break;
          await Bun.sleep(50);
        } while (Date.now() < deadline);
        expect(calls).toBe(2);
        expect(row?.attempts).toBe(2);
        expect(row?.sentAt).toBeInstanceOf(Date);
        expect(row?.lastError).toBeNull();
        await job.remove();
      } finally {
        await scheduler.close();
        await queue.close();
        await db.delete(officeOutbox).where(eq(officeOutbox.id, id));
        if (originalUrl === undefined) delete process.env.OFFICE_WEBHOOK_URL;
        else process.env.OFFICE_WEBHOOK_URL = originalUrl;
        if (originalSecret === undefined)
          delete process.env.OFFICE_WEBHOOK_SECRET;
        else process.env.OFFICE_WEBHOOK_SECRET = originalSecret;
      }
    },
  );

  test("business update and outbox insert roll back together", async () => {
    const id = crypto.randomUUID();
    const rolledBack = new Error("intentional rollback");
    await expect(
      db.transaction(async (tx) => {
        await tx.insert(user).values({
          id,
          name: "Seeded Minor Private Name",
          email: `${id}@cogito.test`,
          role: "admin",
        });
        const [event] = await tx
          .select()
          .from(officeOutbox)
          .where(
            and(
              eq(officeOutbox.type, "admin.added"),
              sql`${officeOutbox.payload}->>'id' = ${id}`,
            ),
          );
        expect(event?.payload).toEqual({ id });
        expect(JSON.stringify(event?.payload)).not.toContain("@");
        expect(JSON.stringify(event?.payload)).not.toContain("Seeded Minor");
        throw rolledBack;
      }),
    ).rejects.toBe(rolledBack);
    expect(await db.select().from(user).where(eq(user.id, id))).toHaveLength(0);
    expect(
      await db
        .select()
        .from(officeOutbox)
        .where(sql`${officeOutbox.payload}->>'id' = ${id}`),
    ).toHaveLength(0);
  });

  test("committed ticket has a durable event containing no description or person", async () => {
    const userId = crypto.randomUUID();
    const ticketId = crypto.randomUUID();
    try {
      await db.transaction(async (tx) => {
        await tx.insert(user).values({
          id: userId,
          name: "Seeded Minor Private Name",
          email: `${userId}@cogito.test`,
        });
        await tx.insert(supportTicket).values({
          id: ticketId,
          reporterId: userId,
          category: "technical",
          description: "Secret student free text",
          slaDeadline: new Date(Date.now() + 3600_000),
        });
      });
      const [event] = await db
        .select()
        .from(officeOutbox)
        .where(
          and(
            eq(officeOutbox.type, "ticket.opened"),
            sql`${officeOutbox.payload}->>'id' = ${ticketId}`,
          ),
        );
      expect(event?.payload).toEqual({ id: ticketId });
      expect(event?.sentAt).toBeNull();
      expect(JSON.stringify(event)).not.toContain("Secret student");
      expect(JSON.stringify(event)).not.toContain("Seeded Minor");
      expect(JSON.stringify(event)).not.toContain("@");
    } finally {
      await db.delete(user).where(eq(user.id, userId));
      await db
        .delete(officeOutbox)
        .where(sql`${officeOutbox.payload}->>'id' = ${ticketId}`);
    }
  });
});

test("transition trigger emits overdue once per session and payout totals per operation", async () => {
  const rollback = new Error("rollback trigger regression");
  await expect(db.transaction(async (tx) => {
    await tx.execute(sql`CREATE TEMP TABLE notification (id text, event_key text, metadata jsonb, is_read boolean) ON COMMIT DROP`);
    await tx.execute(sql`CREATE TRIGGER office_test AFTER INSERT OR UPDATE ON pg_temp.notification FOR EACH ROW EXECUTE FUNCTION office_capture_transition()`);
    const key = `booking:${crypto.randomUUID()}:session:test:missing-report`;
    await tx.execute(sql`INSERT INTO pg_temp.notification VALUES ('n1', ${key + ':day:1'}, '{"action":"booking-session-report"}', false)`);
    await tx.execute(sql`UPDATE pg_temp.notification SET is_read=true`);
    await tx.execute(sql`INSERT INTO pg_temp.notification VALUES ('n2', ${key + ':day:2'}, '{"action":"booking-session-report"}', false)`);
    const events = await tx.select().from(officeOutbox).where(sql`${officeOutbox.id} = 'session-report-overdue-' || md5(${key})`);
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toEqual({ id: key });
    await tx.execute(sql`CREATE TEMP TABLE tutor_payout (id text, status text, net_honorarium_idr bigint, actual_amount_idr bigint) ON COMMIT DROP`);
    await tx.execute(sql`CREATE TRIGGER office_test AFTER INSERT OR UPDATE ON pg_temp.tutor_payout FOR EACH ROW EXECUTE FUNCTION office_capture_transition()`);
    const before = await tx.select().from(officeOutbox).where(eq(officeOutbox.type, 'payout.paid'));
    await tx.execute(sql`INSERT INTO pg_temp.tutor_payout VALUES ('old', 'paid', 999999, 999999), ('new', 'prepared', 123, NULL)`);
    await tx.execute(sql`UPDATE pg_temp.tutor_payout SET status='paid', actual_amount_idr=123 WHERE id='new'`);
    const after = await tx.select().from(officeOutbox).where(eq(officeOutbox.type, 'payout.paid'));
    expect(after.length - before.length).toBe(2);
    expect(after.filter(e => e.payload.amountIdr === 123).length).toBeGreaterThan(0);
    throw rollback;
  })).rejects.toBe(rollback);
});
