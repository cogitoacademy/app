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
    findActiveRooms: mock(async (_conn: any) => []),
    findPendingRoomApprovals: mock(async (_conn: any, _limit?: number) => []),
    findPendingApprovalBookingById: mock(
      async (_conn: any, _bookingId: string) => null,
    ),
    insertRoom: mock(async (_conn: any, _values: any) => ({})),
    findRoomById: mock(async (_conn: any, _roomId: string) => null),
    findRoomBookings: mock(async (_conn: any) => []),
    findRoomBookingsForUpdate: mock(async (_conn: any) => []),
    insertRoomBooking: mock(async (_conn: any, _values: any) => ({})),
    findActiveRoomBookingByBookingId: mock(async (_conn: any) => null),
    findRequestedRoomBookingByBookingId: mock(async (_conn: any) => null),
    findCancellableRoomBookingByBookingId: mock(async (_conn: any) => null),
    findBookingStateById: mock(
      async (_conn: any) => "awaiting_admin_room_approval",
    ),
    updateRoomBookingStatus: mock(
      async (_conn: any, _id: string, status: string) => ({
        id: "rb1",
        status,
      }),
    ),
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

  describe("listPendingApprovals", () => {
    test("returns pending room approvals from repo", async () => {
      const approvals = [
        {
          bookingId: "b1",
          currentState: "awaiting_admin_room_approval",
          requestedRoomId: "room1",
        },
      ];
      const repo = makeRepo({
        findPendingRoomApprovals: mock(async (_conn, limit) => {
          expect(limit).toBe(25);
          return approvals;
        }),
      });

      const service = createRoomService(repo, makeDb());
      const result = await service.listPendingApprovals(25);

      expect(result).toEqual(approvals);
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
        findBookingStateById: mock(async () => "awaiting_admin_room_approval"),
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

    test("F22: assignRoom rejects a booking that is not awaiting room approval", async () => {
      const repo = makeRepo({
        findRoomById: mock(async () => makeRoom()),
        findRoomBookingsForUpdate: mock(async () => []),
        findBookingStateById: mock(async () => "confirmed"),
        insertRoomBooking: mock(async () => ({ id: "rb1" })),
      });

      const service = createRoomService(repo, makeDb());
      await expect(
        service.assignRoom(
          "b1",
          "room1",
          new Date("2024-01-01T10:00:00Z"),
          new Date("2024-01-01T11:00:00Z"),
        ),
      ).rejects.toThrow("room approval");
      expect(repo.insertRoomBooking).not.toHaveBeenCalled();
    });
  });

  describe("relocateRoom", () => {
    test("throws notFound when room not found", async () => {
      const repo = makeRepo({ findRoomById: mock(async () => null) });

      const service = createRoomService(repo, makeDb());
      await expect(
        service.relocateRoom(
          "b1",
          "room_missing",
          new Date("2024-01-01T10:00:00Z"),
          new Date("2024-01-01T11:00:00Z"),
        ),
      ).rejects.toThrow("Room not found");
    });

    test("throws notFound when booking has no active room booking", async () => {
      const repo = makeRepo({
        findRoomById: mock(async () => makeRoom()),
        findActiveRoomBookingByBookingId: mock(async () => null),
      });

      const service = createRoomService(repo, makeDb());
      await expect(
        service.relocateRoom(
          "b1",
          "room1",
          new Date("2024-01-01T10:00:00Z"),
          new Date("2024-01-01T11:00:00Z"),
        ),
      ).rejects.toThrow("no active room assignment");
    });

    test("throws conflict when new room is occupied", async () => {
      const repo = makeRepo({
        findRoomById: mock(async () => makeRoom()),
        findActiveRoomBookingByBookingId: mock(async () => ({
          id: "rb_old",
          roomId: "room_old",
          status: "confirmed",
        })),
        findRoomBookingsForUpdate: mock(async () => [{ id: "rb_x" }]),
      });

      const service = createRoomService(repo, makeDb());
      await expect(
        service.relocateRoom(
          "b1",
          "room1",
          new Date("2024-01-01T10:00:00Z"),
          new Date("2024-01-01T11:00:00Z"),
        ),
      ).rejects.toThrow("Room is already booked");
    });

    test("frees old room and confirms new room", async () => {
      const oldRow = {
        id: "rb_old",
        roomId: "room_old",
        bookingId: "b1",
        status: "confirmed",
      };
      const newRow = {
        id: "rb_new",
        roomId: "room1",
        bookingId: "b1",
        status: "confirmed",
      };

      const repo = makeRepo({
        findRoomById: mock(async () => makeRoom()),
        findActiveRoomBookingByBookingId: mock(async () => oldRow),
        findRoomBookingsForUpdate: mock(async () => []),
        updateRoomBookingStatus: mock(async () => ({
          ...oldRow,
          status: "relocated",
        })),
        insertRoomBooking: mock(async () => newRow),
      });

      const service = createRoomService(repo, makeDb());
      const result = await service.relocateRoom(
        "b1",
        "room1",
        new Date("2024-01-01T10:00:00Z"),
        new Date("2024-01-01T11:00:00Z"),
      );

      expect(repo.updateRoomBookingStatus).toHaveBeenCalledWith(
        expect.anything(),
        "rb_old",
        "relocated",
      );
      expect(repo.insertRoomBooking).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          roomId: "room1",
          bookingId: "b1",
          status: "confirmed",
        }),
      );
      expect(result).toEqual(newRow);
    });

    test("F22: relocateRoom rejects a booking in an unrelated state", async () => {
      const repo = makeRepo({
        findRoomById: mock(async () => makeRoom()),
        findActiveRoomBookingByBookingId: mock(async () => ({
          id: "rb_old",
          roomId: "room_old",
          status: "confirmed",
        })),
        findBookingStateById: mock(async () => "confirmed"),
        findRoomBookingsForUpdate: mock(async () => []),
        insertRoomBooking: mock(async () => ({ id: "rb_new" })),
      });

      const service = createRoomService(repo, makeDb());
      await expect(
        service.relocateRoom(
          "b1",
          "room1",
          new Date("2024-01-01T10:00:00Z"),
          new Date("2024-01-01T11:00:00Z"),
        ),
      ).rejects.toThrow("awaiting admin room approval");
      expect(repo.insertRoomBooking).not.toHaveBeenCalled();
      expect(repo.updateRoomBookingStatus).not.toHaveBeenCalled();
    });
  });

  describe("cancelRoomBooking", () => {
    test("throws notFound when booking has no active room booking", async () => {
      const repo = makeRepo({
        findCancellableRoomBookingByBookingId: mock(async () => null),
      });

      const service = createRoomService(repo, makeDb());
      await expect(service.cancelRoomBooking("b1")).rejects.toThrow(
        "no active room assignment",
      );
    });

    test("sets the active room booking to cancelled", async () => {
      const repo = makeRepo({
        findCancellableRoomBookingByBookingId: mock(async () => ({
          id: "rb1",
          roomId: "room1",
          status: "confirmed",
        })),
        updateRoomBookingStatus: mock(async () => ({
          id: "rb1",
          status: "cancelled",
        })),
      });

      const service = createRoomService(repo, makeDb());
      const result = await service.cancelRoomBooking("b1");

      expect(repo.updateRoomBookingStatus).toHaveBeenCalledWith(
        expect.anything(),
        "rb1",
        "cancelled",
      );
      expect(result.status).toBe("cancelled");
    });

    test("M6: cancels an awaiting-room-approval booking via the booking port (FR-22 no room available)", async () => {
      const repo = makeRepo({
        findCancellableRoomBookingByBookingId: mock(async () => ({
          id: "rb1",
          roomId: "room1",
          status: "requested",
        })),
        updateRoomBookingStatus: mock(async () => ({
          id: "rb1",
          status: "cancelled",
        })),
      });
      const notificationPort = { writeBestEffort: mock(async () => {}) };
      const bookingPort = {
        transitionBookingToScheduled: mock(async () => {}),
        getBookingRecipients: mock(async () => ({
          tutorId: "tutor1",
          participantUserIds: ["student1"],
        })),
        cancelOfflineBooking: mock(async () => {}),
      };

      const service = createRoomService(
        repo,
        makeDb(),
        bookingPort,
        notificationPort,
      );
      const result = await service.cancelRoomBooking("b1", "admin1");

      expect(bookingPort.cancelOfflineBooking).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        "admin1",
      );
      expect(result.status).toBe("cancelled");
    });

    test("M6: does not cancel the booking when the port is absent", async () => {
      const repo = makeRepo({
        findCancellableRoomBookingByBookingId: mock(async () => ({
          id: "rb1",
          roomId: "room1",
          status: "confirmed",
        })),
        updateRoomBookingStatus: mock(async () => ({
          id: "rb1",
          status: "cancelled",
        })),
      });

      const service = createRoomService(repo, makeDb());
      const result = await service.cancelRoomBooking("b1");
      expect(result.status).toBe("cancelled");
    });

    test("M6: cancels a pending booking when no requested room row exists", async () => {
      const repo = makeRepo({
        findCancellableRoomBookingByBookingId: mock(async () => null),
        findPendingApprovalBookingById: mock(async () => ({
          id: "b1",
          scheduledStartAt: new Date("2024-01-01T10:00:00Z"),
          scheduledEndAt: new Date("2024-01-01T11:00:00Z"),
        })),
      });
      const bookingPort = {
        transitionBookingToScheduled: mock(async () => {}),
        getBookingRecipients: mock(async () => ({
          tutorId: "tutor1",
          participantUserIds: ["student1"],
        })),
        cancelOfflineBooking: mock(async () => {}),
      };

      const service = createRoomService(repo, makeDb(), bookingPort);
      const result = await service.cancelRoomBooking("b1", "admin1");

      expect(bookingPort.cancelOfflineBooking).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        "admin1",
      );
      expect(result).toMatchObject({
        bookingId: "b1",
        status: "cancelled",
      });
    });
  });

  describe("cancelRequestedRoomForBooking (M7)", () => {
    test("cancels the pending requested row when present", async () => {
      const repo = makeRepo({
        findRequestedRoomBookingByBookingId: mock(async () => ({
          id: "rb_req",
          roomId: "room1",
          bookingId: "b1",
          status: "requested",
        })),
        updateRoomBookingStatus: mock(async () => ({
          id: "rb_req",
          status: "cancelled",
        })),
      });

      const service = createRoomService(repo, makeDb());
      await service.cancelRequestedRoomForBooking({}, "b1");

      expect(repo.findRequestedRoomBookingByBookingId).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
      );
      expect(repo.updateRoomBookingStatus).toHaveBeenCalledWith(
        expect.anything(),
        "rb_req",
        "cancelled",
      );
    });

    test("is a no-op when no requested row exists (already confirmed/cancelled)", async () => {
      const repo = makeRepo({
        findRequestedRoomBookingByBookingId: mock(async () => null),
      });

      const service = createRoomService(repo, makeDb());
      await service.cancelRequestedRoomForBooking({}, "b1");

      expect(repo.updateRoomBookingStatus).not.toHaveBeenCalled();
    });
  });
});

