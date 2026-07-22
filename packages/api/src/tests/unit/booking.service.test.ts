import { describe, test, expect, mock } from "bun:test";
import { createBookingService } from "../../modules/booking/booking.service";

function makeDb() {
  return {
    transaction: mock(async (fn: any) => {
      const tx = { ...makeDb(), ...mockRepo() };
      return fn(tx);
    }),
  } as any;
}

function mockRepo(overrides: Record<string, unknown> = {}) {
  return {
    findBookingById: mock(async () => null),
    findBookingWithParticipants: mock(async () => null),
    listBookingsByProposer: mock(async () => []),
    findTutorProfile: mock(async () => null),
    findAvailabilitySlot: mock(async () => null),
    findOverlappingBookings: mock(async () => []),
    insertBooking: mock(async () => ({})),
    insertParticipant: mock(async () => {}),
    insertStateHistory: mock(async () => {}),
    updateBookingVersioned: mock(async () => ({ updated: {}, newVersion: 1 })),
    updateBookingHoldAmount: mock(async () => {}),
    updateBookingCancellationReason: mock(async () => {}),
    updateBookingConfirmedHeadcount: mock(async () => {}),
    updateParticipantState: mock(async () => {}),
    findParticipant: mock(async () => null),
    findConfirmedParticipants: mock(async () => []),
    findReconfirmedParticipants: mock(async () => []),
    insertRescheduleProposal: mock(async () => {}),
    insertBookingSession: mock(async () => {}),
    listSessionsBySeriesId: mock(async () => []),
    findBookingsExpiringByDeadline: mock(async () => []),
    findBookingType: mock(async () => null),
    ...overrides,
  };
}

function makeWallet(overrides: Record<string, unknown> = {}) {
  return {
    hold: mock(async () => ({
      id: "w1",
      totalBalance: 100,
      heldBalance: 10,
      availableBalance: 90,
    })),
    release: mock(async () => ({
      id: "w1",
      totalBalance: 100,
      heldBalance: 0,
      availableBalance: 100,
    })),
    deduct: mock(async () => ({
      id: "w1",
      totalBalance: 90,
      heldBalance: 0,
      availableBalance: 90,
    })),
    compensate: mock(async () => ({
      id: "w1",
      totalBalance: 100,
      heldBalance: 0,
      availableBalance: 100,
    })),
    getByUserId: mock(async () => ({
      id: "w1",
      totalBalance: 500,
      heldBalance: 0,
      availableBalance: 500,
    })),
    getOrCreate: mock(async () => ({
      id: "w1",
      totalBalance: 500,
      heldBalance: 0,
      availableBalance: 500,
    })),
    ...overrides,
  };
}

function makePricing() {
  return {
    computeSplit: mock((_total: number, _size: number) => ({
      perStudent: 42,
      baseline: 42,
      tutorShare: 33.6,
      cogitoTake: 8.4,
    })),
    validatePrices: mock(() => null),
  };
}

function makeAudit() {
  return { record: mock(async () => {}) };
}

function makeNotification() {
  return { write: mock(async () => {}) };
}

function makeMeeting() {
  return {
    createEvent: mock(async () => ({
      id: "m1",
      bookingId: "b1",
      provider: "google_meet",
      externalEventId: "ext1",
      meetingUrl: "https://meet.google.com/abc",
      status: "created",
      errorReason: null,
    })),
  };
}

function makeBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: "b1",
    type: "solo",
    modality: "online",
    tutorId: "tutor1",
    proposerId: "student1",
    targetGroupSize: 1,
    minConfirmedHeadcount: 1,
    confirmedHeadcount: 1,
    currentState: "awaiting_tutor_review",
    previousState: null,
    holdAmount: 42,
    originalMarks: 42,
    priceSnapshot: {
      perStudent: 42,
      baseline: 42,
      tutorShare: 33.6,
      cogitoTake: 8.4,
    },
    scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    scheduledEndAt: new Date(Date.now() + 48 * 60 * 60 * 1000 + 90 * 60 * 1000),
    timezone: "Asia/Jakarta",
    version: 1,
    cancellationReason: null,
    deadlineAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
    ...overrides,
  };
}

function makeTutorProfile(overrides: Record<string, unknown> = {}) {
  return {
    userId: "tutor1",
    modality: "both",
    prices: { "1": 42 },
    onboardingStatus: "published",
    ...overrides,
  };
}

function makeSlot(overrides: Record<string, unknown> = {}) {
  return {
    id: "slot1",
    tutorId: "tutor1",
    startDate: new Date(Date.now() + 48 * 60 * 60 * 1000),
    endDate: new Date(Date.now() + 48 * 60 * 60 * 1000 + 90 * 60 * 1000),
    isActive: true,
    ...overrides,
  };
}

function makeParticipant(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    bookingId: "b1",
    userId: "student1",
    role: "proposer",
    confirmationState: "confirmed",
    heldAmount: 42,
    ...overrides,
  };
}

function createService(
  overrides: {
    repo?: Record<string, unknown>;
    wallet?: Record<string, unknown>;
    meeting?: Record<string, unknown>;
  } = {},
) {
  const db = makeDb();
  const repo = mockRepo(overrides.repo);
  const wallet = makeWallet(overrides.wallet);
  const pricing = makePricing();
  const audit = makeAudit();
  const notification = makeNotification();
  const meeting = overrides.meeting
    ? { ...makeMeeting(), ...overrides.meeting }
    : makeMeeting();
  const service = createBookingService({
    db,
    repo,
    wallet,
    pricing,
    audit,
    notification,
    meeting,
  } as any);
  return { service, db, repo, wallet, pricing, audit, notification, meeting };
}

