import { describe, test, expect } from "bun:test";
import {
  listRoomsInput,
  listPendingRoomApprovalsInput,
  createRoomInput,
  assignRoomInput,
} from "../../modules/room/room.types";

describe("Room Types (Zod schemas)", () => {
  test("listRoomsInput accepts void", () => {
    expect(listRoomsInput.safeParse(undefined).success).toBe(true);
  });

  test("room list inputs accept bounded offset pages", () => {
    const input = { limit: 10, offset: 20 };
    expect(listRoomsInput.safeParse(input).success).toBe(true);
    expect(listPendingRoomApprovalsInput.safeParse(input).success).toBe(true);
    expect(listRoomsInput.safeParse({ limit: 101, offset: 0 }).success).toBe(
      false,
    );
    const legacyInput = listPendingRoomApprovalsInput.safeParse({ limit: 10 });
    expect(legacyInput.success).toBe(true);
    if (legacyInput.success) {
      expect(legacyInput.data.offset).toBe(0);
    }
  });

  test("createRoomInput parses valid input", () => {
    const result = createRoomInput.safeParse({
      name: "Room A",
      location: "Building 1",
      capacity: 10,
    });
    expect(result.success).toBe(true);
  });

  test("createRoomInput rejects empty name", () => {
    const result = createRoomInput.safeParse({
      name: "",
      location: "Building 1",
      capacity: 10,
    });
    expect(result.success).toBe(false);
  });

  test("createRoomInput rejects non-positive capacity", () => {
    expect(
      createRoomInput.safeParse({
        name: "Room A",
        location: "Building 1",
        capacity: 0,
      }).success,
    ).toBe(false);
    expect(
      createRoomInput.safeParse({
        name: "Room A",
        location: "Building 1",
        capacity: -1,
      }).success,
    ).toBe(false);
  });

  test("createRoomInput rejects non-integer capacity", () => {
    const result = createRoomInput.safeParse({
      name: "Room A",
      location: "Building 1",
      capacity: 1.5,
    });
    expect(result.success).toBe(false);
  });

  test("assignRoomInput coerces ISO date strings to Date objects", () => {
    const result = assignRoomInput.safeParse({
      bookingId: "b1",
      roomId: "r1",
      startAt: "2025-01-15T10:00:00Z",
      endAt: "2025-01-15T11:00:00Z",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.startAt).toBeInstanceOf(Date);
      expect(result.data.endAt).toBeInstanceOf(Date);
    }
  });

  test("assignRoomInput rejects missing required fields", () => {
    expect(assignRoomInput.safeParse({}).success).toBe(false);
    expect(
      assignRoomInput.safeParse({
        bookingId: "b1",
        roomId: "r1",
      }).success,
    ).toBe(false);
  });

  test("assignRoomInput rejects empty bookingId and roomId", () => {
    const result = assignRoomInput.safeParse({
      bookingId: "",
      roomId: "",
      startAt: "2025-01-15T10:00:00Z",
      endAt: "2025-01-15T11:00:00Z",
    });
    expect(result.success).toBe(false);
  });
});