describe("room service notifications (P1-3)", () => {
  const roomBookingRow = {
    id: "rb1",
    roomId: "room1",
    bookingId: "b1",
    startAt: new Date("2024-01-01T10:00:00Z"),
    endAt: new Date("2024-01-01T11:00:00Z"),
    status: "confirmed",
  };

  function makePorts() {
    const notificationPort = { writeBestEffort: mock(async () => {}) };
    const bookingPort = {
      transitionBookingToScheduled: mock(async () => {}),
      getBookingRecipients: mock(async () => ({
        tutorId: "tutor1",
        participantUserIds: ["student1", "student2"],
      })),
      cancelOfflineBooking: mock(async () => {}),
    };
    return { notificationPort, bookingPort };
  }

  test("assignRoom notifies tutor and each confirmed student (emailRequired)", async () => {
    const repo = makeRepo({
      findRoomById: mock(async () => makeRoom()),
      findRoomBookingsForUpdate: mock(async () => []),
      insertRoomBooking: mock(async () => roomBookingRow),
    });
    const { notificationPort, bookingPort } = makePorts();

    const service = createRoomService(
      repo,
      makeDb(),
      bookingPort,
      notificationPort,
    );
    await service.assignRoom(
      "b1",
      "room1",
      new Date("2024-01-01T10:00:00Z"),
      new Date("2024-01-01T11:00:00Z"),
      "admin1",
    );

    expect(bookingPort.transitionBookingToScheduled).toHaveBeenCalledWith(
      expect.anything(),
      "b1",
      "admin1",
    );
    expect(notificationPort.writeBestEffort).toHaveBeenCalledTimes(3);
    const calls = notificationPort.writeBestEffort.mock.calls.map(
      (c: any) => c[0],
    );
    expect(calls.map((c: any) => c.userId).toSorted()).toEqual(
      ["student1", "student2", "tutor1"].toSorted(),
    );
    for (const call of calls) {
      expect(call.emailRequired).toBe(true);
      expect(call.category).toBe("booking");
    }
    expect(calls[0].eventKey).toContain("room.b1.assigned");
  });

  test("relocateRoom notifies tutor and confirmed students", async () => {
    const repo = makeRepo({
      findRoomById: mock(async () => makeRoom()),
      findActiveRoomBookingByBookingId: mock(async () => ({
        id: "rb_old",
        roomId: "room_old",
        status: "confirmed",
      })),
      findRoomBookingsForUpdate: mock(async () => []),
      updateRoomBookingStatus: mock(async () => ({
        id: "rb_old",
        status: "relocated",
      })),
      insertRoomBooking: mock(async () => roomBookingRow),
    });
    const { notificationPort, bookingPort } = makePorts();

    const service = createRoomService(
      repo,
      makeDb(),
      bookingPort,
      notificationPort,
    );
    await service.relocateRoom(
      "b1",
      "room1",
      new Date("2024-01-01T10:00:00Z"),
      new Date("2024-01-01T11:00:00Z"),
    );

    expect(notificationPort.writeBestEffort).toHaveBeenCalledTimes(3);
    const calls = notificationPort.writeBestEffort.mock.calls.map(
      (c: any) => c[0],
    );
    expect(calls[0].eventKey).toContain("room.b1.relocated");
  });

  test("cancelRoomBooking notifies tutor and confirmed students", async () => {
    const repo = makeRepo({
      findCancellableRoomBookingByBookingId: mock(async () => ({
        id: "rb1",
        roomId: "room1",
        status: "confirmed",
      })),
      updateRoomBookingStatus: mock(async () => ({
        id: "rb1",
        status: "cancelled",
      })),
    });
    const { notificationPort, bookingPort } = makePorts();

    const service = createRoomService(
      repo,
      makeDb(),
      bookingPort,
      notificationPort,
    );
    await service.cancelRoomBooking("b1", "admin1");

    expect(notificationPort.writeBestEffort).toHaveBeenCalledTimes(3);
    const calls = notificationPort.writeBestEffort.mock.calls.map(
      (c: any) => c[0],
    );
    expect(calls[0].eventKey).toContain("room.b1.cancelled");
  });
});