describe("BookingService", () => {
  describe("getById", () => {
    test("returns booking with participants when found", async () => {
      const booking = { id: "b1", currentState: "confirmed" };
      const { service } = createService({
        repo: { findBookingWithParticipants: mock(async () => booking) },
      });

      const result = await service.getById("b1");
      expect(result).toEqual(booking);
    });

    test("throws notFound when booking does not exist", async () => {
      const { service } = createService({
        repo: { findBookingWithParticipants: mock(async () => null) },
      });

      await expect(service.getById("nonexistent")).rejects.toThrow(
        "Booking not found",
      );
    });
  });

  describe("listMine", () => {
    test("returns paginated results with nextCursor", async () => {
      const bookings = Array.from({ length: 22 }, (_, i) => ({
        id: `b${i}`,
        scheduledStartAt: new Date(),
      }));
      const { service } = createService({
        repo: { listBookingsByProposer: mock(async () => bookings) },
      });

      const result = await service.listMine("student1");
      expect(result.items.length).toBe(20);
      expect(result.nextCursor).toBe("b19");
    });

    test("returns null nextCursor when fewer items than limit", async () => {
      const bookings = [{ id: "b1" }, { id: "b2" }];
      const { service } = createService({
        repo: { listBookingsByProposer: mock(async () => bookings) },
      });

      const result = await service.listMine("student1");
      expect(result.items.length).toBe(2);
      expect(result.nextCursor).toBeNull();
    });

    test("respects custom limit", async () => {
      const bookings = Array.from({ length: 6 }, (_, i) => ({ id: `b${i}` }));
      const { service, repo } = createService({
        repo: { listBookingsByProposer: mock(async () => bookings) },
      });

      const result = await service.listMine("student1", { limit: 5 });
      expect(result.items.length).toBe(5);
      expect(result.nextCursor).toBe("b4");
      expect(repo.listBookingsByProposer).toHaveBeenCalledWith("student1", {
        states: undefined,
        limit: 5,
      });
    });

    test("caps limit at MAX_PAGE_LIMIT", async () => {
      const { service, repo } = createService({
        repo: { listBookingsByProposer: mock(async () => []) },
      });

      await service.listMine("student1", { limit: 200 });
      expect(repo.listBookingsByProposer).toHaveBeenCalledWith("student1", {
        states: undefined,
        limit: 100,
      });
    });
  });

  describe("createSolo", () => {
    const soloInput = {
      tutorId: "tutor1",
      availabilitySlotId: "slot1",
      modality: "online" as const,
      scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      scheduledEndAt: new Date(
        Date.now() + 48 * 60 * 60 * 1000 + 90 * 60 * 1000,
      ),
      timezone: "Asia/Jakarta",
    };

    test("throws notFound when tutor profile not found", async () => {
      const { service } = createService({
        repo: { findTutorProfile: mock(async () => null) },
      });

      await expect(service.createSolo("student1", soloInput)).rejects.toThrow(
        "Tutor profile not found",
      );
    });

    test("throws badRequest when availability slot not found", async () => {
      const { service } = createService({
        repo: {
          findTutorProfile: mock(async () => makeTutorProfile()),
          findAvailabilitySlot: mock(async () => null),
        },
      });

      await expect(service.createSolo("student1", soloInput)).rejects.toThrow(
        "Selected availability slot is not available",
      );
    });

    test("throws badRequest when tutor does not support offline sessions", async () => {
      const { service } = createService({
        repo: {
          findTutorProfile: mock(async () =>
            makeTutorProfile({ modality: "online" }),
          ),
          findAvailabilitySlot: mock(async () => makeSlot()),
          findOverlappingBookings: mock(async () => []),
        },
      });

      await expect(
        service.createSolo("student1", { ...soloInput, modality: "offline" }),
      ).rejects.toThrow("Tutor does not support offline sessions");
    });

    test("throws badRequest when tutor does not support online sessions", async () => {
      const { service } = createService({
        repo: {
          findTutorProfile: mock(async () =>
            makeTutorProfile({ modality: "offline" }),
          ),
          findAvailabilitySlot: mock(async () => makeSlot()),
          findOverlappingBookings: mock(async () => []),
        },
      });

      await expect(
        service.createSolo("student1", { ...soloInput, modality: "online" }),
      ).rejects.toThrow("Tutor does not support online sessions");
    });

    test("throws conflict when tutor has overlapping booking", async () => {
      const { service } = createService({
        repo: {
          findTutorProfile: mock(async () => makeTutorProfile()),
          findAvailabilitySlot: mock(async () => makeSlot()),
          findOverlappingBookings: mock(async () => [{ id: "existing" }]),
        },
      });

      await expect(service.createSolo("student1", soloInput)).rejects.toThrow(
        "Tutor already has a booking at this time",
      );
    });

    test("throws conflict when insufficient available marks", async () => {
      const { service } = createService({
        repo: {
          findTutorProfile: mock(async () => makeTutorProfile()),
          findAvailabilitySlot: mock(async () => makeSlot()),
          findOverlappingBookings: mock(async () => []),
        },
        wallet: {
          ...makeWallet(),
          getByUserId: mock(async () => ({
            id: "w1",
            totalBalance: 10,
            heldBalance: 0,
            availableBalance: 10,
          })),
        },
      });

      await expect(service.createSolo("student1", soloInput)).rejects.toThrow(
        "Insufficient available Marks",
      );
    });

    test("throws notFound when wallet not found", async () => {
      const { service } = createService({
        repo: {
          findTutorProfile: mock(async () => makeTutorProfile()),
          findAvailabilitySlot: mock(async () => makeSlot()),
          findOverlappingBookings: mock(async () => []),
        },
        wallet: {
          ...makeWallet(),
          getByUserId: mock(async () => null),
        },
      });

      await expect(service.createSolo("student1", soloInput)).rejects.toThrow(
        "Wallet not found",
      );
    });

    test("creates solo booking successfully with hold, transition, and notifications", async () => {
      const booking = makeBooking();
      const { service, repo, wallet, audit, notification } = createService({
        repo: {
          findTutorProfile: mock(async () => makeTutorProfile()),
          findAvailabilitySlot: mock(async () => makeSlot()),
          findOverlappingBookings: mock(async () => []),
          insertBooking: mock(async () => booking),
        },
      });

      await service.createSolo("student1", soloInput);

      expect(wallet.hold).toHaveBeenCalledTimes(1);
      expect(wallet.hold.mock.calls[0][1]).toMatchObject({
        walletId: "w1",
        reason: "Hold Marks for solo booking",
      });
      expect(repo.insertBooking).toHaveBeenCalledTimes(1);
      expect(repo.insertParticipant).toHaveBeenCalledTimes(1);
      expect(repo.insertStateHistory).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledTimes(1);
      expect(notification.write).toHaveBeenCalledTimes(1);
      expect(notification.write.mock.calls[0][0]).toMatchObject({
        userId: "tutor1",
        category: "booking",
        title: "New booking request",
      });
    });
  });

  describe("createGroup", () => {
    const groupInput = {
      tutorId: "tutor1",
      availabilitySlotId: "slot1",
      modality: "online" as const,
      targetGroupSize: 3,
      inviteeUserIds: ["student2", "student3"],
      scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      scheduledEndAt: new Date(
        Date.now() + 48 * 60 * 60 * 1000 + 90 * 60 * 1000,
      ),
      timezone: "Asia/Jakarta",
    };

    test("throws notFound when tutor profile not found", async () => {
      const { service } = createService({
        repo: { findTutorProfile: mock(async () => null) },
      });

      await expect(service.createGroup("student1", groupInput)).rejects.toThrow(
        "Tutor profile not found",
      );
    });

    test("creates group booking with invites and notifications for invitees", async () => {
      const booking = makeBooking({ type: "group", targetGroupSize: 3 });
      const { service, repo, wallet, notification } = createService({
        repo: {
          findTutorProfile: mock(async () => makeTutorProfile()),
          findAvailabilitySlot: mock(async () => makeSlot()),
          findOverlappingBookings: mock(async () => []),
          insertBooking: mock(async () => booking),
        },
      });

      await service.createGroup("student1", groupInput);

      expect(wallet.hold).toHaveBeenCalledTimes(1);
      expect(repo.insertBooking).toHaveBeenCalledTimes(1);
      expect(repo.insertParticipant).toHaveBeenCalledTimes(3);
      expect(notification.write).toHaveBeenCalledTimes(2);
    });

    test("throws conflict when insufficient marks for proposer hold", async () => {
      const { service } = createService({
        repo: {
          findTutorProfile: mock(async () => makeTutorProfile()),
          findAvailabilitySlot: mock(async () => makeSlot()),
          findOverlappingBookings: mock(async () => []),
        },
        wallet: {
          ...makeWallet(),
          getByUserId: mock(async () => ({
            id: "w1",
            totalBalance: 5,
            heldBalance: 0,
            availableBalance: 5,
          })),
        },
      });

      await expect(service.createGroup("student1", groupInput)).rejects.toThrow(
        "Insufficient available Marks",
      );
    });
  });

  describe("createSeries", () => {
    const seriesInput = {
      tutorId: "tutor1",
      availabilitySlotId: "slot1",
      modality: "online" as const,
      sessions: [
        {
          scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
          scheduledEndAt: new Date(
            Date.now() + 48 * 60 * 60 * 1000 + 90 * 60 * 1000,
          ),
        },
        {
          scheduledStartAt: new Date(Date.now() + 96 * 60 * 60 * 1000),
          scheduledEndAt: new Date(
            Date.now() + 96 * 60 * 60 * 1000 + 90 * 60 * 1000,
          ),
        },
      ],
      timezone: "Asia/Jakarta",
    };

    test("throws badRequest when session count is below minimum", async () => {
      const { service } = createService({
        repo: { findTutorProfile: mock(async () => makeTutorProfile()) },
      });

      await expect(
        service.createSeries("student1", {
          ...seriesInput,
          sessions: [seriesInput.sessions[0]],
        }),
      ).rejects.toThrow("Series must have 2-4 sessions");
    });

    test("throws badRequest when session count exceeds maximum", async () => {
      const { service } = createService({
        repo: { findTutorProfile: mock(async () => makeTutorProfile()) },
      });

      await expect(
        service.createSeries("student1", {
          ...seriesInput,
          sessions: Array.from({ length: 5 }, (_, i) => ({
            scheduledStartAt: new Date(
              Date.now() + (i + 2) * 24 * 60 * 60 * 1000,
            ),
            scheduledEndAt: new Date(
              Date.now() + (i + 2) * 24 * 60 * 60 * 1000 + 90 * 60 * 1000,
            ),
          })),
        }),
      ).rejects.toThrow("Series must have 2-4 sessions");
    });

    test("creates series booking with sessions", async () => {
      const booking = makeBooking({ type: "series" });
      const { service, repo, wallet } = createService({
        repo: {
          findTutorProfile: mock(async () => makeTutorProfile()),
          findAvailabilitySlot: mock(async () => makeSlot()),
          findOverlappingBookings: mock(async () => []),
          insertBooking: mock(async () => booking),
        },
      });

      await service.createSeries("student1", seriesInput);

      expect(wallet.hold).toHaveBeenCalledTimes(1);
      expect(wallet.hold.mock.calls[0][1].amount).toBe(84);
      expect(repo.insertBooking).toHaveBeenCalledTimes(1);
      expect(repo.insertParticipant).toHaveBeenCalledTimes(1);
      expect(repo.insertBookingSession).toHaveBeenCalledTimes(2);
      expect(repo.insertStateHistory).toHaveBeenCalledTimes(1);
    });

    test("throws conflict when overlapping booking exists for a session", async () => {
      const { service } = createService({
        repo: {
          findTutorProfile: mock(async () => makeTutorProfile()),
          findAvailabilitySlot: mock(async () => makeSlot()),
          findOverlappingBookings: mock(async () => [{ id: "existing" }]),
        },
      });

      await expect(
        service.createSeries("student1", seriesInput),
      ).rejects.toThrow("Tutor already has a booking at this time");
    });
  });

  describe("cancel", () => {
    test("throws notFound when booking does not exist", async () => {
      const { service } = createService({
        repo: {
          findBookingById: mock(async () => null),
          findParticipant: mock(async () => null),
        },
      });

      await expect(service.cancel("student1", "nonexistent")).rejects.toThrow(
        "Booking not found",
      );
    });

    test("throws forbidden when user has no access", async () => {
      const { service } = createService({
        repo: {
          findBookingById: mock(async () =>
            makeBooking({ proposerId: "other" }),
          ),
          findParticipant: mock(async () => null),
        },
      });

      await expect(service.cancel("student1", "b1")).rejects.toThrow(
        "You do not have access",
      );
    });

    test("throws conflict when booking is already terminal", async () => {
      const { service } = createService({
        repo: {
          findBookingById: mock(async () =>
            makeBooking({ currentState: "completed" }),
          ),
          findParticipant: mock(async () => makeParticipant()),
        },
      });

      await expect(service.cancel("student1", "b1")).rejects.toThrow(
        "already in a terminal state",
      );
    });

    test("cancels booking and releases holds (non-late)", async () => {
      const booking = makeBooking({
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      const { service, wallet, notification } = createService({
        repo: {
          findBookingById: mock(async () => booking),
          findParticipant: mock(async () => makeParticipant()),
          updateBookingVersioned: mock(async () => ({
            updated: { ...booking, currentState: "cancelled" },
            newVersion: 2,
          })),
        },
      });

      await service.cancel("student1", "b1", "changed mind");

      expect(wallet.release).toHaveBeenCalledTimes(1);
      expect(wallet.release.mock.calls[0][1]).toMatchObject({
        walletId: "w1",
        amount: 42,
        reason: "Booking cancelled: changed mind",
      });
      expect(notification.write).toHaveBeenCalledTimes(1);
      expect(notification.write.mock.calls[0][0]).toMatchObject({
        userId: "tutor1",
        title: "Booking cancelled",
      });
    });

    test("cancels with late_cancelled state when within threshold", async () => {
      const booking = makeBooking({
        scheduledStartAt: new Date(Date.now() + 1 * 60 * 60 * 1000),
      });
      const { service, wallet } = createService({
        repo: {
          findBookingById: mock(async () => booking),
          findParticipant: mock(async () => makeParticipant()),
          updateBookingVersioned: mock(async () => ({
            updated: { ...booking, currentState: "late_cancelled" },
            newVersion: 2,
          })),
        },
      });

      await service.cancel("student1", "b1");

      expect(wallet.release).toHaveBeenCalledTimes(1);
      expect(wallet.release.mock.calls[0][1].eventKey).toContain(
        "cancel_release",
      );
    });

    test("skips release when holdAmount is 0", async () => {
      const booking = makeBooking({
        holdAmount: 0,
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      const { service, wallet } = createService({
        repo: {
          findBookingById: mock(async () => booking),
          findParticipant: mock(async () => makeParticipant()),
          updateBookingVersioned: mock(async () => ({
            updated: { ...booking, currentState: "cancelled" },
            newVersion: 2,
          })),
        },
      });

      await service.cancel("student1", "b1");

      expect(wallet.release).not.toHaveBeenCalled();
    });
  });

  describe("tutorAccept", () => {
    test("throws notFound when booking does not exist", async () => {
      const { service } = createService({
        repo: { findBookingById: mock(async () => null) },
      });

      await expect(service.tutorAccept("b1", "tutor1")).rejects.toThrow(
        "Booking not found",
      );
    });

    test("throws forbidden when tutor does not own the booking", async () => {
      const { service } = createService({
        repo: {
          findBookingById: mock(async () =>
            makeBooking({ tutorId: "other_tutor" }),
          ),
        },
      });

      await expect(service.tutorAccept("b1", "tutor1")).rejects.toThrow(
        "Not your booking",
      );
    });

    test("throws conflict when booking is not awaiting_tutor_review", async () => {
      const { service } = createService({
        repo: {
          findBookingById: mock(async () =>
            makeBooking({ currentState: "confirmed" }),
          ),
        },
      });

      await expect(service.tutorAccept("b1", "tutor1")).rejects.toThrow(
        "not awaiting tutor review",
      );
    });

    test("accepts online booking — transitions to confirmed then scheduled and creates meeting", async () => {
      const booking = makeBooking({ modality: "online" });
      let findCallCount = 0;
      const {
        service,
        meeting: meetingMock,
        notification,
      } = createService({
        repo: {
          findBookingById: mock(async () => {
            findCallCount++;
            if (findCallCount <= 2)
              return {
                ...booking,
                currentState: "awaiting_tutor_review",
                version: 1,
              };
            return { ...booking, currentState: "confirmed", version: 2 };
          }),
          updateBookingVersioned: mock(
            async (_conn: any, _id: any, ver: number, updates: any) => {
              return {
                updated: { ...booking, ...updates, version: ver + 1 },
                newVersion: ver + 1,
              };
            },
          ),
        },
      });

      await service.tutorAccept("b1", "tutor1");

      expect(meetingMock.createEvent).toHaveBeenCalledTimes(1);
      expect(meetingMock.createEvent).toHaveBeenCalledWith(
        "b1",
        booking.scheduledStartAt,
        booking.scheduledEndAt,
      );
      expect(notification.write).toHaveBeenCalledTimes(1);
      expect(notification.write.mock.calls[0][0].title).toBe(
        "Booking accepted",
      );
    });

    test("accepts offline booking — would transition to awaiting_admin_room_approval but blocked by transition table", async () => {
      const booking = makeBooking({ modality: "offline" });
      const { service, meeting } = createService({
        repo: {
          findBookingById: mock(async () => ({
            ...booking,
            currentState: "awaiting_tutor_review",
            version: 1,
          })),
          updateBookingVersioned: mock(
            async (_conn: any, _id: any, ver: number, updates: any) => ({
              updated: { ...booking, ...updates, version: ver + 1 },
              newVersion: ver + 1,
            }),
          ),
        },
      });

      await expect(service.tutorAccept("b1", "tutor1")).rejects.toThrow(
        "Cannot transition",
      );
      expect(meeting.createEvent).not.toHaveBeenCalled();
    });

    test("throws serviceUnavailable when meeting creation fails for online booking", async () => {
      const booking = makeBooking({ modality: "online" });
      let findCallCount = 0;
      const { service } = createService({
        repo: {
          findBookingById: mock(async () => {
            findCallCount++;
            if (findCallCount <= 2)
              return {
                ...booking,
                currentState: "awaiting_tutor_review",
                version: 1,
              };
            return { ...booking, currentState: "confirmed", version: 2 };
          }),
          updateBookingVersioned: mock(
            async (_conn: any, _id: any, ver: number, updates: any) => {
              return {
                updated: { ...booking, ...updates, version: ver + 1 },
                newVersion: ver + 1,
              };
            },
          ),
        },
        meeting: {
          createEvent: mock(async () => {
            throw new Error("Meeting API down");
          }),
        },
      });

      await expect(service.tutorAccept("b1", "tutor1")).rejects.toThrow(
        "Meeting creation failed; booking was still accepted",
      );
    });
  });

  describe("tutorDecline", () => {
    test("throws notFound when booking does not exist", async () => {
      const { service } = createService({
        repo: { findBookingById: mock(async () => null) },
      });

      await expect(service.tutorDecline("b1", "tutor1")).rejects.toThrow(
        "Booking not found",
      );
    });

    test("throws forbidden when tutor does not own the booking", async () => {
      const { service } = createService({
        repo: {
          findBookingById: mock(async () =>
            makeBooking({ tutorId: "other_tutor" }),
          ),
        },
      });

      await expect(service.tutorDecline("b1", "tutor1")).rejects.toThrow(
        "Not your booking",
      );
    });

    test("declines booking and releases holds", async () => {
      const booking = makeBooking({ holdAmount: 42 });
      const { service, wallet, notification } = createService({
        repo: {
          findBookingById: mock(async () => booking),
          updateBookingVersioned: mock(async () => ({
            updated: { ...booking, currentState: "declined" },
            newVersion: 2,
          })),
        },
      });

      await service.tutorDecline("b1", "tutor1", "schedule conflict");

      expect(wallet.release).toHaveBeenCalledTimes(1);
      expect(wallet.release.mock.calls[0][1]).toMatchObject({
        walletId: "w1",
        amount: 42,
        reason: "schedule conflict",
      });
      expect(notification.write).toHaveBeenCalledTimes(1);
      expect(notification.write.mock.calls[0][0].title).toBe(
        "Booking declined",
      );
    });

    test("skips release when holdAmount is 0", async () => {
      const booking = makeBooking({ holdAmount: 0 });
      const { service, wallet } = createService({
        repo: {
          findBookingById: mock(async () => booking),
          updateBookingVersioned: mock(async () => ({
            updated: { ...booking, currentState: "declined" },
            newVersion: 2,
          })),
        },
      });

      await service.tutorDecline("b1", "tutor1");

      expect(wallet.release).not.toHaveBeenCalled();
    });
  });

  describe("completeSession", () => {
    test("throws notFound when booking does not exist", async () => {
      const { service } = createService({
        repo: { findBookingById: mock(async () => null) },
      });

      await expect(service.completeSession("b1", "tutor1")).rejects.toThrow(
        "Booking not found",
      );
    });

    test("throws forbidden when not the tutor", async () => {
      const { service } = createService({
        repo: {
          findBookingById: mock(async () => makeBooking({ tutorId: "other" })),
        },
      });

      await expect(service.completeSession("b1", "tutor1")).rejects.toThrow(
        "Not your booking",
      );
    });

    test("throws badRequest for series bookings", async () => {
      const { service } = createService({
        repo: {
          findBookingById: mock(async () => makeBooking({ type: "series" })),
        },
      });

      await expect(service.completeSession("b1", "tutor1")).rejects.toThrow(
        "Series bookings must be completed per session",
      );
    });

    test("throws conflict when not in scheduled state", async () => {
      const { service } = createService({
        repo: {
          findBookingById: mock(async () =>
            makeBooking({ currentState: "confirmed" }),
          ),
        },
      });

      await expect(service.completeSession("b1", "tutor1")).rejects.toThrow(
        "Only scheduled bookings can be completed",
      );
    });

    test("completes session, deducts marks, sets holdAmount to 0", async () => {
      const booking = makeBooking({
        currentState: "scheduled",
        holdAmount: 42,
      });
      const { service, wallet, repo, notification } = createService({
        repo: {
          findBookingById: mock(async () => booking),
          updateBookingVersioned: mock(async () => ({
            updated: { ...booking, currentState: "completed" },
            newVersion: 2,
          })),
        },
      });

      await service.completeSession("b1", "tutor1");

      expect(wallet.deduct).toHaveBeenCalledTimes(1);
      expect(wallet.deduct.mock.calls[0][1]).toMatchObject({
        walletId: "w1",
        amount: 42,
        reason: "Session completed",
      });
      expect(repo.updateBookingHoldAmount).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        0,
      );
      expect(notification.write).toHaveBeenCalledTimes(1);
      expect(notification.write.mock.calls[0][0].title).toBe(
        "Session completed",
      );
    });
  });

  describe("confirmInvite", () => {
    test("throws notFound when booking does not exist", async () => {
      const { service } = createService({
        repo: { findBookingById: mock(async () => null) },
      });

      await expect(service.confirmInvite("student2", "b1")).rejects.toThrow(
        "Booking not found",
      );
    });

    test("throws conflict when booking is not awaiting participant confirmation", async () => {
      const { service } = createService({
        repo: {
          findBookingById: mock(async () =>
            makeBooking({ currentState: "confirmed" }),
          ),
        },
      });

      await expect(service.confirmInvite("student2", "b1")).rejects.toThrow(
        "not awaiting participant confirmation",
      );
    });

    test("throws forbidden when user is not a participant", async () => {
      const { service } = createService({
        repo: {
          findBookingById: mock(async () =>
            makeBooking({ currentState: "awaiting_participant_confirmation" }),
          ),
          findParticipant: mock(async () => null),
        },
      });

      await expect(service.confirmInvite("student2", "b1")).rejects.toThrow(
        "You are not a participant",
      );
    });

    test("throws badRequest when user is not an invitee", async () => {
      const { service } = createService({
        repo: {
          findBookingById: mock(async () =>
            makeBooking({ currentState: "awaiting_participant_confirmation" }),
          ),
          findParticipant: mock(async () =>
            makeParticipant({ role: "proposer" }),
          ),
        },
      });

      await expect(service.confirmInvite("student1", "b1")).rejects.toThrow(
        "Only invitees confirm",
      );
    });

    test("throws conflict when invite already confirmed or declined", async () => {
      const { service } = createService({
        repo: {
          findBookingById: mock(async () =>
            makeBooking({ currentState: "awaiting_participant_confirmation" }),
          ),
          findParticipant: mock(async () =>
            makeParticipant({
              role: "invitee",
              confirmationState: "confirmed",
            }),
          ),
        },
      });

      await expect(service.confirmInvite("student2", "b1")).rejects.toThrow(
        "Invite already confirmed or declined",
      );
    });

    test("confirms invite and holds marks for invitee", async () => {
      const booking = makeBooking({
        currentState: "awaiting_participant_confirmation",
        targetGroupSize: 3,
        confirmedHeadcount: 1,
        priceSnapshot: {
          perStudent: 42,
          baseline: 42,
          tutorShare: 33.6,
          cogitoTake: 8.4,
        },
      });
      const { service, wallet, repo } = createService({
        repo: {
          findBookingById: mock(async () => booking),
          findParticipant: mock(async () =>
            makeParticipant({
              role: "invitee",
              confirmationState: "pending",
              heldAmount: 0,
            }),
          ),
          updateBookingVersioned: mock(async () => ({
            updated: { ...booking, confirmedHeadcount: 2 },
            newVersion: 2,
          })),
        },
      });

      await service.confirmInvite("student2", "b1");

      expect(wallet.hold).toHaveBeenCalledTimes(1);
      expect(wallet.hold.mock.calls[0][1].reason).toBe(
        "Hold Marks for group booking (invitee)",
      );
      expect(repo.updateParticipantState).toHaveBeenCalledTimes(1);
      expect(repo.updateBookingConfirmedHeadcount).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        2,
      );
    });

    test("transitions to awaiting_tutor_review when headcount reaches target", async () => {
      const booking = makeBooking({
        currentState: "awaiting_participant_confirmation",
        targetGroupSize: 2,
        confirmedHeadcount: 1,
        priceSnapshot: {
          perStudent: 42,
          baseline: 42,
          tutorShare: 33.6,
          cogitoTake: 8.4,
        },
      });
      const { service } = createService({
        repo: {
          findBookingById: mock(async () => booking),
          findParticipant: mock(async () =>
            makeParticipant({
              role: "invitee",
              confirmationState: "pending",
              heldAmount: 0,
            }),
          ),
          updateBookingVersioned: mock(async () => ({
            updated: {
              ...booking,
              confirmedHeadcount: 2,
              currentState: "awaiting_tutor_review",
            },
            newVersion: 2,
          })),
        },
      });

      const result = await service.confirmInvite("student2", "b1");

      expect(result.confirmedHeadcount).toBe(2);
      expect(result.targetGroupSize).toBe(2);
    });
  });

  describe("declineInvite", () => {
    test("declines invite and updates participant state", async () => {
      const { service, repo } = createService({
        repo: {
          findBookingById: mock(async () =>
            makeBooking({ currentState: "awaiting_participant_confirmation" }),
          ),
          findParticipant: mock(async () =>
            makeParticipant({
              role: "invitee",
              confirmationState: "pending",
            }),
          ),
        },
      });

      const result = await service.declineInvite("student2", "b1", "busy");

      expect(result).toEqual({ declined: true });
      expect(repo.updateParticipantState).toHaveBeenCalledTimes(1);
      expect(repo.updateParticipantState.mock.calls[0][2]).toMatchObject({
        confirmationState: "declined",
      });
    });

    test("throws badRequest when user is not an invitee", async () => {
      const { service } = createService({
        repo: {
          findBookingById: mock(async () =>
            makeBooking({ currentState: "awaiting_participant_confirmation" }),
          ),
          findParticipant: mock(async () =>
            makeParticipant({ role: "proposer" }),
          ),
        },
      });

      await expect(service.declineInvite("student1", "b1")).rejects.toThrow(
        "Only invitees decline",
      );
    });
  });

  describe("reconfirm", () => {
    test("throws conflict when booking is not awaiting reconfirmation", async () => {
      const { service } = createService({
        repo: {
          findBookingById: mock(async () =>
            makeBooking({ currentState: "confirmed" }),
          ),
          findParticipant: mock(async () => makeParticipant()),
        },
      });

      await expect(service.reconfirm("student1", "b1", true)).rejects.toThrow(
        "not awaiting reconfirmation",
      );
    });

    test("reconfirms participant and updates state", async () => {
      const booking = makeBooking({ currentState: "awaiting_reconfirmation" });
      const participant = makeParticipant({ confirmationState: "confirmed" });
      const { service, repo } = createService({
        repo: {
          findBookingById: mock(async () => ({
            ...booking,
            currentState: "awaiting_reconfirmation",
            version: 1,
          })),
          findParticipant: mock(async () => participant),
          findReconfirmedParticipants: mock(async () => []),
          findConfirmedParticipants: mock(async () => [
            { id: "p1" },
            { id: "p2" },
          ]),
          updateBookingVersioned: mock(
            async (_conn: any, _id: any, ver: number, updates: any) => ({
              updated: { ...booking, ...updates, version: ver + 1 },
              newVersion: ver + 1,
            }),
          ),
        },
      });

      const result = await service.reconfirm("student1", "b1", true);
      expect(result).toEqual({ reconfirmed: true });
      expect(repo.updateParticipantState).toHaveBeenCalledWith(
        expect.anything(),
        "p1",
        expect.objectContaining({ confirmationState: "reconfirmed" }),
      );
    });

    test("declines reconfirmation when accept is false", async () => {
      const booking = makeBooking({ currentState: "awaiting_reconfirmation" });
      const participant = makeParticipant({ confirmationState: "confirmed" });
      const { service, repo } = createService({
        repo: {
          findBookingById: mock(async () => booking),
          findParticipant: mock(async () => participant),
        },
      });

      const result = await service.reconfirm("student1", "b1", false);
      expect(result).toEqual({ reconfirmed: false });
      expect(repo.updateParticipantState).toHaveBeenCalledWith(
        expect.anything(),
        "p1",
        expect.objectContaining({ confirmationState: "declined" }),
      );
    });
  });

  describe("withdraw", () => {
    test("throws forbidden when user is not a participant", async () => {
      const { service } = createService({
        repo: {
          findBookingById: mock(async () => makeBooking()),
          findParticipant: mock(async () => null),
        },
      });

      await expect(service.withdraw("student1", "b1")).rejects.toThrow(
        "You are not a participant",
      );
    });

    test("throws conflict when booking is already terminal", async () => {
      const { service } = createService({
        repo: {
          findBookingById: mock(async () =>
            makeBooking({ currentState: "completed" }),
          ),
          findParticipant: mock(async () => makeParticipant()),
        },
      });

      await expect(service.withdraw("student1", "b1")).rejects.toThrow(
        "already terminal",
      );
    });

    test("withdraws and releases held marks for participant", async () => {
      const booking = makeBooking({
        currentState: "awaiting_participant_confirmation",
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      const participant = makeParticipant({ heldAmount: 42 });
      const { service, wallet, repo } = createService({
        repo: {
          findBookingById: mock(async () => ({
            ...booking,
            version: 1,
          })),
          findParticipant: mock(async () => participant),
          findConfirmedParticipants: mock(async () => []),
          updateBookingVersioned: mock(async () => ({
            updated: { ...booking, currentState: "awaiting_reconfirmation" },
            newVersion: 2,
          })),
        },
      });

      await service.withdraw("student1", "b1", "sick");

      expect(wallet.release).toHaveBeenCalledTimes(1);
      expect(wallet.release.mock.calls[0][1].amount).toBe(42);
      expect(repo.updateParticipantState).toHaveBeenCalledTimes(1);
    });

    test("cancels group booking when remaining headcount below minimum", async () => {
      const booking = makeBooking({
        type: "group",
        currentState: "awaiting_tutor_review",
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      const participant = makeParticipant({ heldAmount: 42 });
      const { service } = createService({
        repo: {
          findBookingById: mock(async () => booking),
          findParticipant: mock(async () => participant),
          findConfirmedParticipants: mock(async () => []),
          updateBookingVersioned: mock(async () => ({
            updated: { ...booking, currentState: "cancelled" },
            newVersion: 2,
          })),
        },
      });

      const result = await service.withdraw("student1", "b1");
      expect(result.withdrawn).toBe(true);
    });

    test("skips release when heldAmount is 0", async () => {
      const booking = makeBooking({
        currentState: "awaiting_participant_confirmation",
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      const participant = makeParticipant({ heldAmount: 0 });
      const { service, wallet } = createService({
        repo: {
          findBookingById: mock(async () => ({
            ...booking,
            version: 1,
          })),
          findParticipant: mock(async () => participant),
          findConfirmedParticipants: mock(async () => []),
          updateBookingVersioned: mock(async () => ({
            updated: { ...booking, currentState: "awaiting_reconfirmation" },
            newVersion: 2,
          })),
        },
      });

      await service.withdraw("student1", "b1");
      expect(wallet.release).not.toHaveBeenCalled();
    });
  });

  describe("proposeReschedule", () => {
    test("throws notFound when booking does not exist", async () => {
      const { service } = createService({
        repo: {
          findBookingById: mock(async () => null),
          findParticipant: mock(async () => null),
        },
      });

      const start = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 90 * 60 * 1000);

      await expect(
        service.proposeReschedule("student1", "nonexistent", start, end),
      ).rejects.toThrow("Booking not found");
    });

    test("proposes reschedule successfully", async () => {
      const booking = makeBooking({
        currentState: "awaiting_tutor_review",
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      const { service, repo, notification } = createService({
        repo: {
          findBookingById: mock(async () => ({
            ...booking,
            version: 1,
          })),
          findParticipant: mock(async () => makeParticipant()),
          updateBookingVersioned: mock(
            async (_conn: any, _id: any, ver: number, updates: any) => ({
              updated: { ...booking, ...updates, version: ver + 1 },
              newVersion: ver + 1,
            }),
          ),
        },
      });

      const start = new Date(Date.now() + 72 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 90 * 60 * 1000);

      await service.proposeReschedule(
        "student1",
        "b1",
        start,
        end,
        "schedule conflict",
      );

      expect(repo.insertRescheduleProposal).toHaveBeenCalledTimes(1);
      expect(notification.write).toHaveBeenCalledTimes(1);
      expect(notification.write.mock.calls[0][0].title).toBe(
        "Reschedule proposed",
      );
    });
  });

  describe("listSessions", () => {
    test("throws notFound when booking does not exist", async () => {
      const { service } = createService({
        repo: { findBookingById: mock(async () => null) },
      });

      await expect(service.listSessions("nonexistent")).rejects.toThrow(
        "Booking not found",
      );
    });

    test("throws badRequest when booking is not a series", async () => {
      const { service } = createService({
        repo: {
          findBookingById: mock(async () => makeBooking({ type: "solo" })),
        },
      });

      await expect(service.listSessions("b1")).rejects.toThrow(
        "Booking is not a series",
      );
    });

    test("returns sessions for a series booking", async () => {
      const sessions = [
        { id: "s1", seriesBookingId: "b1", scheduledStartAt: new Date() },
        { id: "s2", seriesBookingId: "b1", scheduledStartAt: new Date() },
      ];
      const { service } = createService({
        repo: {
          findBookingById: mock(async () => makeBooking({ type: "series" })),
          listSessionsBySeriesId: mock(async () => sessions),
        },
      });

      const result = await service.listSessions("b1");
      expect(result).toEqual(sessions);
    });
  });

  describe("expireBookings", () => {
    test("expires bookings and releases holds", async () => {
      const expiringBooking = makeBooking({
        currentState: "awaiting_tutor_review",
        holdAmount: 42,
        proposerId: "student1",
      });

      const { service, wallet } = createService({
        repo: {
          findBookingsExpiringByDeadline: mock(async () => [expiringBooking]),
          findBookingById: mock(async () => ({
            ...expiringBooking,
            currentState: "awaiting_tutor_review",
            version: 1,
          })),
          updateBookingVersioned: mock(async () => ({
            updated: { ...expiringBooking, currentState: "expired" },
            newVersion: 2,
          })),
        },
      });

      const result = await service.expireBookings();

      expect(result).toEqual({ expired: 1 });
      expect(wallet.release).toHaveBeenCalledTimes(1);
      expect(wallet.release.mock.calls[0][1]).toMatchObject({
        amount: 42,
        actorType: "system",
        reason: "Booking expired",
      });
    });

    test("skips release when holdAmount is 0", async () => {
      const expiringBooking = makeBooking({
        currentState: "awaiting_tutor_review",
        holdAmount: 0,
        proposerId: "student1",
      });

      const { service, wallet } = createService({
        repo: {
          findBookingsExpiringByDeadline: mock(async () => [expiringBooking]),
          findBookingById: mock(async () => ({
            ...expiringBooking,
            currentState: "awaiting_tutor_review",
            version: 1,
          })),
          updateBookingVersioned: mock(async () => ({
            updated: { ...expiringBooking, currentState: "expired" },
            newVersion: 2,
          })),
        },
      });

      await service.expireBookings();
      expect(wallet.release).not.toHaveBeenCalled();
    });

    test("returns zero when no bookings to expire", async () => {
      const { service } = createService({
        repo: {
          findBookingsExpiringByDeadline: mock(async () => []),
        },
      });

      const result = await service.expireBookings();
      expect(result).toEqual({ expired: 0 });
    });

    test("continues processing when individual booking fails", async () => {
      const b1 = makeBooking({
        id: "b1",
        currentState: "awaiting_tutor_review",
        holdAmount: 42,
        proposerId: "student1",
      });
      const b2 = makeBooking({
        id: "b2",
        currentState: "awaiting_tutor_review",
        holdAmount: 30,
        proposerId: "student2",
      });

      let findCallCount = 0;
      const { service } = createService({
        repo: {
          findBookingsExpiringByDeadline: mock(async () => [b1, b2]),
          findBookingById: mock(async () => {
            findCallCount++;
            if (findCallCount === 1) throw new Error("DB error");
            return { ...b2, currentState: "awaiting_tutor_review", version: 1 };
          }),
          updateBookingVersioned: mock(async () => ({
            updated: { ...b2, currentState: "expired" },
            newVersion: 2,
          })),
        },
      });

      const result = await service.expireBookings();
      expect(result).toEqual({ expired: 2 });
    });
  });

  describe("transition", () => {
    test("throws notFound when booking does not exist", async () => {
      const { service } = createService({
        repo: { findBookingById: mock(async () => null) },
      });

      await expect(
        service.transition(makeDb(), "nonexistent", "confirmed", {
          actorId: "tutor1",
          actorType: "tutor",
        }),
      ).rejects.toThrow("Booking not found");
    });

    test("throws conflict when transition is invalid", async () => {
      const { service } = createService({
        repo: {
          findBookingById: mock(async () =>
            makeBooking({ currentState: "completed" }),
          ),
        },
      });

      await expect(
        service.transition(makeDb(), "b1", "confirmed", {
          actorId: "tutor1",
          actorType: "tutor",
        }),
      ).rejects.toThrow("Cannot transition");
    });

    test("throws conflict when versioned update fails", async () => {
      const { service } = createService({
        repo: {
          findBookingById: mock(async () =>
            makeBooking({ currentState: "awaiting_tutor_review" }),
          ),
          updateBookingVersioned: mock(async () => null),
        },
      });

      await expect(
        service.transition(makeDb(), "b1", "confirmed", {
          actorId: "tutor1",
          actorType: "tutor",
        }),
      ).rejects.toThrow("Booking was modified by another request");
    });
  });
});
