import { afterEach, beforeEach, expect, mock, test } from "bun:test";

type Job = { name: string; data: { id?: string }; attemptsMade?: number };
let processJob: (job: Job) => Promise<void>;
let onFailed: (job?: Job) => void;
let deliveryRow: Record<string, unknown> | undefined;
let exceptions: { id: string; meta: unknown }[] = [];
let pending: { id: string }[] = [];
let previous: { state: string }[] = [];
let executeCount = 0;
const updates: unknown[] = [];
const add = mock(async (..._args: unknown[]) => undefined);
const schedule = mock(async (..._args: unknown[]) => undefined);
const closeQueue = mock(async () => undefined);
const closeWorker = mock(async () => undefined);
const deliver = mock(async (..._args: unknown[]) => undefined);
const enqueue = mock(async (..._args: unknown[]) => undefined);
const log = mock((_value: unknown) => undefined);
const execute = mock(async (_query: unknown) => {
  executeCount++;
  return executeCount === 2 ? previous : [];
});
const database = {
  transaction: async (fn: (tx: unknown) => unknown) => fn(database),
  execute,
  select: (selection?: unknown) => ({
    from: () => ({
      where: () =>
        Object.assign(Promise.resolve(exceptions), {
          limit: async () => pending,
          for: async () => (selection ? [] : deliveryRow ? [deliveryRow] : []),
        }),
    }),
  }),
  update: () => ({
    set: (value: unknown) => ({
      where: async () => {
        updates.push(value);
      },
    }),
  }),
};
mock.module("../../lib/db", () => ({ db: database }));
mock.module("../../lib/logger", () => ({ log }));
mock.module("../../modules/support/support.service", () => ({
  computeSlaDeadline: (date: Date) => new Date(date.getTime() + 86400000),
}));
mock.module("../../modules/office/office-events", () => ({
  deliverOfficeEvent: deliver,
  enqueueOfficeEvent: enqueue,
}));
mock.module("bullmq", () => ({
  Queue: class {
    add = add;
    upsertJobScheduler = schedule;
    close = closeQueue;
  },
  Worker: class {
    constructor(_name: string, handler: typeof processJob) {
      processJob = handler;
    }
    on(_event: string, handler: typeof onFailed) {
      onFailed = handler;
    }
    close = closeWorker;
  },
}));
const { startOfficeOutboxScheduler } =
  await import("../../modules/office/office-worker");
const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
beforeEach(() => {
  process.env.OFFICE_WEBHOOK_URL = "https://office.example.test/events";
  process.env.OFFICE_WEBHOOK_SECRET = "test-secret";
  delete process.env.DISCORD_WEBHOOK_URL;
  delete process.env.MIDTRANS_MODE;
  deliveryRow = { id: "event-1", attempts: 0, sentAt: null };
  exceptions = [];
  pending = [];
  previous = [];
  executeCount = 0;
  updates.length = 0;
  for (const fn of [
    add,
    schedule,
    closeQueue,
    closeWorker,
    deliver,
    enqueue,
    log,
    execute,
  ])
    fn.mockClear();
  deliver.mockImplementation(async () => undefined);
});
afterEach(() => {
  for (const key of [
    "OFFICE_WEBHOOK_URL",
    "OFFICE_WEBHOOK_SECRET",
    "DISCORD_WEBHOOK_URL",
    "MIDTRANS_MODE",
  ])
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  globalThis.fetch = originalFetch;
});
const job: Job = { name: "deliver", data: { id: "event-1" } };

test("disabled receiver creates no scheduler; missing runtime URL or key does no delivery", async () => {
  delete process.env.OFFICE_WEBHOOK_URL;
  expect(startOfficeOutboxScheduler("redis://unused")).toBeNull();
  process.env.OFFICE_WEBHOOK_URL = "https://office.example.test";
  startOfficeOutboxScheduler("redis://unused");
  delete process.env.OFFICE_WEBHOOK_URL;
  await processJob(job);
  process.env.OFFICE_WEBHOOK_URL = "https://office.example.test";
  delete process.env.OFFICE_WEBHOOK_SECRET;
  await processJob(job);
  expect(deliver).not.toHaveBeenCalled();
  expect(updates).toEqual([]);
});
for (const url of [
  "http://office.example.test",
  "https://user@office.example.test",
  "https://:password@office.example.test",
])
  test(`rejects unsafe receiver ${url}`, async () => {
    startOfficeOutboxScheduler("redis://unused");
    process.env.OFFICE_WEBHOOK_URL = url;
    await expect(processJob(job)).rejects.toThrow(
      "Invalid Office webhook configuration",
    );
    expect(deliver).not.toHaveBeenCalled();
  });
