import { expect, mock, test } from "bun:test";
import {
  academyClass,
  academyClassSession,
  academyClassSessionReport,
  auditLog,
} from "@cogito-app/db/schema";
import { createClassMinimumLifecycle } from "../../modules/class-enrollment/class-enrollment.minimum";

const classId = "e25d73bc-43e9-4ec7-a967-d5a4d9fe7d39";
const sessionId = "ac71dac9-b574-4a72-9891-3d3f939cebae";
const now = new Date("2040-01-01T00:00:00Z");
const day = 86400000;
const session = {
  id: sessionId,
  classId,
  state: "scheduled",
  version: 1,
  tutorId: "t1",
  roomId: "r1",
  sequenceNumber: 1,
  startAt: new Date(now.getTime() + day),
  endAt: new Date(now.getTime() + day + 3600000),
};
const input = {
  classId,
  expectedClassVersion: 1,
  decision: "postpone" as const,
  reason: "Minimum enrollment unmet",
  replacementStarts: [
    {
      sessionId,
      expectedSessionVersion: 1,
      startAt: new Date(now.getTime() + 4 * day),
    },
  ],
};

function minimumFixture(
  options: { clock?: () => Date; failedUpdate?: object; receipt?: object } = {},
) {
  const record = {
    id: classId,
    kind: "cohort",
    state: "published",
    version: 1,
    minimumCheckAt: now,
    minimumEnrollment: 3,
    minimumCheckResolvedAt: null,
    postponementCount: 0,
    freeExitUntil: null,
  };
  const tx = {
    execute: mock(async () => undefined),
    select: (projection?: object) => {
      let rows: unknown[] = [];
      const query = {
        from: (table: object) => {
          rows =
            table === auditLog && options.receipt
              ? [options.receipt]
              : projection
                ? []
                : table === academyClass
                  ? [record]
                  : table === academyClassSession
                    ? [session]
                    : table === academyClassSessionReport
                      ? []
                      : [];
          return query;
        },
        innerJoin: () => query,
        where: () => query,
        orderBy: () => query,
        limit: () => query,
        for: () => query,
        // eslint-disable-next-line unicorn/no-thenable -- Drizzle queries are PromiseLike.
        then: (resolve: (rows: unknown[]) => unknown) =>
          Promise.resolve(rows).then(resolve),
      };
      return query;
    },
    update: (table: object) => ({
      set: (values: Record<string, unknown>) => ({
        where: () =>
          Object.assign(Promise.resolve(undefined), {
            returning: async () =>
              options.failedUpdate === table
                ? []
                : [{ id: sessionId, version: 2, ...values }],
          }),
      }),
    }),
    insert: () => ({ values: async () => undefined }),
  };
  const notification = { write: mock(async () => undefined) };
  return {
    service: createClassMinimumLifecycle({
      db: {
        transaction: async (run: (tx: unknown) => Promise<unknown>) => run(tx),
      } as never,
      notification: notification as never,
      clock: options.clock ?? (() => now),
    }),
    notification,
  };
}

test("postponement with a free managed room preserves duration and succeeds", async () => {
  const { service } = minimumFixture();
  const quote = await service.preview(input);
  expect(quote.replacementSessions[0]).toMatchObject({
    sessionId,
    startAt: input.replacementStarts[0]!.startAt,
    endAt: new Date(input.replacementStarts[0]!.startAt.getTime() + 3600000),
  });
});

test.each(["session-started", "deadline-moved"] as const)(
  "postponement detects %s during replacement review",
  async (scenario) => {
    let reads = 0;
    const advanced = new Date(
      now.getTime() + (scenario === "session-started" ? day : 60000),
    );
    const { service } = minimumFixture({
      clock: () => (++reads === 1 ? now : advanced),
    });
    const replacement =
      scenario === "deadline-moved"
        ? new Date(now.getTime() + 3 * day + 30000)
        : input.replacementStarts[0]!.startAt;
    await expect(
      service.preview({
        ...input,
        replacementStarts: [
          { ...input.replacementStarts[0]!, startAt: replacement },
        ],
      }),
    ).rejects.toThrow(
      scenario === "session-started"
        ? "session started while"
        : "72-hour deadline moved",
    );
  },
);

test.each([academyClassSession, academyClass])(
  "postponement refuses an optimistic session/class save race",
  async (failedUpdate) => {
    const { service, notification } = minimumFixture({ failedUpdate });
    const quote = await service.preview(input);
    await expect(
      service.confirm("admin1", {
        ...input,
        quoteVersion: quote.quoteVersion,
        requestKey: "65759e23-54c3-4cc7-91c0-f245466d12d7",
      }),
    ).rejects.toMatchObject({ code: "CLASS_ENROLLMENT_CONFLICT" });
    expect(notification.write).not.toHaveBeenCalled();
  },
);

test("minimum confirmation refuses stale preview before writing or notifying", async () => {
  const { service, notification } = minimumFixture();
  await expect(
    service.confirm("admin1", {
      ...input,
      quoteVersion: "f".repeat(64),
      requestKey: "65759e23-54c3-4cc7-91c0-f245466d12d7",
    }),
  ).rejects.toThrow("review a fresh minimum decision");
  expect(notification.write).not.toHaveBeenCalled();
});

test("minimum decision receipt replays once and refuses changed request terms", async () => {
  const quote = await minimumFixture().service.preview(input);
  const { service, notification } = minimumFixture({
    receipt: { details: { quote, reason: input.reason } },
  });
  const confirmation = {
    ...input,
    quoteVersion: quote.quoteVersion,
    requestKey: "65759e23-54c3-4cc7-91c0-f245466d12d7",
  };
  await expect(service.confirm("admin1", confirmation)).resolves.toEqual(quote);
  await expect(
    service.confirm("admin1", { ...confirmation, reason: "Changed" }),
  ).rejects.toThrow("request key was already used");
  expect(notification.write).not.toHaveBeenCalled();
});
