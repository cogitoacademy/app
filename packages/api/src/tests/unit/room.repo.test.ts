import { describe, test, expect, mock } from "bun:test";
import {
  createRoomRepo,
  findActiveRooms,
  insertRoom,
  findRoomById,
  findRoomBookings,
  insertRoomBooking,
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

describe("createRoomRepo", () => {
  test("returns object with all repo methods", () => {
    const r = createRoomRepo({} as any);

    expect(r).toHaveProperty("findActiveRooms");
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
