import { describe, test, expect } from "bun:test";
import {
  listRoomsInput,
  listPendingRoomApprovalsInput,
  createRoomInput,
  updateRoomInput,
  deactivateRoomInput,
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

  test("updateRoomInput accepts complete room details", () => {
    const result = updateRoomInput.safeParse({
      id: "room1",
      name: "Room B",
      location: "Building 2",
      capacity: 12,
    });

    expect(result.success).toBe(true);
  });

  test("updateRoomInput rejects an invalid room id or capacity", () => {
    expect(
      updateRoomInput.safeParse({
        id: "",
        name: "Room B",
        location: "Building 2",
        capacity: 12,
      }).success,
    ).toBe(false);
    expect(
      updateRoomInput.safeParse({
        id: "room1",
        name: "Room B",
        location: "Building 2",
        capacity: 1.5,
      }).success,
    ).toBe(false);
  });

  test("deactivateRoomInput accepts a room id", () => {
    expect(deactivateRoomInput.safeParse({ id: "room1" }).success).toBe(true);
    expect(deactivateRoomInput.safeParse({ id: "" }).success).toBe(false);
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
