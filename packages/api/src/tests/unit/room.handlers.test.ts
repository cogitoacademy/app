import { describe, test, expect, mock } from "bun:test";
import { roomHandlers } from "../../modules/room/room.handlers";

describe("roomHandlers", () => {
  describe("list", () => {
    test("calls room.listActive", async () => {
      const listActive = mock(async () => [{ id: "r1" }]);
      const context = {
        session: { user: { id: "u1" } },
        services: { room: { listActive } },
      };

      const result = await roomHandlers.list({ context });

      expect(listActive).toHaveBeenCalledWith();
      expect(result).toEqual([{ id: "r1" }]);
    });
  });

  describe("create", () => {
    test("calls room.createRoom with input", async () => {
      const createRoom = mock(async () => ({ id: "r1" }));
      const context = {
        session: { user: { id: "u1" } },
        services: { room: { createRoom } },
      };
      const input = { name: "Room A", capacity: 10 };

      const result = await roomHandlers.create({ context, input });

      expect(createRoom).toHaveBeenCalledWith(input);
      expect(result).toEqual({ id: "r1" });
    });
  });

  describe("assign", () => {
    test("calls room.assignRoom with bookingId, roomId, and Date-converted startAt/endAt", async () => {
      const assignRoom = mock(async () => ({ ok: true }));
      const context = {
        session: { user: { id: "u1" } },
        services: { room: { assignRoom } },
      };
      const input = {
        bookingId: "b1",
        roomId: "r1",
        startAt: "2025-01-01T10:00:00Z",
        endAt: "2025-01-01T11:00:00Z",
      };

      const result = await roomHandlers.assign({ context, input });

      expect(assignRoom).toHaveBeenCalledWith(
        "b1",
        "r1",
        new Date("2025-01-01T10:00:00Z"),
        new Date("2025-01-01T11:00:00Z"),
      );
      expect(result).toEqual({ ok: true });
    });
  });
});
