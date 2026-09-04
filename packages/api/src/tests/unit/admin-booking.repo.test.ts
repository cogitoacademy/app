import { describe, test, expect, mock } from "bun:test";
import {
  updateBookingWithOverride,
  insertStateHistoryEntry,
  findParticipantsByBookingId,
  findPaymentById,
  listCreditStatePaymentsForUser,
  updatePaymentStatus,
  updateBookingHoldAmount,
  createAdminBookingRepo,
  listBookingsByState,
  getStateHistory,
} from "../../modules/admin-booking/admin-booking.repo";

function makeUpdateConn(returned: any[] = [{}]) {
  const returning = mock(async () => returned);
  const where = mock(() => ({ returning }));
  const set = mock(() => ({ where }));
  const update = mock(() => ({ set }));
  return { update, set, where, returning };
}

function makeInsertConn(returned: any[] = [{}]) {
  const returning = mock(async () => returned);
  const values = mock(() => ({ returning }));
  const insert = mock(() => ({ values }));
  return { insert, values, returning };
}

describe("admin-booking.repo", () => {
  describe("updateBookingWithOverride", () => {
    test("returns null when booking not found", async () => {
      const selectLimit = mock(async () => []);
      const selectWhere = mock(() => ({ limit: selectLimit }));
      const selectFrom = mock(() => ({ where: selectWhere }));
      const select = mock(() => ({ from: selectFrom }));
      const updateConn = makeUpdateConn([]);
      const conn = { ...updateConn, select } as any;

      const result = await updateBookingWithOverride(
        conn,
        "missing",
        "cancelled",
        "admin override",
        {},
      );
      expect(result).toBeNull();
    });

    test("updates booking and returns previous state", async () => {
      const previousState = { currentState: "confirmed" };
      const updated = {
        id: "b1",
        currentState: "cancelled",
        stateReason: "admin override",
      };
      const selectLimit = mock(async () => [previousState]);
      const selectWhere = mock(() => ({ limit: selectLimit }));
      const selectFrom = mock(() => ({ where: selectWhere }));
      const select = mock(() => ({ from: selectFrom }));
      const updateConn = makeUpdateConn([updated]);
      const conn = { ...updateConn, select } as any;

      const result = await updateBookingWithOverride(
        conn,
        "b1",
        "cancelled",
        "admin override",
        { overriddenBy: "admin1" },
      );

      expect(result).not.toBeNull();
      expect(result!.previousState).toBe("confirmed");
      expect(result!.updated).toEqual(updated);
    });
  });

  describe("insertStateHistoryEntry", () => {
    test("inserts state history entry", async () => {
      const conn = makeInsertConn() as any;
      await insertStateHistoryEntry(conn, {
        bookingId: "b1",
        fromState: "confirmed",
        toState: "cancelled",
        reason: "admin override",
        actorId: "admin1",
        actorType: "admin",
        metadata: { overriddenBy: "admin1" },
      });
      expect(conn.insert).toHaveBeenCalledTimes(1);
      expect(conn.values).toHaveBeenCalledTimes(1);
    });
  });

  describe("findParticipantsByBookingId", () => {
    test("returns participants for booking", async () => {
      const rows = [{ id: "p1" }, { id: "p2" }];
      const where = mock(() => rows);
      const from = mock(() => ({ where }));
      const select = mock(() => ({ from }));
      const conn = { select, from, where } as any;

      const result = await findParticipantsByBookingId(conn, "b1");
      expect(result).toEqual(rows);
    });
  });

  describe("findPaymentById", () => {
    test("returns payment when found", async () => {
      const row = { id: "pay1", status: "PAID" };
      const limit = mock(async () => [row]);
      const where = mock(() => ({ limit }));
      const from = mock(() => ({ where }));
      const select = mock(() => ({ from }));
      const conn = { select, from, where, limit } as any;

      const result = await findPaymentById(conn, "pay1");
      expect(result).toEqual(row);
    });

    test("returns null when not found", async () => {
      const limit = mock(async () => []);
      const where = mock(() => ({ limit }));
      const from = mock(() => ({ where }));
      const select = mock(() => ({ from }));
      const conn = { select, from, where, limit } as any;

      const result = await findPaymentById(conn, "missing");
      expect(result).toBeNull();
    });
  });

  describe("listCreditStatePaymentsForUser", () => {
    test("lists the user's credit-state payments oldest first", async () => {
      const rows = [
        { id: "pay1", userId: "u1", status: "PAID" },
        { id: "pay2", userId: "u1", status: "SETTLED" },
      ];
      const orderBy = mock(async () => rows);
      const where = mock(() => ({ orderBy }));
      const from = mock(() => ({ where }));
      const select = mock(() => ({ from }));
      const conn = { select, from, where, orderBy } as any;

      const result = await listCreditStatePaymentsForUser(conn, "u1");

      expect(result).toEqual(rows);
      expect(from).toHaveBeenCalledTimes(1);
      expect(where).toHaveBeenCalledTimes(1);
      expect(orderBy).toHaveBeenCalledTimes(1);
    });
  });

  describe("updatePaymentStatus", () => {
    test("updates payment status and returns updated row", async () => {
      const updated = { id: "pay1", status: "PAID" };
      const conn = makeUpdateConn([updated]) as any;

      const result = await updatePaymentStatus(conn, "pay1", "PAID");
      expect(result).toEqual(updated);
    });

    test("returns null when payment not found", async () => {
      const conn = makeUpdateConn([]) as any;

      const result = await updatePaymentStatus(conn, "missing", "PAID");
      expect(result).toBeNull();
    });
  });

  describe("updateBookingHoldAmount", () => {
    test("updates booking hold amount", async () => {
      const conn = makeUpdateConn() as any;
      await updateBookingHoldAmount(conn, "b1", 0);
      expect(conn.update).toHaveBeenCalledTimes(1);
      expect(conn.set).toHaveBeenCalledWith({ holdAmount: 0 });
    });
  });

  describe("createAdminBookingRepo", () => {
    test("returns object with all repo methods", () => {
      const repo = createAdminBookingRepo();
      expect(typeof repo.findBookingById).toBe("function");
      expect(typeof repo.listBookingsByState).toBe("function");
      expect(typeof repo.getStateHistory).toBe("function");
      expect(typeof repo.updateBookingWithOverride).toBe("function");
      expect(typeof repo.insertStateHistoryEntry).toBe("function");
      expect(typeof repo.findParticipantsByBookingId).toBe("function");
      expect(typeof repo.findPaymentById).toBe("function");
      expect(typeof repo.listCreditStatePaymentsForUser).toBe("function");
      expect(typeof repo.updatePaymentStatus).toBe("function");
      expect(typeof repo.updateBookingHoldAmount).toBe("function");
    });
  });

  describe("listBookingsByState", () => {
    function makeSelectConn(rows: any[] = []) {
      const limit = mock(async () => rows);
      const orderBy = mock(() => ({ limit }));
      const where = mock(() => ({ orderBy }));
      const from = mock(() => ({ where }));
      const select = mock(() => ({ from }));
      return { select, from, where, orderBy, limit };
    }

    test("queries without cursor when cursor is undefined", async () => {
      const rows = [{ id: "b1" }, { id: "b2" }];
      const conn = makeSelectConn(rows) as any;

      const result = await listBookingsByState(conn, [], 2);
      expect(result).toEqual(rows);
    });

    test("queries without states when states is empty", async () => {
      const rows = [{ id: "b1" }];
      const conn = makeSelectConn(rows) as any;

      const result = await listBookingsByState(conn, [], 1);
      expect(result).toEqual(rows);
    });

    test("queries with states filter", async () => {
      const rows = [{ id: "b1", currentState: "confirmed" }];
      const conn = makeSelectConn(rows) as any;

      const result = await listBookingsByState(conn, ["confirmed"], 1);
      expect(result).toEqual(rows);
      expect(conn.where).toHaveBeenCalled();
    });

    test("queries with cursor filter", async () => {
      const rows = [{ id: "b5" }, { id: "b6" }];
      const conn = makeSelectConn(rows) as any;

      const result = await listBookingsByState(conn, [], 2, "b4");
      expect(result).toEqual(rows);
      expect(conn.where).toHaveBeenCalled();
    });

    test("queries with both states and cursor filter", async () => {
      const rows = [{ id: "b5", currentState: "confirmed" }];
      const conn = makeSelectConn(rows) as any;

      const result = await listBookingsByState(conn, ["confirmed"], 1, "b4");
      expect(result).toEqual(rows);
      expect(conn.where).toHaveBeenCalled();
    });

    test("falls back to a legacy id cursor for malformed composite cursors", async () => {
      const conn = makeSelectConn([{ id: "b5" }]) as any;

      await listBookingsByState(conn, [], 2, "not-a-rank~not-a-date~b4");

      expect(conn.where).toHaveBeenCalled();
    });

    test("accepts a valid urgency composite cursor", async () => {
      const conn = makeSelectConn([{ id: "b5" }]) as any;

      await listBookingsByState(conn, [], 2, "1~2026-08-24T10:00:00.000Z~b4", {
        category: "force_cancel",
        urgency: "high",
      });

      expect(conn.where).toHaveBeenCalled();
    });

    test("queries with a booking number filter", async () => {
      const conn = makeSelectConn([{ id: "b12", bookingNumber: 12 }]) as any;

      await listBookingsByState(conn, [], 2, undefined, {
        bookingNumber: 12,
      });

      expect(conn.where).toHaveBeenCalled();
    });
  });

  describe("getStateHistory", () => {
    test("returns chronological state history", async () => {
      const rows = [{ bookingId: "b1", toState: "confirmed" }];
      const orderBy = mock(() => Promise.resolve(rows));
      const where = mock(() => ({ orderBy }));
      const from = mock(() => ({ where }));
      const select = mock(() => ({ from }));

      await expect(getStateHistory({ select } as any, "b1")).resolves.toEqual(
        rows,
      );
      expect(orderBy).toHaveBeenCalledTimes(1);
    });
  });
});
