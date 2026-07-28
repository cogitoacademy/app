import { describe, test, expect, mock } from "bun:test";
import {
  updateBookingWithOverride,
  insertStateHistoryEntry,
  findParticipantsByBookingId,
  findPaymentById,
  updatePaymentStatus,
  updateBookingHoldAmount,
  createAdminBookingRepo,
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
      expect(typeof repo.updatePaymentStatus).toBe("function");
      expect(typeof repo.updateBookingHoldAmount).toBe("function");
    });
  });
});
