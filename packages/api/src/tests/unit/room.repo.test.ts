import { describe, test, expect, mock } from "bun:test";
import {
  createRoomRepo,
  findActiveRooms,
  insertRoom,
  findRoomById,
  findRoomBookings,
  insertRoomBooking,
  findRequestedRoomBookingByBookingId,
  findBookingStateById,
} from "../../modules/room/room.repo";

function makeSelectConn(rows: any[] = [], hasLimit = false) {
  if (hasLimit) {
    const limit = mock(async () => rows);
    const where = mock(() => ({ limit }));
    const from = mock(() => ({ where }));
    const select = mock(() => ({ from }));
    return { select, from, where, limit };
  }
  const where = mock(async () => rows);
  const from = mock(() => ({ where }));
  const select = mock(() => ({ from }));
  return { select, from, where };
}

function makeInsertConn(returned: any[] = [{}]) {
  const returning = mock(async () => returned);
  const values = mock(() => ({ returning }));
  const insert = mock(() => ({ values }));
  return { insert, values, returning };
}

function makeQueryConn(roomResult: any = null) {
  const findFirst = mock(async () => roomResult);
  return { query: { room: { findFirst } } };
}

describe("findActiveRooms", () => {
  test("returns active rooms", async () => {
    const rooms = [{ id: "r1", name: "Room A", isActive: true }];
    const conn = { ...makeSelectConn(rooms, false) } as any;

    const result = await findActiveRooms(conn);

    expect(result).toEqual(rooms);
    expect(conn.select).toHaveBeenCalledTimes(1);
  });
});

describe("insertRoom", () => {
  test("inserts room and returns it", async () => {
    const inserted = {
      id: "r1",
      name: "Room A",
      location: "Bldg 1",
      capacity: 10,
    };
    const conn = { ...makeInsertConn([inserted]) } as any;

    const result = await insertRoom(conn, {
      name: "Room A",
      location: "Bldg 1",
      capacity: 10,
    });

    expect(result).toEqual(inserted);
    expect(conn.insert).toHaveBeenCalledTimes(1);
  });
});

describe("findRoomById", () => {
  test("returns room when found", async () => {
    const roomRow = { id: "r1", name: "Room A", isActive: true };
    const conn = { ...makeQueryConn(roomRow) } as any;

    const result = await findRoomById(conn, "r1");

    expect(result).toEqual(roomRow);
  });

  test("returns null when not found", async () => {
    const conn = { ...makeQueryConn(null) } as any;

    const result = await findRoomById(conn, "missing");

    expect(result).toBeNull();
  });
});

describe("findRoomBookings", () => {
  test("returns matching bookings", async () => {
    const bookings = [{ id: "rb1" }];
    const conn = { ...makeSelectConn(bookings, true) } as any;

    const startAt = new Date("2024-01-01T10:00:00Z");
    const endAt = new Date("2024-01-01T11:00:00Z");
    const result = await findRoomBookings(conn, "r1", startAt, endAt);

    expect(result).toEqual(bookings);
    expect(conn.select).toHaveBeenCalledTimes(1);
  });

  test("returns empty array when no bookings", async () => {
    const conn = { ...makeSelectConn([], true) } as any;

    const startAt = new Date("2024-01-01T10:00:00Z");
    const endAt = new Date("2024-01-01T11:00:00Z");
    const result = await findRoomBookings(conn, "r1", startAt, endAt);

    expect(result).toEqual([]);
  });

  test("passes excludeBookingId when provided", async () => {
    const conn = { ...makeSelectConn([], true) } as any;

    const startAt = new Date("2024-01-01T10:00:00Z");
    const endAt = new Date("2024-01-01T11:00:00Z");
    await findRoomBookings(conn, "r1", startAt, endAt, "exclude-b1");

    expect(conn.select).toHaveBeenCalledTimes(1);
  });
});

describe("insertRoomBooking", () => {
  test("inserts booking and returns it", async () => {
    const inserted = {
      id: "rb1",
      roomId: "r1",
      bookingId: "b1",
      startAt: new Date("2024-01-01T10:00:00Z"),
      endAt: new Date("2024-01-01T11:00:00Z"),
      status: "confirmed",
    };
    const conn = { ...makeInsertConn([inserted]) } as any;

    const result = await insertRoomBooking(conn, {
      roomId: "r1",
      bookingId: "b1",
      startAt: new Date("2024-01-01T10:00:00Z"),
      endAt: new Date("2024-01-01T11:00:00Z"),
      status: "confirmed",
    });

    expect(result).toEqual(inserted);
    expect(conn.insert).toHaveBeenCalledTimes(1);
  });
});

