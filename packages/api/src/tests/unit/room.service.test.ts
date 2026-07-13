import { describe, test, expect, mock } from "bun:test";
import { createRoomService } from "../../modules/room/room.service";

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

describe("createRoomService", () => {
  describe("listActive", () => {
    test("returns active rooms from db", async () => {
      const rooms = [makeRoom(), makeRoom({ id: "room2", name: "Room B" })];
      const db = {
        select: mock(() => ({
          from: mock(() => ({
            where: mock(async () => rooms),
          })),
        })),
      } as any;

      const service = createRoomService(db);
      const result = await service.listActive();
      expect(result).toEqual(rooms);
    });
  });

  describe("createRoom", () => {
    test("inserts room and returns it", async () => {
      const room = makeRoom();
      const db = {
        insert: mock(() => ({
          values: mock(() => ({
            returning: mock(async () => [room]),
          })),
        })),
      } as any;

      const service = createRoomService(db);
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
      const db = {
        select: mock(() => ({
          from: mock(() => ({
            where: mock(() => ({
              limit: mock(async () => []),
            })),
          })),
        })),
      } as any;

      const service = createRoomService(db);
      const result = await service.checkAvailability(
        "room1",
        new Date("2024-01-01T10:00:00Z"),
        new Date("2024-01-01T11:00:00Z"),
      );
      expect(result).toBe(true);
    });

    test("returns false when conflicts exist", async () => {
      const db = {
        select: mock(() => ({
          from: mock(() => ({
            where: mock(() => ({
              limit: mock(async () => [{ id: "rb1" }]),
            })),
          })),
        })),
      } as any;

      const service = createRoomService(db);
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
      const db = {
        query: {
          room: {
            findFirst: mock(async () => null),
          },
        },
      } as any;

      const service = createRoomService(db);
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
      const db = {
        query: {
          room: {
            findFirst: mock(async () => makeRoom()),
          },
        },
        select: mock(() => ({
          from: mock(() => ({
            where: mock(() => ({
              limit: mock(async () => [{ id: "rb1" }]),
            })),
          })),
        })),
      } as any;

      const service = createRoomService(db);
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
      const roomBooking = {
        id: "rb1",
        roomId: "room1",
        bookingId: "b1",
        startAt: new Date("2024-01-01T10:00:00Z"),
        endAt: new Date("2024-01-01T11:00:00Z"),
        status: "confirmed",
      };

      const db = {
        query: {
          room: {
            findFirst: mock(async () => makeRoom()),
          },
        },
        select: mock(() => ({
          from: mock(() => ({
            where: mock(() => ({
              limit: mock(async () => []),
            })),
          })),
        })),
        insert: mock(() => ({
          values: mock(() => ({
            returning: mock(async () => [roomBooking]),
          })),
        })),
      } as any;

      const service = createRoomService(db);
      const result = await service.assignRoom(
        "b1",
        "room1",
        new Date("2024-01-01T10:00:00Z"),
        new Date("2024-01-01T11:00:00Z"),
      );
      expect(result).toEqual(roomBooking);
    });
  });
});
