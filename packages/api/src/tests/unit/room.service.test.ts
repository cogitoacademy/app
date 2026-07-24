import { describe, test, expect, mock } from "bun:test";
import { createRoomService } from "../../modules/room/room.service";
import type { RoomRepo } from "../../modules/room/room.repo";

function makeRoom(overrides: Record<string, unknown> = {}) {
  return {
    id: "room1",
    name: "Room A",
    location: "Building 1",
    capacity: 10,
    isActive: true,
    ...overrides,
  };
}

function makeRepo(overrides: Partial<RoomRepo> = {}): RoomRepo {
  return {
    findActiveRooms: mock(async () => []),
    insertRoom: mock(async () => ({})),
    findRoomById: mock(async () => null),
    findRoomBookings: mock(async () => []),
    findRoomBookingsForUpdate: mock(async () => []),
    insertRoomBooking: mock(async () => ({})),
    ...overrides,
  } as RoomRepo;
}

function makeDb() {
  const tx = {};
  return {
    transaction: mock(async (fn: any) => fn(tx)),
  } as any;
}

describe("createRoomService", () => {
  describe("listActive", () => {
    test("returns active rooms from repo", async () => {
      const rooms = [makeRoom(), makeRoom({ id: "room2", name: "Room B" })];
      const repo = makeRepo({ findActiveRooms: mock(async () => rooms) });

      const service = createRoomService(repo, makeDb());
      const result = await service.listActive();
      expect(result).toEqual(rooms);
    });
  });

  describe("createRoom", () => {
    test("inserts room and returns it", async () => {
      const room = makeRoom();
      const repo = makeRepo({ insertRoom: mock(async () => room) });

      const service = createRoomService(repo, makeDb());
      const result = await service.createRoom({
        name: "Room A",
        location: "Building 1",
        capacity: 10,
      });
      expect(result).toEqual(room);
    });
  });

  describe("checkAvailability", () => {
    test("returns true when no conflicts", async () => {
      const repo = makeRepo({ findRoomBookings: mock(async () => []) });

      const service = createRoomService(repo, makeDb());
      const result = await service.checkAvailability(
        "room1",
        new Date("2024-01-01T10:00:00Z"),
        new Date("2024-01-01T11:00:00Z"),
      );
      expect(result).toBe(true);
    });

    test("returns false when conflicts exist", async () => {
      const repo = makeRepo({
        findRoomBookings: mock(async () => [{ id: "rb1" }]),
      });

      const service = createRoomService(repo, makeDb());
      const result = await service.checkAvailability(
        "room1",
        new Date("2024-01-01T10:00:00Z"),
        new Date("2024-01-01T11:00:00Z"),
      );
      expect(result).toBe(false);
    });
  });

  describe("assignRoom", () => {
    test("throws notFound when room not found", async () => {
      const repo = makeRepo({ findRoomById: mock(async () => null) });

      const service = createRoomService(repo, makeDb());
      await expect(
        service.assignRoom(
          "b1",
          "room_missing",
          new Date("2024-01-01T10:00:00Z"),
          new Date("2024-01-01T11:00:00Z"),
        ),
      ).rejects.toThrow("Room not found");
    });

    test("throws conflict when room not available", async () => {
      const repo = makeRepo({
        findRoomById: mock(async () => makeRoom()),
        findRoomBookingsForUpdate: mock(async () => [{ id: "rb1" }]),
      });

      const service = createRoomService(repo, makeDb());
      await expect(
        service.assignRoom(
          "b1",
          "room1",
          new Date("2024-01-01T10:00:00Z"),
          new Date("2024-01-01T11:00:00Z"),
        ),
      ).rejects.toThrow("Room is already booked");
    });

    test("assigns room when available", async () => {
      const roomBookingRow = {
        id: "rb1",
        roomId: "room1",
        bookingId: "b1",
        startAt: new Date("2024-01-01T10:00:00Z"),
        endAt: new Date("2024-01-01T11:00:00Z"),
        status: "confirmed",
      };

      const repo = makeRepo({
        findRoomById: mock(async () => makeRoom()),
        findRoomBookingsForUpdate: mock(async () => []),
        insertRoomBooking: mock(async () => roomBookingRow),
      });

      const service = createRoomService(repo, makeDb());
      const result = await service.assignRoom(
        "b1",
        "room1",
        new Date("2024-01-01T10:00:00Z"),
        new Date("2024-01-01T11:00:00Z"),
      );
      expect(result).toEqual(roomBookingRow);
    });
  });
});