test("delivery marks success, increments persisted attempt and clears stale error", async () => {
  const receiver = mock(
    async () => new Response("ok"),
  ) as unknown as typeof fetch;
  startOfficeOutboxScheduler("redis://unused", receiver);
  await processJob(job);
  expect(deliver).toHaveBeenCalledWith(deliveryRow, {
    url: process.env.OFFICE_WEBHOOK_URL,
    secret: "test-secret",
    fetch: receiver,
  });
  expect(updates).toEqual([
    { sentAt: expect.any(Date), attempts: 1, lastError: null },
  ]);
});
test("failure persists attempt before rejecting for BullMQ retry", async () => {
  startOfficeOutboxScheduler("redis://unused");
  deliver.mockImplementation(async () => {
    throw new Error("sensitive receiver response");
  });
  await expect(processJob(job)).rejects.toThrow("Office delivery failed");
  expect(updates).toEqual([
    { attempts: 1, lastError: "Office delivery failed" },
  ]);
});
test("missing, already delivered and exhausted rows cannot deliver again", async () => {
  startOfficeOutboxScheduler("redis://unused");
  for (const row of [
    undefined,
    { sentAt: new Date(), attempts: 1 },
    { sentAt: null, attempts: 8 },
  ]) {
    deliveryRow = row;
    await processJob(job);
  }
  expect(deliver).not.toHaveBeenCalled();
  expect(updates).toEqual([]);
});
test("dispatch enqueues pending rows with bounded retries and only overdue valid overrides", async () => {
  const scheduler = startOfficeOutboxScheduler("redis://unused")!;
  exceptions = [
    { id: "null", meta: null },
    { id: "empty", meta: {} },
    { id: "invalid", meta: { overriddenAt: "garbage" } },
    { id: "future", meta: { overriddenAt: "2099-01-01T00:00:00Z" } },
    { id: "overdue", meta: { overriddenAt: "2000-01-01T00:00:00Z" } },
  ];
  pending = [{ id: "pending" }];
  await processJob({ name: "dispatch", data: {} });
  expect(enqueue).toHaveBeenCalledWith(database, "payment_mode.changed", {
    state: "sandbox",
  });
  expect(enqueue).toHaveBeenCalledWith(
    database,
    "booking.escalated",
    { id: "overdue" },
    "booking-escalated-overdue-946684800000",
  );
  expect(enqueue).toHaveBeenCalledTimes(2);
  expect(add).toHaveBeenCalledWith(
    "deliver",
    { id: "pending" },
    {
      jobId: "pending",
      attempts: 8,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: true,
      removeOnFail: { count: 100 },
    },
  );
  await scheduler.start();
  expect(schedule).toHaveBeenCalledWith(
    "office-dispatch",
    { every: 15000 },
    expect.objectContaining({ name: "dispatch" }),
  );
  await scheduler.close();
  expect(closeWorker).toHaveBeenCalledTimes(1);
  expect(closeQueue).toHaveBeenCalledTimes(1);
});
test("unchanged live mode emits no duplicate mode event", async () => {
  process.env.MIDTRANS_MODE = "live";
  previous = [{ state: "live" }];
  startOfficeOutboxScheduler("redis://unused");
  await processJob({ name: "dispatch", data: {} });
  expect(enqueue).not.toHaveBeenCalled();
  expect(add).not.toHaveBeenCalled();
});
test("exhaustion alerts only final delivery failures and handles unavailable Discord", async () => {
  startOfficeOutboxScheduler("redis://unused");
  onFailed();
  onFailed({ ...job, name: "dispatch", attemptsMade: 8 });
  onFailed({ ...job, attemptsMade: 7 });
  expect(log).not.toHaveBeenCalled();
  onFailed({ ...job, attemptsMade: 8 });
  expect(log).toHaveBeenCalledWith({
    level: "error",
    action: "office_outbox_exhausted",
    eventId: "event-1",
  });
  process.env.DISCORD_WEBHOOK_URL = "https://discord.example.test";
  const alert = mock(async () => {
    throw new Error("offline");
  });
  globalThis.fetch = alert as unknown as typeof fetch;
  onFailed({ ...job, attemptsMade: 8 });
  await Promise.resolve();
  await Promise.resolve();
  expect(alert).toHaveBeenCalledWith(
    "https://discord.example.test",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        content: "Cogito Office event delivery exhausted: event-1",
      }),
    }),
  );
  expect(log).toHaveBeenCalledWith({
    level: "error",
    action: "office_ops_alert_failed",
  });
});
