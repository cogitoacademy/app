import { describe, test, expect, mock } from "bun:test";
import { createRefundRepo } from "../../modules/refund/refund.repo";

function makeInsertConn(returned: any[] = [{}]) {
  const returning = mock(async () => returned);
  const values = mock(() => ({ returning }));
  const insert = mock(() => ({ values }));
  return { insert, values, returning };
}

function makeUpdateConn(returned: any[] = [{}]) {
  const returning = mock(async () => returned);
  const where = mock(() => ({ returning }));
  const set = mock(() => ({ where }));
  const update = mock(() => ({ set }));
  return { update, set, where, returning };
}

const repo = createRefundRepo();

describe("insertRefundRecord", () => {
  test("inserts and returns refund record", async () => {
    const inserted = {
      id: "r1",
      paymentId: null,
      walletId: "w1",
      amountIdr: 1000,
      marks: 10,
      reason: "duplicate",
      actorId: null,
    };
    const conn = { ...makeInsertConn([inserted]) } as any;

    const result = await repo.insertRefundRecord(conn, {
      paymentId: null,
      walletId: "w1",
      amountIdr: 1000,
      marks: 10,
      reason: "duplicate",
    });

    expect(result).toEqual(inserted);
    expect(conn.insert).toHaveBeenCalledTimes(1);
    expect(conn.values).toHaveBeenCalledTimes(1);
    expect(conn.returning).toHaveBeenCalledTimes(1);
  });

  test("passes actorId when provided", async () => {
    const inserted = { id: "r2", actorId: "admin1" };
    const conn = { ...makeInsertConn([inserted]) } as any;

    const result = await repo.insertRefundRecord(conn, {
      paymentId: "pay1",
      walletId: "w1",
      amountIdr: 500,
      marks: 5,
      reason: "error",
      actorId: "admin1",
    });

    expect(result).toEqual(inserted);
  });

  test("defaults paymentId and actorId to null", async () => {
    const conn = { ...makeInsertConn([{ id: "r3" }]) } as any;

    await repo.insertRefundRecord(conn, {
      walletId: "w2",
      amountIdr: 200,
      marks: 2,
      reason: "test",
    });

    expect(conn.values).toHaveBeenCalledTimes(1);
  });
});

describe("updatePaymentStatus", () => {
  test("updates and returns payment row", async () => {
    const updated = { id: "pay1", status: "refunded" };
    const conn = { ...makeUpdateConn([updated]) } as any;

    const result = await repo.updatePaymentStatus(conn, "pay1", "refunded");

    expect(result).toEqual(updated);
    expect(conn.update).toHaveBeenCalledTimes(1);
    expect(conn.set).toHaveBeenCalledTimes(1);
    expect(conn.where).toHaveBeenCalledTimes(1);
    expect(conn.returning).toHaveBeenCalledTimes(1);
  });

  test("returns null when no row updated", async () => {
    const conn = { ...makeUpdateConn([]) } as any;

    const result = await repo.updatePaymentStatus(conn, "missing", "refunded");

    expect(result).toBeNull();
  });
});

describe("createRefundRepo", () => {
  test("returns object with all repo methods", () => {
    const r = createRefundRepo();

    expect(r).toHaveProperty("insertRefundRecord");
    expect(r).toHaveProperty("updatePaymentStatus");
    expect(typeof r.insertRefundRecord).toBe("function");
    expect(typeof r.updatePaymentStatus).toBe("function");
  });
});
