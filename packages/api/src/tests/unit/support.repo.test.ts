import { describe, expect, mock, test } from "bun:test";
import { createSupportRepo } from "../../modules/support/support.repo";
import type { DbOrTx } from "../../lib/tx";

function queuedDb(results: unknown[][]) {
  const writes: unknown[] = [];
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    offset: () => chain,
    returning: () => chain,
    values: (value: unknown) => {
      writes.push(value);
      return chain;
    },
    set: (value: unknown) => {
      writes.push(value);
      return chain;
    },
    // eslint-disable-next-line unicorn/no-thenable -- emulate Drizzle PromiseLike builders.
    then: (resolve: (value: unknown[]) => unknown) =>
      Promise.resolve(results.shift() ?? []).then(resolve),
  };
  return {
    conn: {
      select: () => chain,
      insert: () => chain,
      update: () => chain,
    } as unknown as DbOrTx,
    writes,
  };
}

function makeSelectDb(rows: unknown[] = []) {
  const limit = mock(async () => rows);
  const offset = mock(() => ({ limit }));
  const orderBy = mock(() => ({ offset, limit }));
  const where = mock(() => ({ orderBy, offset, limit }));
  const from = mock(() => ({ where }));
  const select = mock(() => ({ from }));
  return { select, from, where, orderBy, offset, limit };
}

describe("SupportRepo", () => {
  test("inserts nullable booking links and preserves explicit links", async () => {
    for (const bookingId of [undefined, "booking-1"]) {
      const f = queuedDb([[{ id: "ticket-1" }]]);
      expect(
        await createSupportRepo().insert(f.conn, {
          reporterId: "user-1",
          bookingId,
          category: "booking",
          description: "Help",
          slaDeadline: new Date(),
        }),
      ).toMatchObject({ id: "ticket-1" });
      expect(f.writes[0]).toMatchObject({ bookingId: bookingId ?? null });
    }
  });

  test("returns missing tickets as null and persists resolution and escalation", async () => {
    const repo = createSupportRepo();
    expect(await repo.findById(queuedDb([[]]).conn, "missing")).toBeNull();
    expect(
      await repo.findById(queuedDb([[{ id: "t1" }]]).conn, "t1"),
    ).toMatchObject({ id: "t1" });
    const resolution = {
      status: "resolved",
      resolution: "Fixed",
      assignedTo: "admin",
    };
    const f = queuedDb([[{ id: "t1", ...resolution }], []]);
    expect(await repo.updateResolution(f.conn, "t1", resolution)).toMatchObject(
      resolution,
    );
    await repo.markEscalated(f.conn, "t2");
    expect(f.writes).toEqual([resolution, { status: "in_progress" }]);
    expect(
      await repo.updateResolution(queuedDb([[]]).conn, "missing", resolution),
    ).toBeUndefined();
    expect(
      await repo.listPastSla(queuedDb([[{ id: "overdue" }]]).conn),
    ).toEqual([{ id: "overdue" }]);
  });

  test("restricts booking context to proposer or enrolled participant", async () => {
    const repo = createSupportRepo();
    const booking = { id: "b1", proposerId: "proposer", tutorId: "tutor" };
    expect(
      await repo.findBookingForReporter(queuedDb([[]]).conn, "b1", "unknown"),
    ).toBeNull();
    expect(
      await repo.findBookingForReporter(
        queuedDb([[booking]]).conn,
        "b1",
        "proposer",
      ),
    ).toEqual(booking);
    expect(
      await repo.findBookingForReporter(
        queuedDb([[booking]]).conn,
        "b1",
        "tutor",
      ),
    ).toBeNull();
    expect(
      await repo.findBookingForReporter(
        queuedDb([[booking], [{ id: "participant" }]]).conn,
        "b1",
        "student",
      ),
    ).toEqual(booking);
    expect(
      await repo.findBookingForReporter(
        queuedDb([[booking], []]).conn,
        "b1",
        "stranger",
      ),
    ).toBeNull();
  });

  test("supports unfiltered reporter and admin lists", async () => {
    expect(
      await createSupportRepo().listByReporter(queuedDb([[]]).conn, "user", {
        limit: 10,
      }),
    ).toEqual([]);
    expect(
      await createSupportRepo().adminList(queuedDb([[]]).conn, {
        limit: 10,
        offset: 0,
      }),
    ).toEqual([]);
  });
  test("filters reporter tickets by status", async () => {
    const db = makeSelectDb([{ id: "t1" }]);
    const repo = createSupportRepo();

    await expect(
      repo.listByReporter(db as any, "u1", { status: "open", limit: 10 }),
    ).resolves.toEqual([{ id: "t1" }]);
  });

  test("filters admin tickets by status", async () => {
    const rows = [{ id: "t1" }];
    const offset = mock(async () => rows);
    const limit = mock(() => ({ offset }));
    const orderBy = mock(() => ({ limit }));
    const where = mock(() => ({ orderBy }));
    const from = mock(() => ({ where }));
    const select = mock(() => ({ from }));
    const db = { select };
    const repo = createSupportRepo();

    await expect(
      repo.adminList(db as any, { status: "open", limit: 10, offset: 0 }),
    ).resolves.toEqual([{ id: "t1" }]);
  });
});