describe("findRequestedRoomBookingByBookingId", () => {
  test("returns the latest requested room booking", async () => {
    const row = { id: "rb1", bookingId: "b1", status: "requested" };
    const findFirst = mock(async () => row);
    const conn: any = { query: { roomBooking: { findFirst } } };

    await expect(
      findRequestedRoomBookingByBookingId(conn, "b1"),
    ).resolves.toEqual(row);
    expect(findFirst).toHaveBeenCalledTimes(1);
  });
});

describe("findBookingStateById", () => {
  test("returns the booking's current state", async () => {
    const limit = mock(async () => [{ currentState: "scheduled" }]);
    const where = mock(() => ({ limit }));
    const from = mock(() => ({ where }));
    const select = mock(() => ({ from }));
    const conn = { select, from, where, limit } as any;

    const result = await findBookingStateById(conn, "b1");
    expect(result).toBe("scheduled");
  });

  test("returns null when the booking does not exist", async () => {
    const limit = mock(async () => []);
    const where = mock(() => ({ limit }));
    const from = mock(() => ({ where }));
    const select = mock(() => ({ from }));
    const conn = { select, from, where, limit } as any;

    const result = await findBookingStateById(conn, "missing");
    expect(result).toBeNull();
  });
});

describe("createRoomRepo", () => {
  test("returns object with all repo methods", () => {
    const r = createRoomRepo();

    expect(r).toHaveProperty("findActiveRooms");
    expect(r).toHaveProperty("findPendingRoomApprovals");
    expect(r).toHaveProperty("findPendingApprovalBookingById");
    expect(r).toHaveProperty("findBookingStateById");
    expect(r).toHaveProperty("insertRoom");
    expect(r).toHaveProperty("findRoomById");
    expect(r).toHaveProperty("findRoomBookings");
    expect(r).toHaveProperty("insertRoomBooking");
    expect(typeof r.findActiveRooms).toBe("function");
    expect(typeof r.insertRoom).toBe("function");
    expect(typeof r.findRoomById).toBe("function");
    expect(typeof r.findRoomBookings).toBe("function");
    expect(typeof r.insertRoomBooking).toBe("function");
  });
});

describe("findRoomBookingsForUpdate", () => {
  test("returns matching bookings with row lock", async () => {
    const bookings = [{ id: "rb1" }];

    const { findRoomBookingsForUpdate } =
      await import("../../modules/room/room.repo");

    const result = await findRoomBookingsForUpdate(
      {
        select: () => ({
          from: () => ({
            where: () => ({
              for: () => ({
                limit: () => Promise.resolve(bookings),
              }),
            }),
          }),
        }),
      } as any,
      "r1",
      new Date("2024-01-01T10:00:00Z"),
      new Date("2024-01-01T11:00:00Z"),
    );
    expect(result).toEqual(bookings);
  });

  test("passes excludeBookingId when provided", async () => {
    const bookings: any[] = [];
    const { findRoomBookingsForUpdate } =
      await import("../../modules/room/room.repo");

    const result = await findRoomBookingsForUpdate(
      {
        select: () => ({
          from: () => ({
            where: () => ({
              for: () => ({
                limit: () => Promise.resolve(bookings),
              }),
            }),
          }),
        }),
      } as any,
      "r1",
      new Date("2024-01-01T10:00:00Z"),
      new Date("2024-01-01T11:00:00Z"),
      "exclude-b1",
    );
    expect(result).toEqual([]);
  });

  test("returns empty array when no bookings found", async () => {
    const { findRoomBookingsForUpdate } =
      await import("../../modules/room/room.repo");

    const result = await findRoomBookingsForUpdate(
      {
        select: () => ({
          from: () => ({
            where: () => ({
              for: () => ({
                limit: () => Promise.resolve([]),
              }),
            }),
          }),
        }),
      } as any,
      "r1",
      new Date("2024-01-01T10:00:00Z"),
      new Date("2024-01-01T11:00:00Z"),
    );
    expect(result).toEqual([]);
  });
});
