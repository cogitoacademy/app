import { describe, test, expect, mock } from "bun:test";
import {
  findBookingById,
  listBookingsByState,
  getStateHistory,
  updateBookingWithOverride,
  insertStateHistoryEntry,
  findParticipantsByBookingId,
  findPaymentById,
  updatePaymentStatus,
  createAdminBookingRepo,
} from "../../modules/admin-booking/admin-booking.repo";

function makeQueryChain(resolvedValue: any) {
  const chain: any = {};
  const methods = ["from", "where", "limit", "offset", "orderBy"];
  const promise = Promise.resolve(resolvedValue);

  for (const method of methods) {
    chain[method] = mock(() => promise);
  }

  for (const method of methods) {
    (promise as any)[method] = chain[method];
  }

  return { chain, promise };
}

function makeSelectConn(resolvedValue: any) {
  const { chain, promise } = makeQueryChain(resolvedValue);
  const select = mock(() => promise);
  return { select, chain };
}

function makeUpdateConn(returningRows: any[] = []) {
  const returning = mock(() => Promise.resolve(returningRows));
  const where = mock(() => ({ returning }));
  const set = mock(() => ({ where }));
  const update = mock(() => ({ set }));
  return { update, set, where, returning };
}

function makeInsertConn() {
  const values = mock(async () => {});
  const insert = mock(() => ({ values }));
  return { insert, values };
}

describe("findBookingById", () => {
  test("returns row when found", async () => {
    const row = { id: "b1" };
    const { select, chain } = makeSelectConn([row]);
    const conn: any = { select };

    const result = await findBookingById(conn, "b1");

    expect(result).toEqual(row);
    expect(chain.from).toHaveBeenCalledTimes(1);
    expect(chain.where).toHaveBeenCalledTimes(1);
    expect(chain.limit).toHaveBeenCalledWith(1);
  });

  test("returns null when not found", async () => {
    const { select } = makeSelectConn([]);
    const conn: any = { select };

    const result = await findBookingById(conn, "missing");

    expect(result).toBeNull();
  });
});

describe("listBookingsByState", () => {
  test("queries with states and uses limit + 1 for pagination", async () => {
    const rows = [{ id: "b1" }, { id: "b2" }];
    const { select, chain } = makeSelectConn(rows);
    const conn: any = { select };

    await listBookingsByState(conn, ["pending"], 10);

    expect(chain.from).toHaveBeenCalledTimes(1);
    expect(chain.orderBy).toHaveBeenCalledTimes(1);
    expect(chain.limit).toHaveBeenCalledWith(11);
    expect(chain.where).toHaveBeenCalledTimes(1);
  });

  test("returns query without where when states empty", async () => {
    const rows = [{ id: "b1" }];
    const { select, chain } = makeSelectConn(rows);
    const conn: any = { select };

    await listBookingsByState(conn, [], 10);

    expect(chain.from).toHaveBeenCalledTimes(1);
    expect(chain.limit).toHaveBeenCalledWith(11);
    expect(chain.where).toHaveBeenCalledTimes(0);
  });
});

describe("getStateHistory", () => {
  test("selects from bookingStateHistory with bookingId", async () => {
    const rows = [{ id: "h1" }];
    const { select, chain } = makeSelectConn(rows);
    const conn: any = { select };

    await getStateHistory(conn, "b1");

    expect(chain.from).toHaveBeenCalledTimes(1);
    expect(chain.where).toHaveBeenCalledTimes(1);
    expect(chain.orderBy).toHaveBeenCalledTimes(1);
  });
});

describe("updateBookingWithOverride", () => {
  test("returns previousState and updated when booking exists", async () => {
    const existing = { currentState: "pending" };
    const updated = { id: "b1", currentState: "confirmed" };

    const { promise: selectPromise } = makeQueryChain([existing]);
    const select = mock(() => selectPromise);
    const updateConn = makeUpdateConn([updated]);
    const conn: any = { select, ...updateConn };

    const result = await updateBookingWithOverride(
      conn,
      "b1",
      "confirmed",
      "reason",
      { note: "override" },
    );

    expect(result).toEqual({ previousState: "pending", updated });
  });

  test("returns null when booking not found", async () => {
    const { promise: selectPromise } = makeQueryChain([]);
    const select = mock(() => selectPromise);
    const conn: any = { select };

    const result = await updateBookingWithOverride(
      conn,
      "missing",
      "confirmed",
      null,
      {},
    );

    expect(result).toBeNull();
  });
});

describe("insertStateHistoryEntry", () => {
  test("inserts values and returns void", async () => {
    const { insert, values } = makeInsertConn();
    const conn: any = { insert };

    await insertStateHistoryEntry(conn, {
      bookingId: "b1",
      fromState: null,
      toState: "pending",
      reason: null,
      actorId: null,
      actorType: "system",
    });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledTimes(1);
  });
});

describe("findParticipantsByBookingId", () => {
  test("selects from bookingParticipant with bookingId", async () => {
    const rows = [{ id: "p1" }];
    const { select, chain } = makeSelectConn(rows);
    const conn: any = { select };

    await findParticipantsByBookingId(conn, "b1");

    expect(chain.from).toHaveBeenCalledTimes(1);
    expect(chain.where).toHaveBeenCalledTimes(1);
  });
});

describe("findPaymentById", () => {
  test("returns row when found", async () => {
    const row = { id: "pay1" };
    const { select } = makeSelectConn([row]);
    const conn: any = { select };

    const result = await findPaymentById(conn, "pay1");

    expect(result).toEqual(row);
  });

  test("returns null when not found", async () => {
    const { select } = makeSelectConn([]);
    const conn: any = { select };

    const result = await findPaymentById(conn, "missing");

    expect(result).toBeNull();
  });
});

describe("updatePaymentStatus", () => {
  test("updates and returns updated row", async () => {
    const updated = { id: "pay1", status: "PAID" };
    const updateConn = makeUpdateConn([updated]);
    const conn: any = { ...updateConn };

    const result = await updatePaymentStatus(conn, "pay1", "PAID");

    expect(result).toEqual(updated);
    expect(updateConn.update).toHaveBeenCalledTimes(1);
    expect(updateConn.set).toHaveBeenCalledTimes(1);
  });

  test("returns null when no row updated", async () => {
    const updateConn = makeUpdateConn([]);
    const conn: any = { ...updateConn };

    const result = await updatePaymentStatus(conn, "missing", "PAID");

    expect(result).toBeNull();
  });
});

describe("createAdminBookingRepo", () => {
  test("returns object with all repo methods", () => {
    const repo = createAdminBookingRepo();

    expect(repo).toHaveProperty("findBookingById");
    expect(repo).toHaveProperty("listBookingsByState");
    expect(repo).toHaveProperty("getStateHistory");
    expect(repo).toHaveProperty("updateBookingWithOverride");
    expect(repo).toHaveProperty("insertStateHistoryEntry");
    expect(repo).toHaveProperty("findParticipantsByBookingId");
    expect(repo).toHaveProperty("findPaymentById");
    expect(repo).toHaveProperty("updatePaymentStatus");
  });
});
