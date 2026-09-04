import { describe, test, expect, mock } from "bun:test";
import { createRoomHandler } from "../../modules/room/room.handler";

function makeRoomService() {
  return {
    listActive: mock(async () => [{ id: "r1" }]),
    listPendingApprovals: mock(async () => [{ bookingId: "b1" }]),
    createRoom: mock(async () => ({ id: "r1" })),
    assignRoom: mock(async () => ({
      id: "rb1",
      bookingId: "b1",
      roomId: "r1",
    })),
  };
}

describe("roomHandler", () => {
  describe("list", () => {
    test("calls room.listActive", async () => {
      const roomService = makeRoomService();
      const handler = createRoomHandler(roomService as any);

      const result = await handler.list({
        context: { session: { user: { id: "u1" } } },
      } as any);

      expect(roomService.listActive).toHaveBeenCalledWith();
      expect(result).toEqual([{ id: "r1" }]);
    });

    test("passes pagination input to room.listActive", async () => {
      const roomService = makeRoomService();
      const handler = createRoomHandler(roomService as any);
      const input = { limit: 10, offset: 20 };

      await handler.list({
        context: { session: { user: { id: "u1" } } },
        input,
      } as any);

      expect(roomService.listActive).toHaveBeenCalledWith(input);
    });
  });

  describe("listPendingApprovals", () => {
    test("passes the requested limit to room.listPendingApprovals", async () => {
      const roomService = makeRoomService();
      const handler = createRoomHandler(roomService as any);

      const result = await handler.listPendingApprovals({
        context: { session: { user: { id: "u1" } } },
        input: { limit: 25 },
      } as any);

      expect(roomService.listPendingApprovals).toHaveBeenCalledWith(25);
      expect(result).toEqual([{ bookingId: "b1" }]);
    });

    test("passes an offset page to room.listPendingApprovals", async () => {
      const roomService = makeRoomService();
      const handler = createRoomHandler(roomService as any);
      const input = { limit: 10, offset: 20 };

      await handler.listPendingApprovals({
        context: { session: { user: { id: "u1" } } },
        input,
      } as any);

      expect(roomService.listPendingApprovals).toHaveBeenCalledWith(10, 20);
    });
  });

  describe("create", () => {
    test("calls room.createRoom with input", async () => {
      const roomService = makeRoomService();
      const handler = createRoomHandler(roomService as any);
      const input = { name: "Room A", location: "Floor 1", capacity: 10 };

      const result = await handler.create({
        context: { session: { user: { id: "u1" } } } as any,
        input: input as any,
      });

      expect(roomService.createRoom).toHaveBeenCalledWith(input);
      expect(result).toEqual({ id: "r1" });
    });
  });

  describe("assign", () => {
    test("calls room.assignRoom with bookingId, roomId, startAt, and endAt as Date objects", async () => {
      const roomService = makeRoomService();
      const handler = createRoomHandler(roomService as any);
      const startAt = new Date("2025-01-01T10:00:00Z");
      const endAt = new Date("2025-01-01T11:00:00Z");
      const input = {
        bookingId: "b1",
        roomId: "r1",
        startAt,
        endAt,
      };

      const result = await handler.assign({
        context: { session: { user: { id: "u1" } } } as any,
        input: input as any,
      });

      expect(roomService.assignRoom).toHaveBeenCalledWith(
        "b1",
        "r1",
        startAt,
        endAt,
        "u1",
      );
      expect(result).toEqual({
        id: "rb1",
        bookingId: "b1",
        roomId: "r1",
      });
    });
  });
});
