import { describe, test, expect, mock } from "bun:test";
import { createBookingService } from "../../modules/booking/booking.service";
import { RESPONSE_WINDOW_MS } from "../../shared/constants";
import {
  BookingNotFoundError,
  BookingNotOwnedError,
  BookingConflictError,
  BookingStateTransitionError,
  BookingNotEditableError,
  InsufficientMarksError,
  BookingNotAwaitingConfirmationError,
  BookingNotAwaitingReconfirmationError,
  BookingNotAwaitingReviewError,
  BookingSeriesSizeError,
  BookingParticipantNotFoundError,
  BookingParticipantAlreadyConfirmedError,
  BookingCancelledError,
  BookingSessionNotFoundError,
  BookingSessionNotCancellableError,
  BookingSessionRequiredError,
  BookingSessionNotStartedError,
  BookingRescheduleNotFoundError,
  BookingRescheduleNotPendingError,
  BookingNotCompletedError,
  BookingSeriesNoOptOutError,
  BookingAcceptanceDeadlinePassedError,
  BookingCancellationDeadlinePassedError,
} from "../../modules/booking/booking.errors";

function makeDb() {
  return {
    transaction: mock(async (fn: any) => {
      const tx = { ...makeDb(), ...mockRepo() };
      return fn(tx);
    }),
    execute: mock(async () => {}),
  } as any;
}

function mockRepo(overrides: Record<string, unknown> = {}) {
  return {
    findBookingById: mock(async () => null),
    findBookingWithParticipants: mock(async () => null),
    listBookingsByProposer: mock(async () => []),
    listBookingsForAccess: mock(async () => []),
    findTutorProfile: mock(async () => null),
    findAvailabilitySlot: mock(async () => null),
    findAvailabilityWindowContaining: mock(async () => null),
    listActiveTutorAvailability: mock(async () => []),
    findOverlappingBookings: mock(async () => []),
    insertBooking: mock(async () => ({})),
    insertParticipant: mock(async () => {}),
    insertStateHistory: mock(async () => {}),
    updateBookingVersioned: mock(async () => ({ updated: {}, newVersion: 1 })),
    updateBookingHoldAmount: mock(async () => {}),
    updateBookingCancellationReason: mock(async () => {}),
    updateBookingConfirmedHeadcount: mock(async () => {}),
    incrementBookingConfirmedHeadcount: mock(async () => ({
      confirmedHeadcount: 1,
    })),
    updateParticipantState: mock(async () => {}),
    findParticipant: mock(async () => null),
    findConfirmedParticipants: mock(async () => []),
    findUserEmails: mock(async () => []),
    findUsersByIds: mock(async () => []),
    findReconfirmedParticipants: mock(async () => []),
    resetReconfirmedParticipants: mock(async () => {}),
    insertRescheduleProposal: mock(async () => {}),
    findPendingRescheduleProposal: mock(async () => null),
    updateRescheduleProposal: mock(async () => {}),
    insertBookingSession: mock(async () => {}),
    listSessionsBySeriesId: mock(async () => []),
    findBookingsExpiringByDeadline: mock(async () => []),
    findBookingsWithTutorLateness: mock(async () => []),
    findTutorParticipant: mock(async () => null),
    findBookingType: mock(async () => null),
    decrementBookingConfirmedHeadcount: mock(async () => {}),
    cancelAllSessions: mock(async () => {}),
    updateBookingDeadline: mock(async () => {}),
    updateBookingPriceSnapshot: mock(async () => {}),
    updateBookingSchedule: mock(async () => {}),
    findSessionById: mock(async () => null),
    completeSession: mock(async () => {}),
    findCompletedBookingsByTutor: mock(async () => []),
    updateSessionSchedule: mock(async () => {}),
    cancelSession: mock(async () => {}),
    insertSessionNote: mock(async () => ({})),
    listSessionNotes: mock(async () => []),
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
    computeSplit: mock((_modality: string, _price: number, _size: number) => ({
      perStudent: 42,
      baseline: 42,
      tutorShare: 33.6,
      cogitoTake: 8.4,
      baselineCogitoTake: 12,
      baselineTutorShare: 30,
      extraTotal: 0,
      cogitoExtraTake: 0,
      tutorExtraShare: 0,
    })),
    validatePrices: mock(() => null),
  };
}

function makeAudit() {
  return { record: mock(async () => {}) };
}

function makeNotification() {
  return { write: mock(async () => {}), writeBestEffort: mock(async () => {}) };
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
    updateEvent: mock(async () => {}),
    cancelEvent: mock(async () => {}),
    setManualLink: mock(async (_bookingId: string, url: string) => ({
      id: "m1",
      bookingId: "b1",
      provider: "manual",
      externalEventId: null,
      meetingUrl: url,
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
      baselineCogitoTake: 12,
      baselineTutorShare: 30,
      extraTotal: 0,
      cogitoExtraTake: 0,
      tutorExtraShare: 0,
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
    startDate: new Date(Date.now() + 47 * 60 * 60 * 1000),
    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    modality: "both",
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

function realComputeSplit(
  modality: string,
  tutorPricePerStudent: number,
  confirmedHeadcount: number,
) {
  const ONLINE: Record<number, { tutor: number; cogito: number }> = {
    1: { tutor: 30, cogito: 12 },
    2: { tutor: 54, cogito: 16 },
    3: { tutor: 64, cogito: 20 },
    4: { tutor: 74, cogito: 22 },
    5: { tutor: 81, cogito: 24 },
    6: { tutor: 88, cogito: 26 },
  };
  const OFFLINE: Record<number, { tutor: number; cogito: number }> = {
    1: { tutor: 35, cogito: 15 },
    2: { tutor: 70, cogito: 20 },
    3: { tutor: 95, cogito: 25 },
    4: { tutor: 115, cogito: 25 },
    5: { tutor: 120, cogito: 30 },
    6: { tutor: 127, cogito: 35 },
  };
  const perStudent = Math.floor(tutorPricePerStudent);
  const tutorTotal = perStudent * confirmedHeadcount;
  const baseline =
    modality === "offline"
      ? OFFLINE[confirmedHeadcount]
      : ONLINE[confirmedHeadcount];
  const baselineTotal = baseline!.tutor + baseline!.cogito;
  const extraTotal = Math.max(0, tutorTotal - baselineTotal);
  const cogitoExtraTake = Math.floor(extraTotal / 5);
  const tutorExtraShare = extraTotal - cogitoExtraTake;
  return {
    perStudent,
    baseline: baselineTotal,
    tutorShare: baseline!.tutor + tutorExtraShare,
    cogitoTake: baseline!.cogito + cogitoExtraTake,
    baselineCogitoTake: baseline!.cogito,
    baselineTutorShare: baseline!.tutor,
    extraTotal,
    cogitoExtraTake,
    tutorExtraShare,
  };
}

function createService(
  overrides: {
    repo?: Record<string, unknown>;
    wallet?: Record<string, unknown>;
    meeting?: Record<string, unknown>;
    pricing?: Record<string, unknown>;
    roomPort?: Record<string, unknown>;
  } = {},
) {
  const db = makeDb();
  const repo = mockRepo(overrides.repo);
  const wallet = makeWallet(overrides.wallet);
  const pricing = overrides.pricing
    ? { ...makePricing(), ...overrides.pricing }
    : makePricing();
  const audit = makeAudit();
  const notification = makeNotification();
  const meeting = overrides.meeting
    ? { ...makeMeeting(), ...overrides.meeting }
    : makeMeeting();
  const roomPort = overrides.roomPort
    ? { ...makeRoomPort(), ...overrides.roomPort }
    : makeRoomPort();
  const service = createBookingService({
    db,
    repo,
    wallet,
    pricing,
    audit,
    notification,
    meeting,
    roomPort,
  } as any);
  return {
    service,
    db,
    repo,
    wallet,
    pricing,
    audit,
    notification,
    meeting,
    roomPort,
  };
}

function makeRoomPort(overrides: Record<string, unknown> = {}) {
  return {
    requestRoomForBooking: mock(async () => ({
      available: true,
      roomBookingId: "rb1",
    })),
    cancelRequestedRoomForBooking: mock(async () => {}),
    resyncRoomBookingToSchedule: mock(async () => {}),
    syncRoomBookingScheduleForBooking: mock(async () => "updated" as const),
    ...overrides,
  };
}

describe("BookingService", () => {
  describe("getById", () => {
    test("returns booking with participants when found and user is proposer", async () => {
      const booking = {
        id: "b1",
        currentState: "confirmed",
        proposerId: "student1",
        tutorId: "tutor1",
      };
      const { service } = createService({
        repo: {
          findBookingWithParticipants: mock(async () => booking),
        },
      });

      const result = await service.getById("b1", "student1");
      expect(result).toEqual({
        ...booking,
        disclaimer: null,
        meetingStatus: "pending",
        meetingUrl: null,
      });
    });

    test("P3: surfaces the expanded GROUP_SERIES_DISCLAIMER on the booking GET for a group series", async () => {
      const booking = {
        id: "b1",
        type: "series",
        targetGroupSize: 3,
        currentState: "awaiting_participant_confirmation",
        proposerId: "student1",
        tutorId: "tutor1",
      };
      const { service } = createService({
        repo: {
          findBookingWithParticipants: mock(async () => booking),
        },
      });

      const result = await service.getById("b1", "student1");
      expect(result.disclaimer).toContain("cannot opt out");
      expect(result.disclaimer).toContain("non-refundable");
      expect(result.disclaimer).toContain("available for all");
    });

    test("returns booking when user is assigned tutor", async () => {
      const booking = {
        id: "b1",
        currentState: "confirmed",
        proposerId: "other",
        tutorId: "tutor1",
      };
      const { service } = createService({
        repo: {
          findBookingWithParticipants: mock(async () => booking),
        },
      });

      const result = await service.getById("b1", "tutor1");
      expect(result).toEqual({
        ...booking,
        disclaimer: null,
        meetingStatus: "pending",
        meetingUrl: null,
      });
    });

    test("returns ready meeting status and url when meeting is created", async () => {
      const booking = {
        id: "b1",
        currentState: "scheduled",
        proposerId: "student1",
        tutorId: "tutor1",
        meeting: {
          id: "m1",
          status: "created",
          meetingUrl: "https://meet.google.com/abc",
        },
      };
      const { service } = createService({
        repo: {
          findBookingWithParticipants: mock(async () => booking),
        },
      });

      const result = await service.getById("b1", "student1");
      expect(result.meetingStatus).toBe("ready");
      expect(result.meetingUrl).toBe("https://meet.google.com/abc");
    });

    test("returns pending meeting status when meeting exists but is manual", async () => {
      const booking = {
        id: "b1",
        currentState: "confirmed",
        proposerId: "student1",
        tutorId: "tutor1",
        meeting: {
          id: "m1",
          status: "manual",
          meetingUrl: null,
        },
      };
      const { service } = createService({
        repo: {
          findBookingWithParticipants: mock(async () => booking),
        },
      });

      const result = await service.getById("b1", "student1");
      expect(result.meetingStatus).toBe("pending");
      expect(result.meetingUrl).toBeNull();
    });

    test("returns pending meeting status when a provider row has no URL", async () => {
      const booking = {
        id: "b1",
        currentState: "scheduled",
        proposerId: "student1",
        tutorId: "tutor1",
        meeting: {
          id: "m1",
          status: "created",
          meetingUrl: null,
        },
      };
      const { service } = createService({
        repo: {
          findBookingWithParticipants: mock(async () => booking),
        },
      });

      const result = await service.getById("b1", "student1");

      expect(result.meetingStatus).toBe("pending");
      expect(result.meetingUrl).toBeNull();
    });

    test("returns failed meeting status for a failed provider row", async () => {
      const booking = {
        id: "b1",
        currentState: "confirmed",
        proposerId: "student1",
        tutorId: "tutor1",
        meeting: {
          id: "m1",
          status: "failed",
          meetingUrl: null,
        },
      };
      const { service } = createService({
        repo: {
          findBookingWithParticipants: mock(async () => booking),
        },
      });

      const result = await service.getById("b1", "student1");

      expect(result.meetingStatus).toBe("failed");
      expect(result.meetingUrl).toBeNull();
    });

    test("throws BookingNotFoundError when booking does not exist", async () => {
      const { service } = createService({
        repo: {
          findBookingWithParticipants: mock(async () => null),
        },
      });

      await expect(service.getById("nonexistent", "user1")).rejects.toThrow(
        BookingNotFoundError,
      );
    });

    test("throws BookingNotOwnedError when user has no access", async () => {
      const { service } = createService({
        repo: {
          findBookingWithParticipants: mock(async () => ({
            id: "b1",
            proposerId: "other",
            tutorId: "other_tutor",
          })),
          findParticipant: mock(async () => null),
        },
      });

      await expect(service.getById("b1", "userB")).rejects.toThrow(
        BookingNotOwnedError,
      );
    });
  });

  describe("getRescheduleAvailability", () => {
    test("returns the booking tutor's slots to an authorized participant", async () => {
      const slots = [makeSlot()];
      const { service, repo } = createService({
        repo: {
          findBookingById: mock(async () => makeBooking()),
          findParticipant: mock(async () => makeParticipant()),
          listActiveTutorAvailability: mock(async () => slots),
        },
      });

      const result = await service.getRescheduleAvailability("b1", "student1");

      expect(repo.listActiveTutorAvailability).toHaveBeenCalledWith(
        expect.anything(),
        "tutor1",
      );
      expect(result).toEqual(slots);
    });
  });

  describe("listMine", () => {
    test("returns paginated results with nextCursor", async () => {
      const bookings = Array.from({ length: 22 }, (_, i) => ({
        id: `b${i}`,
        scheduledStartAt: new Date("2025-01-01T00:00:00Z"),
      }));
      const { service } = createService({
        repo: { listBookingsByProposer: mock(async () => bookings) },
      });

      const result = await service.listMine("student1");
      expect(result.items.length).toBe(20);
      // The nextCursor encodes the LAST item of the returned page (index 19),
      // not a row beyond it.
      expect(result.nextCursor).toBe(
        `${new Date("2025-01-01T00:00:00Z").toISOString()}|b19`,
      );
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
      const bookings = Array.from({ length: 6 }, (_, i) => ({
        id: `b${i}`,
        scheduledStartAt: new Date("2025-01-01T00:00:00Z"),
      }));
      const { service, repo } = createService({
        repo: { listBookingsByProposer: mock(async () => bookings) },
      });

      const result = await service.listMine("student1", { limit: 5 });
      expect(result.items.length).toBe(5);
      // nextCursor encodes the LAST item of the returned page (index 4 = b4).
      expect(result.nextCursor).toBe(
        `${new Date("2025-01-01T00:00:00Z").toISOString()}|b4`,
      );
      expect(repo.listBookingsByProposer).toHaveBeenCalledWith("student1", {
        states: undefined,
        limit: 5,
        cursor: undefined,
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
        cursor: undefined,
      });
    });
  });

  describe("listAccessible", () => {
    test("lists all role-visible bookings for an admin and paginates", async () => {
      const bookings = Array.from({ length: 3 }, (_, i) => ({
        id: `b${i}`,
        scheduledStartAt: new Date("2025-01-01T00:00:00Z"),
      }));
      const { service, repo } = createService({
        repo: { listBookingsForAccess: mock(async () => bookings) },
      });

      const result = await service.listAccessible("admin1", "admin", {
        limit: 2,
      });

      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBe(
        `${new Date("2025-01-01T00:00:00Z").toISOString()}|b1`,
      );
      expect(repo.listBookingsForAccess).toHaveBeenCalledWith("admin1", {
        states: undefined,
        limit: 2,
        cursor: undefined,
        includeAll: true,
      });
    });

    test("uses participant-aware visibility for non-admin roles", async () => {
      const { service, repo } = createService({
        repo: { listBookingsForAccess: mock(async () => []) },
      });

      await service.listAccessible("tutor1", "tutor");

      expect(repo.listBookingsForAccess).toHaveBeenCalledWith("tutor1", {
        states: undefined,
        limit: 20,
        cursor: undefined,
        includeAll: false,
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

    test("throws BookingNotFoundError when tutor profile not found", async () => {
      const { service } = createService({
        repo: { findTutorProfile: mock(async () => null) },
      });

      await expect(service.createSolo("student1", soloInput)).rejects.toThrow(
        BookingNotFoundError,
      );
    });

    test("throws BookingNotEditableError when availability slot not found", async () => {
      const { service } = createService({
        repo: {
          findTutorProfile: mock(async () => makeTutorProfile()),
          findAvailabilitySlot: mock(async () => null),
        },
      });

      await expect(service.createSolo("student1", soloInput)).rejects.toThrow(
        BookingNotEditableError,
      );
    });

    test("throws BookingNotEditableError when tutor does not support offline sessions", async () => {
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
      ).rejects.toThrow(BookingNotEditableError);
    });

    test("throws BookingNotEditableError when tutor does not support online sessions", async () => {
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
      ).rejects.toThrow(BookingNotEditableError);
    });

    test("throws BookingConflictError when tutor has overlapping booking", async () => {
      const { service } = createService({
        repo: {
          findTutorProfile: mock(async () => makeTutorProfile()),
          findAvailabilitySlot: mock(async () => makeSlot()),
          findOverlappingBookings: mock(async () => [{ id: "existing" }]),
        },
      });

      await expect(service.createSolo("student1", soloInput)).rejects.toThrow(
        BookingConflictError,
      );
    });

    test("throws InsufficientMarksError when insufficient available marks", async () => {
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
        InsufficientMarksError,
      );
    });

    test("throws BookingNotFoundError when wallet not found", async () => {
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
        BookingNotFoundError,
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
      expect(notification.writeBestEffort).toHaveBeenCalledTimes(1);
      expect(notification.writeBestEffort.mock.calls[0][0]).toMatchObject({
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

    test("throws BookingNotFoundError when tutor profile not found", async () => {
      const { service } = createService({
        repo: { findTutorProfile: mock(async () => null) },
      });

      await expect(service.createGroup("student1", groupInput)).rejects.toThrow(
        BookingNotFoundError,
      );
    });

    test("creates group booking with invites and notifications for invitees", async () => {
      const booking = makeBooking({ type: "group", targetGroupSize: 3 });
      const { service, repo, wallet, notification } = createService({
        repo: {
          findTutorProfile: mock(async () => makeTutorProfile()),
          findAvailabilitySlot: mock(async () => makeSlot()),
          findOverlappingBookings: mock(async () => []),
          findUsersByIds: mock(async () => [
            { id: "student2" },
            { id: "student3" },
          ]),
          insertBooking: mock(async () => booking),
        },
      });

      await service.createGroup("student1", groupInput);

      expect(wallet.hold).toHaveBeenCalledTimes(1);
      expect(repo.insertBooking).toHaveBeenCalledTimes(1);
      expect(repo.insertParticipant).toHaveBeenCalledTimes(3);
      expect(notification.write).toHaveBeenCalledTimes(2);

      // P1: each invitee notification body carries the PRD-mandated content:
      // schedule, per-student price, total Marks hold, and a direct CTA link.
      const inviteeWrites = notification.write.mock.calls.filter(
        (call: any) =>
          call[0].title === "Group booking invitation" ||
          call[0].eventKey?.includes(".invite."),
      );
      for (const [params] of inviteeWrites) {
        expect(params.body).toMatch(/schedule/i);
        expect(params.body).toContain("42");
        expect(params.body).toContain("126");
        expect(params.body).toContain("/bookings/");
        expect(params.body).toMatch(/https?:\/\//);
        expect(params.emailRequired).toBe(true);
      }
    });

    test("throws InsufficientMarksError when insufficient marks for proposer hold", async () => {
      const { service } = createService({
        repo: {
          findTutorProfile: mock(async () => makeTutorProfile()),
          findAvailabilitySlot: mock(async () => makeSlot()),
          findOverlappingBookings: mock(async () => []),
          findUsersByIds: mock(async () => [
            { id: "student2" },
            { id: "student3" },
          ]),
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
        InsufficientMarksError,
      );
    });

    test("rejects duplicate invitees (M4)", async () => {
      const { service } = createService({
        repo: {
          findTutorProfile: mock(async () => makeTutorProfile()),
          findAvailabilitySlot: mock(async () => makeSlot()),
        },
      });

      await expect(
        service.createGroup("student1", {
          ...groupInput,
          inviteeUserIds: ["student2", "student2"],
        }),
      ).rejects.toThrow(BookingNotEditableError);
    });

    test("rejects the proposer inviting themselves (M4)", async () => {
      const { service } = createService({
        repo: {
          findTutorProfile: mock(async () => makeTutorProfile()),
          findAvailabilitySlot: mock(async () => makeSlot()),
        },
      });

      await expect(
        service.createGroup("student1", {
          ...groupInput,
          inviteeUserIds: ["student1", "student2"],
        }),
      ).rejects.toThrow(BookingNotEditableError);
    });

    test("rejects invitees that exceed the target group size (M4)", async () => {
      const { service } = createService({
        repo: {
          findTutorProfile: mock(async () => makeTutorProfile()),
          findAvailabilitySlot: mock(async () => makeSlot()),
        },
      });

      await expect(
        service.createGroup("student1", {
          ...groupInput,
          targetGroupSize: 2,
          inviteeUserIds: ["student2", "student3", "student4"],
        }),
      ).rejects.toThrow(BookingNotEditableError);
    });

    test("rejects unknown invitees with a clean error (U11)", async () => {
      const { service } = createService({
        repo: {
          findTutorProfile: mock(async () => makeTutorProfile()),
          findAvailabilitySlot: mock(async () => makeSlot()),
          findUsersByIds: mock(async () => [{ id: "student2" }]),
        },
      });

      await expect(service.createGroup("student1", groupInput)).rejects.toThrow(
        BookingNotFoundError,
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

    test("throws BookingSeriesSizeError when session count is below minimum", async () => {
      const { service } = createService({
        repo: {
          findTutorProfile: mock(async () => makeTutorProfile()),
          findAvailabilitySlot: mock(async () => makeSlot()),
        },
      });

      await expect(
        service.createSeries("student1", {
          ...seriesInput,
          sessions: [seriesInput.sessions[0]],
        }),
      ).rejects.toThrow(BookingSeriesSizeError);
    });

    test("throws BookingSeriesSizeError when session count exceeds maximum", async () => {
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
      ).rejects.toThrow(BookingSeriesSizeError);
    });

    test("rejects overlapping sessions within the same series (M3)", async () => {
      const { service } = createService({
        repo: {
          findTutorProfile: mock(async () => makeTutorProfile()),
          findAvailabilitySlot: mock(async () => makeSlot()),
        },
      });

      await expect(
        service.createSeries("student1", {
          ...seriesInput,
          sessions: [
            {
              scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
              scheduledEndAt: new Date(
                Date.now() + 48 * 60 * 60 * 1000 + 90 * 60 * 1000,
              ),
            },
            {
              scheduledStartAt: new Date(
                Date.now() + 48 * 60 * 60 * 1000 + 30 * 60 * 1000,
              ),
              scheduledEndAt: new Date(
                Date.now() + 48 * 60 * 60 * 1000 + 120 * 60 * 1000,
              ),
            },
          ],
        }),
      ).rejects.toThrow(BookingConflictError);
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

    test("throws BookingConflictError when overlapping booking exists for a session", async () => {
      const { service } = createService({
        repo: {
          findTutorProfile: mock(async () => makeTutorProfile()),
          findAvailabilitySlot: mock(async () => makeSlot()),
          findOverlappingBookings: mock(async () => [{ id: "existing" }]),
        },
      });

      await expect(
        service.createSeries("student1", seriesInput),
      ).rejects.toThrow(BookingConflictError);
    });
  });

  describe("createGroupSeries (FR-20)", () => {
    const groupSeriesInput = {
      tutorId: "tutor1",
      availabilitySlotId: "slot1",
      modality: "online" as const,
      targetGroupSize: 3,
      inviteeUserIds: ["student2", "student3"],
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

    test("throws BookingNotFoundError when an invitee is not a registered user", async () => {
      const { service } = createService({
        repo: {
          findTutorProfile: mock(async () => makeTutorProfile()),
          findAvailabilitySlot: mock(async () => makeSlot()),
          findUsersByIds: mock(async () => [{ id: "student2" }]),
        },
      });

      await expect(
        service.createGroupSeries("student1", groupSeriesInput),
      ).rejects.toThrow(BookingNotFoundError);
    });

    test("creates a group series with proposer package hold, invitee rows, and per-session holds", async () => {
      const booking = makeBooking({ type: "series", targetGroupSize: 3 });
      const { service, repo, wallet, notification } = createService({
        repo: {
          findTutorProfile: mock(async () => makeTutorProfile()),
          findAvailabilitySlot: mock(async () => makeSlot()),
          findOverlappingBookings: mock(async () => []),
          findUsersByIds: mock(async () => [
            { id: "student2" },
            { id: "student3" },
          ]),
          insertBooking: mock(async () => booking),
        },
      });

      const result = await service.createGroupSeries(
        "student1",
        groupSeriesInput,
      );

      // Package = perSession (42) × 2 sessions; proposer holds up front.
      expect(wallet.hold).toHaveBeenCalledTimes(1);
      expect(wallet.hold.mock.calls[0][1].amount).toBe(84);
      expect(repo.insertBooking).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: "series",
          targetGroupSize: 3,
          confirmedHeadcount: 1,
          currentState: "awaiting_participant_confirmation",
          holdAmount: 84,
        }),
      );
      expect(repo.insertParticipant).toHaveBeenCalledTimes(3);
      expect(repo.insertBookingSession).toHaveBeenCalledTimes(2);
      // One invite + tutor-request notification.
      expect(notification.write).toHaveBeenCalledTimes(2);
      expect(notification.writeBestEffort).toHaveBeenCalledTimes(1);
      expect(result.disclaimer).toContain("full-series commitment");

      // P1: the group-series invitee notification body carries schedule,
      // per-student price, total Marks hold, the no-opt-out disclaimer, and a
      // direct CTA to view/accept in-platform.
      const inviteeWrites = notification.write.mock.calls.filter((call: any) =>
        call[0].eventKey?.includes(".invite."),
      );
      expect(inviteeWrites.length).toBeGreaterThan(0);
      for (const [params] of inviteeWrites) {
        expect(params.title).toBe("Group series invitation");
        expect(params.body).toContain("cannot opt out");
        expect(params.body).toContain("42");
        expect(params.body).toContain("84");
        expect(params.body).toContain("/bookings/");
        expect(params.body).toMatch(/https?:\/\//);
        expect(params.emailRequired).toBe(true);
      }
    });
  });

  describe("cancel", () => {
    test("throws BookingNotFoundError when booking does not exist", async () => {
      const { service } = createService({
        repo: {
          findBookingById: mock(async () => null),
          findParticipant: mock(async () => null),
        },
      });

      await expect(service.cancel("student1", "nonexistent")).rejects.toThrow(
        BookingNotFoundError,
      );
    });

    test("throws BookingNotOwnedError when user has no access", async () => {
      const { service } = createService({
        repo: {
          findBookingById: mock(async () =>
            makeBooking({ proposerId: "other" }),
          ),
          findParticipant: mock(async () => null),
        },
      });

      await expect(service.cancel("student1", "b1")).rejects.toThrow(
        BookingNotOwnedError,
      );
    });

    test("throws BookingStateTransitionError when booking is already terminal", async () => {
      const { service } = createService({
        repo: {
          findBookingById: mock(async () =>
            makeBooking({ currentState: "completed" }),
          ),
          findParticipant: mock(async () => makeParticipant()),
        },
      });

      await expect(service.cancel("student1", "b1")).rejects.toThrow(
        BookingStateTransitionError,
      );
    });

    test("rejects student cancellation once the session has started", async () => {
      const { service, wallet, repo, meeting } = createService({
        repo: {
          findBookingById: mock(async () =>
            makeBooking({
              currentState: "scheduled",
              scheduledStartAt: new Date(Date.now() - 1_000),
            }),
          ),
          findParticipant: mock(async () => makeParticipant()),
        },
      });

      await expect(service.cancel("student1", "b1")).rejects.toThrow(
        BookingCancellationDeadlinePassedError,
      );
      expect(wallet.deduct).not.toHaveBeenCalled();
      expect(wallet.release).not.toHaveBeenCalled();
      expect(repo.updateBookingVersioned).not.toHaveBeenCalled();
      expect(meeting.cancelEvent).not.toHaveBeenCalled();
    });

    test("cancels booking and releases holds (non-late)", async () => {
      const booking = makeBooking({
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      const { service, wallet, notification, repo } = createService({
        repo: {
          findBookingById: mock(async () => booking),
          findParticipant: mock(async () => makeParticipant()),
          findConfirmedParticipants: mock(async () => [
            makeParticipant({ heldAmount: 42 }),
          ]),
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
      expect(repo.updateBookingHoldAmount).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        0,
      );
      expect(notification.writeBestEffort).toHaveBeenCalledTimes(1);
      expect(notification.writeBestEffort.mock.calls[0][0]).toMatchObject({
        userId: "tutor1",
        title: "Booking cancelled",
      });
    });

    test("cancels with late_cancelled state when within threshold and deducts holds", async () => {
      const booking = makeBooking({
        scheduledStartAt: new Date(Date.now() + 1 * 60 * 60 * 1000),
      });
      const { service, wallet, repo } = createService({
        repo: {
          findBookingById: mock(async () => booking),
          findParticipant: mock(async () => makeParticipant()),
          findConfirmedParticipants: mock(async () => [
            makeParticipant({ heldAmount: 42 }),
          ]),
          updateBookingVersioned: mock(async () => ({
            updated: { ...booking, currentState: "late_cancelled" },
            newVersion: 2,
          })),
        },
      });

      await service.cancel("student1", "b1");

      expect(wallet.release).not.toHaveBeenCalled();
      expect(wallet.deduct).toHaveBeenCalledTimes(1);
      expect(wallet.deduct.mock.calls[0][1].eventKey).toBe(
        "booking.b1.late-cancel.student1",
      );
      expect(wallet.deduct.mock.calls[0][1].reason).toBe(
        "Late cancellation penalty",
      );
      expect(repo.updateParticipantState).toHaveBeenCalledWith(
        expect.anything(),
        "p1",
        expect.objectContaining({ heldAmount: 0 }),
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

    test("OQ-05: cancel deletes the provider-side meeting event (best-effort)", async () => {
      const booking = makeBooking({
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      const { service, meeting } = createService({
        repo: {
          findBookingById: mock(async () => booking),
          findParticipant: mock(async () => makeParticipant()),
          findConfirmedParticipants: mock(async () => [
            makeParticipant({ heldAmount: 42 }),
          ]),
          updateBookingVersioned: mock(async () => ({
            updated: { ...booking, currentState: "cancelled" },
            newVersion: 2,
          })),
        },
      });

      await service.cancel("student1", "b1");

      expect(meeting.cancelEvent).toHaveBeenCalledWith("b1");
    });

    test("throws BookingSeriesNoOptOutError when cancelling a confirmed group series (M3)", async () => {
      const booking = makeBooking({
        type: "series",
        targetGroupSize: 3,
        currentState: "confirmed",
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      const { service, wallet, repo } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findParticipant: mock(async () => makeParticipant()),
        },
      });

      await expect(
        service.cancel("student1", "b1", "changed mind"),
      ).rejects.toThrow(BookingSeriesNoOptOutError);

      expect(wallet.release).not.toHaveBeenCalled();
      expect(wallet.deduct).not.toHaveBeenCalled();
      expect(repo.cancelAllSessions).not.toHaveBeenCalled();
    });

    test("throws BookingSeriesNoOptOutError when cancelling a group series awaiting tutor review (M3)", async () => {
      const booking = makeBooking({
        type: "series",
        targetGroupSize: 3,
        currentState: "awaiting_tutor_review",
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      const { service } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findParticipant: mock(async () => makeParticipant()),
        },
      });

      await expect(service.cancel("student1", "b1")).rejects.toThrow(
        BookingSeriesNoOptOutError,
      );
    });

    test("allows cancelling a group series still awaiting participant confirmation (M3)", async () => {
      const booking = makeBooking({
        type: "series",
        targetGroupSize: 3,
        currentState: "awaiting_participant_confirmation",
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      const { service, wallet, repo } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findParticipant: mock(async () => makeParticipant()),
          findConfirmedParticipants: mock(async () => [
            makeParticipant({ heldAmount: 42 }),
          ]),
          updateBookingVersioned: mock(async () => ({
            updated: { ...booking, currentState: "expired" },
            newVersion: 2,
          })),
        },
      });

      // Pre-confirmation the group can still be pulled (no opt-out has
      // happened yet); CANCELLED is not reachable from this state, so the
      // terminal target is EXPIRED (mirroring withdraw's cancelTarget logic).
      await service.cancel("student1", "b1", "not enough interest");

      expect(wallet.release).toHaveBeenCalledTimes(1);
      expect(repo.cancelAllSessions).toHaveBeenCalledTimes(1);
      expect(repo.updateBookingVersioned).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        1,
        expect.objectContaining({ currentState: "expired" }),
      );
    });

    test("solo-series cancel still works (targetGroupSize 1 is not a group series) (M3)", async () => {
      const booking = makeBooking({
        type: "series",
        targetGroupSize: 1,
        currentState: "confirmed",
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      const { service, wallet } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findParticipant: mock(async () => makeParticipant()),
          findConfirmedParticipants: mock(async () => [
            makeParticipant({ heldAmount: 42 }),
          ]),
          updateBookingVersioned: mock(async () => ({
            updated: { ...booking, currentState: "cancelled" },
            newVersion: 2,
          })),
        },
      });

      await service.cancel("student1", "b1");

      expect(wallet.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("tutorAccept", () => {
    test("throws BookingNotFoundError when booking does not exist", async () => {
      const { service } = createService({
        repo: { findBookingById: mock(async () => null) },
      });

      await expect(service.tutorAccept("b1", "tutor1")).rejects.toThrow(
        BookingNotFoundError,
      );
    });

    test("throws BookingNotOwnedError when tutor does not own the booking", async () => {
      const { service } = createService({
        repo: {
          findBookingById: mock(async () =>
            makeBooking({ tutorId: "other_tutor" }),
          ),
        },
      });

      await expect(service.tutorAccept("b1", "tutor1")).rejects.toThrow(
        BookingNotOwnedError,
      );
    });

    test("throws BookingNotAwaitingReviewError when booking is not awaiting_tutor_review", async () => {
      const { service } = createService({
        repo: {
          findBookingById: mock(async () =>
            makeBooking({ currentState: "confirmed" }),
          ),
        },
      });

      await expect(service.tutorAccept("b1", "tutor1")).rejects.toThrow(
        BookingNotAwaitingReviewError,
      );
    });

    test("B4: throws BookingAcceptanceDeadlinePassedError when the booking deadline has passed", async () => {
      const { service, repo } = createService({
        repo: {
          findBookingById: mock(async () =>
            makeBooking({
              currentState: "awaiting_tutor_review",
              deadlineAt: new Date(Date.now() - 60_000),
            }),
          ),
        },
      });

      await expect(service.tutorAccept("b1", "tutor1")).rejects.toThrow(
        BookingAcceptanceDeadlinePassedError,
      );
      expect(repo.updateBookingVersioned).not.toHaveBeenCalled();
      expect(repo.updateBookingDeadline).not.toHaveBeenCalled();
    });

    test("accepts online booking — transitions to confirmed then scheduled and creates meeting with attendees", async () => {
      const booking = makeBooking({
        modality: "online",
        learningGoal: "Improve speaking confidence",
      });
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
          findConfirmedParticipants: mock(async () => [
            { userId: "student1" },
            { userId: "student2" },
          ]),
          findUserEmails: mock(async () => [
            { id: "tutor1", email: "tutor1@example.com", name: "Tutor One" },
            {
              id: "student1",
              email: "student1@example.com",
              name: "Student One",
            },
            {
              id: "student2",
              email: "student2@example.com",
              name: "Student Two",
            },
          ]),
        },
      });

      await service.tutorAccept("b1", "tutor1");

      expect(meetingMock.createEvent).toHaveBeenCalledTimes(1);
      expect(meetingMock.createEvent).toHaveBeenCalledWith(
        "b1",
        booking.scheduledStartAt,
        booking.scheduledEndAt,
        [
          { email: "tutor1@example.com", name: "Tutor One" },
          { email: "student1@example.com", name: "Student One" },
          { email: "student2@example.com", name: "Student Two" },
        ],
        expect.anything(), // L2: the meetingEvent row joins the booking tx
        {
          title: "Solo session with Tutor One & Student One",
          description: expect.stringContaining(
            "Learning goal: Improve speaking confidence",
          ),
        },
      );
      expect(notification.write).toHaveBeenCalledTimes(1);
      expect(notification.write.mock.calls[0][0].title).toBe(
        "Booking accepted",
      );
    });

    test("L3: notifies 'Meeting link ready' when the meeting row carries a URL", async () => {
      const booking = makeBooking({ modality: "online" });
      let findCallCount = 0;
      const { service, notification } = createService({
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
            async (_conn: any, _id: any, ver: number, updates: any) => ({
              updated: { ...booking, ...updates, version: ver + 1 },
              newVersion: ver + 1,
            }),
          ),
          findConfirmedParticipants: mock(async () => []),
          findUserEmails: mock(async () => [
            { id: "tutor1", email: "tutor1@example.com", name: "Tutor One" },
          ]),
        },
        meeting: {
          ...makeMeeting(),
          createEvent: mock(async () => ({
            id: "m1",
            bookingId: "b1",
            provider: "google_meet",
            externalEventId: "ext1",
            meetingUrl: "https://meet.google.com/abc",
            status: "created",
            errorReason: null,
          })),
        },
      });

      await service.tutorAccept("b1", "tutor1");

      const linkNotifs = notification.writeBestEffort.mock.calls.filter(
        (c: any) => c[0].eventKey === "booking.b1.scheduled.tutor",
      );
      expect(linkNotifs.length).toBe(1);
      expect(linkNotifs[0][0].title).toBe("Meeting link ready");
      expect(linkNotifs[0][0].body).toBe(
        "The meeting link for the session is ready.",
      );
    });

    test("L3: notifies 'Meeting link pending' when the meeting row has no URL (manual fallback)", async () => {
      const booking = makeBooking({ modality: "online" });
      let findCallCount = 0;
      const { service, notification } = createService({
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
            async (_conn: any, _id: any, ver: number, updates: any) => ({
              updated: { ...booking, ...updates, version: ver + 1 },
              newVersion: ver + 1,
            }),
          ),
          findConfirmedParticipants: mock(async () => []),
          findUserEmails: mock(async () => [
            { id: "tutor1", email: "tutor1@example.com", name: "Tutor One" },
          ]),
        },
        meeting: {
          ...makeMeeting(),
          createEvent: mock(async () => ({
            id: "m1",
            bookingId: "b1",
            provider: "manual",
            externalEventId: null,
            meetingUrl: null,
            status: "manual",
            errorReason: null,
          })),
        },
      });

      await service.tutorAccept("b1", "tutor1");

      const linkNotifs = notification.writeBestEffort.mock.calls.filter(
        (c: any) => c[0].eventKey === "booking.b1.scheduled.tutor",
      );
      expect(linkNotifs.length).toBe(1);
      expect(linkNotifs[0][0].title).toBe("Meeting link pending");
      expect(linkNotifs[0][0].body).toContain("pending");
    });

    test("accepts offline booking — transitions to confirmed then awaiting_admin_room_approval and sets deadline", async () => {
      const scheduledStartAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const booking = makeBooking({ modality: "offline", scheduledStartAt });
      let findCallCount = 0;
      const { service, repo, meeting } = createService({
        repo: {
          findBookingById: mock(async () => {
            findCallCount++;
            if (findCallCount === 1)
              return {
                ...booking,
                currentState: "awaiting_tutor_review",
                version: 1,
              };
            if (findCallCount === 2)
              return {
                ...booking,
                currentState: "awaiting_tutor_review",
                version: 1,
              };
            if (findCallCount === 3)
              return {
                ...booking,
                currentState: "confirmed",
                version: 2,
              };
            return {
              ...booking,
              currentState: "awaiting_admin_room_approval",
              version: 3,
            };
          }),
          updateBookingVersioned: mock(
            async (_conn: any, _id: any, ver: number, updates: any) => ({
              updated: { ...booking, ...updates, version: ver + 1 },
              newVersion: ver + 1,
            }),
          ),
        },
      });

      await service.tutorAccept("b1", "tutor1");

      expect(repo.updateBookingDeadline).toHaveBeenCalledTimes(1);
      const deadlineArg = repo.updateBookingDeadline.mock.calls[0][2] as Date;
      // DL-25 (U12): room approval window is 12h, capped at session start —
      // this session is 48h out, so the deadline is now + 12h.
      const expected = Date.now() + 12 * 60 * 60 * 1000;
      expect(deadlineArg.getTime()).toBeGreaterThan(expected - 60_000);
      expect(deadlineArg.getTime()).toBeLessThan(expected + 60_000);
      expect(meeting.createEvent).not.toHaveBeenCalled();
    });

    test("leaves booking in CONFIRMED when meeting creation fails for online booking", async () => {
      const booking = makeBooking({ modality: "online" });
      let findCallCount = 0;
      const { service, meeting, notification } = createService({
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

      await service.tutorAccept("b1", "tutor1");

      expect(meeting.createEvent).toHaveBeenCalled();
      expect(findCallCount).toBeGreaterThanOrEqual(2);
      expect(notification.write).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Booking accepted",
          body: "Tutor accepted. The booking is confirmed, but meeting link setup still needs attention.",
        }),
      );
    });

    test("F6: meeting failure bumps the deadline to scheduledEndAt + 24h so the retry window is respected", async () => {
      const scheduledEndAt = new Date(Date.now() + 48 * 3600_000);
      const booking = makeBooking({
        modality: "online",
        scheduledEndAt,
        deadlineAt: new Date(Date.now() + 12 * 3600_000),
      });
      let findCallCount = 0;
      const { service, repo } = createService({
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
            async (_conn: any, _id: any, ver: number, updates: any) => ({
              updated: { ...booking, ...updates, version: ver + 1 },
              newVersion: ver + 1,
            }),
          ),
        },
        meeting: {
          createEvent: mock(async () => {
            throw new Error("Meeting API down");
          }),
        },
      });

      await service.tutorAccept("b1", "tutor1");

      expect(repo.updateBookingDeadline).toHaveBeenCalledTimes(1);
      const deadlineArg = repo.updateBookingDeadline.mock.calls[0][2] as Date;
      const expected = scheduledEndAt.getTime() + 24 * 3600_000;
      expect(deadlineArg.getTime()).toBe(expected);
    });
  });

  describe("tutorDecline", () => {
    test("throws BookingNotFoundError when booking does not exist", async () => {
      const { service } = createService({
        repo: { findBookingById: mock(async () => null) },
      });

      await expect(service.tutorDecline("b1", "tutor1")).rejects.toThrow(
        BookingNotFoundError,
      );
    });

    test("throws BookingNotOwnedError when tutor does not own the booking", async () => {
      const { service } = createService({
        repo: {
          findBookingById: mock(async () =>
            makeBooking({ tutorId: "other_tutor" }),
          ),
        },
      });

      await expect(service.tutorDecline("b1", "tutor1")).rejects.toThrow(
        BookingNotOwnedError,
      );
    });

    test("declines booking and releases holds", async () => {
      const booking = makeBooking({ holdAmount: 42 });
      const { service, wallet, notification, repo } = createService({
        repo: {
          findBookingById: mock(async () => booking),
          findConfirmedParticipants: mock(async () => [
            makeParticipant({ heldAmount: 42 }),
          ]),
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
      expect(repo.updateBookingHoldAmount).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        0,
      );
      expect(notification.writeBestEffort).toHaveBeenCalledTimes(1);
      expect(notification.writeBestEffort.mock.calls[0][0].title).toBe(
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

    test("M5: user-supplied decline reason is HTML-escaped in the notification body", async () => {
      const booking = makeBooking({ holdAmount: 42 });
      const { service, notification } = createService({
        repo: {
          findBookingById: mock(async () => booking),
          findConfirmedParticipants: mock(async () => [
            makeParticipant({ heldAmount: 42 }),
          ]),
          updateBookingVersioned: mock(async () => ({
            updated: { ...booking, currentState: "declined" },
            newVersion: 2,
          })),
        },
      });

      await service.tutorDecline("b1", "tutor1", "<script>alert(1)</script>");

      const body = notification.writeBestEffort.mock.calls[0][0].body as string;
      expect(body).not.toContain("<script>");
      expect(body).toContain("&lt;script&gt;");
    });

    test("OQ-05: tutorDecline cancels the provider-side meeting event (best-effort)", async () => {
      const booking = makeBooking({ holdAmount: 42 });
      const { service, meeting } = createService({
        repo: {
          findBookingById: mock(async () => booking),
          findConfirmedParticipants: mock(async () => [
            makeParticipant({ heldAmount: 42 }),
          ]),
          updateBookingVersioned: mock(async () => ({
            updated: { ...booking, currentState: "declined" },
            newVersion: 2,
          })),
        },
      });

      await service.tutorDecline("b1", "tutor1", "schedule conflict");

      expect(meeting.cancelEvent).toHaveBeenCalledWith("b1");
    });
  });

  describe("tutorSetMeetingLink", () => {
    test("sets a manual link inside the booking transaction and notifies the student", async () => {
      const booking = makeBooking({ currentState: "confirmed" });
      const { service, meeting, notification, audit } = createService({
        repo: {
          findBookingById: mock(async () => booking),
          findConfirmedParticipants: mock(async () => [
            makeParticipant({ userId: "student1" }),
          ]),
        },
      });

      const result = await service.tutorSetMeetingLink(
        "b1",
        "tutor1",
        "https://meet.example.com/tutor-fallback",
      );

      expect(result).toMatchObject({
        bookingId: "b1",
        meetingUrl: "https://meet.example.com/tutor-fallback",
        status: "created",
      });
      expect(meeting.setManualLink).toHaveBeenCalledWith(
        "b1",
        "https://meet.example.com/tutor-fallback",
        expect.anything(),
      );
      expect(notification.writeBestEffort).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "student1",
          bookingId: "b1",
          title: "Meeting link ready",
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: "tutor1",
          actorType: "tutor",
          action: "tutor_set_meeting_link",
        }),
      );
    });

    test("rejects a tutor who is not assigned to the booking", async () => {
      const { service, meeting } = createService({
        repo: {
          findBookingById: mock(async () =>
            makeBooking({ currentState: "scheduled", tutorId: "other-tutor" }),
          ),
        },
      });

      await expect(
        service.tutorSetMeetingLink("b1", "tutor1", "https://example.com"),
      ).rejects.toThrow(BookingNotOwnedError);
      expect(meeting.setManualLink).not.toHaveBeenCalled();
    });

    test("rejects offline bookings and bookings outside confirmed/scheduled states", async () => {
      const { service: offlineService } = createService({
        repo: {
          findBookingById: mock(async () =>
            makeBooking({ currentState: "scheduled", modality: "offline" }),
          ),
        },
      });
      await expect(
        offlineService.tutorSetMeetingLink(
          "b1",
          "tutor1",
          "https://example.com/offline",
        ),
      ).rejects.toThrow(BookingNotEditableError);

      const { service: pendingService } = createService({
        repo: {
          findBookingById: mock(async () =>
            makeBooking({ currentState: "awaiting_tutor_review" }),
          ),
        },
      });
      await expect(
        pendingService.tutorSetMeetingLink(
          "b1",
          "tutor1",
          "https://example.com/pending",
        ),
      ).rejects.toThrow(BookingNotEditableError);
    });
  });

  describe("completeSession", () => {
    test("throws BookingNotFoundError when booking does not exist", async () => {
      const { service } = createService({
        repo: { findBookingById: mock(async () => null) },
      });

      await expect(service.completeSession("b1", "tutor1")).rejects.toThrow(
        BookingNotFoundError,
      );
    });

    test("throws BookingNotOwnedError when not the tutor", async () => {
      const { service } = createService({
        repo: {
          findBookingById: mock(async () => makeBooking({ tutorId: "other" })),
        },
      });

      await expect(service.completeSession("b1", "tutor1")).rejects.toThrow(
        BookingNotOwnedError,
      );
    });

    test("throws BookingSessionRequiredError for series bookings without sessionId", async () => {
      const { service } = createService({
        repo: {
          findBookingById: mock(async () =>
            makeBooking({ type: "series", currentState: "scheduled" }),
          ),
        },
      });

      await expect(service.completeSession("b1", "tutor1")).rejects.toThrow(
        BookingSessionRequiredError,
      );
    });

    test("series session completion deducts perSession, marks session completed, keeps booking scheduled (G18)", async () => {
      const booking = makeBooking({
        type: "series",
        currentState: "scheduled",
        holdAmount: 150,
        originalMarks: 150,
      });
      const session = {
        id: "s1",
        seriesBookingId: "b1",
        scheduledStartAt: new Date(Date.now() - 3600_000),
        scheduledEndAt: new Date(Date.now() + 3600_000),
        currentState: "scheduled",
        holdAmount: 50,
        priceSnapshot: null,
      };
      const sessions = [
        session,
        { ...session, id: "s2", currentState: "scheduled" },
        { ...session, id: "s3", currentState: "scheduled" },
      ];
      const refreshed = { ...booking, holdAmount: 100, version: 2 };
      const { service, wallet, repo, notification } = createService({
        repo: {
          findBookingById: mock(async () => refreshed)
            .mockImplementationOnce(async () => booking)
            .mockImplementationOnce(async () => refreshed),
          findSessionById: mock(async () => session),
          listSessionsBySeriesId: mock(async () => sessions),
          findParticipant: mock(async () => ({
            id: "p1",
            userId: "student1",
            heldAmount: 150,
          })),
          updateParticipantState: mock(async () => {}),
          updateBookingHoldAmount: mock(async () => {}),
          completeSession: mock(async () => {}),
          updateBookingVersioned: mock(async () => ({
            updated: { ...booking, currentState: "completed" },
            newVersion: 2,
          })),
        },
      });

      const result = await service.completeSession("b1", "tutor1", "s1");

      expect(wallet.deduct).toHaveBeenCalledTimes(1);
      expect(wallet.deduct.mock.calls[0][1]).toMatchObject({
        walletId: "w1",
        amount: 50,
        reason: "Series session completed",
      });
      expect(repo.completeSession).toHaveBeenCalledWith(
        expect.anything(),
        "s1",
      );
      expect(repo.updateParticipantState).toHaveBeenCalledWith(
        expect.anything(),
        "p1",
        { heldAmount: 100 },
      );
      expect(repo.updateBookingHoldAmount).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        100,
      );
      expect(repo.updateBookingVersioned).not.toHaveBeenCalled();
      expect(result.currentState).toBe("scheduled");
      expect(result.holdAmount).toBe(100);
      expect(result.originalMarks).toBe(150);
      expect(wallet.release).not.toHaveBeenCalled();
      expect(notification.writeBestEffort.mock.calls.length).toBe(2);
    });

    test("L1: series completion deducts at most the remaining held amount after an admin partial cancel", async () => {
      const booking = makeBooking({
        type: "series",
        currentState: "scheduled",
        holdAmount: 20,
        originalMarks: 150,
      });
      const session = {
        id: "s1",
        seriesBookingId: "b1",
        scheduledStartAt: new Date(Date.now() - 3600_000),
        scheduledEndAt: new Date(Date.now() + 3600_000),
        currentState: "scheduled",
        holdAmount: 50,
        priceSnapshot: null,
      };
      const sessions = [
        session,
        { ...session, id: "s2", currentState: "scheduled" },
        { ...session, id: "s3", currentState: "scheduled" },
      ];
      const refreshed = { ...booking, holdAmount: 20, version: 2 };
      const { service, wallet, repo } = createService({
        repo: {
          findBookingById: mock(async () => refreshed)
            .mockImplementationOnce(async () => booking)
            .mockImplementationOnce(async () => refreshed),
          findSessionById: mock(async () => session),
          listSessionsBySeriesId: mock(async () => sessions),
          findParticipant: mock(async () => ({
            id: "p1",
            userId: "student1",
            heldAmount: 20,
          })),
          updateParticipantState: mock(async () => {}),
          updateBookingHoldAmount: mock(async () => {}),
          completeSession: mock(async () => {}),
          updateBookingVersioned: mock(async () => ({
            updated: { ...booking, currentState: "completed" },
            newVersion: 2,
          })),
        },
      });

      const result = await service.completeSession("b1", "tutor1", "s1");

      // The admin released 130 of the 150-hold via cancelSeriesSession(..., release);
      // the completion must deduct only the remaining 20, never 50 (would throw
      // InsufficientBalanceError → delivered-but-unpaid session).
      expect(wallet.deduct).toHaveBeenCalledTimes(1);
      expect(wallet.deduct.mock.calls[0][1]).toMatchObject({
        amount: 20,
        reason: "Series session completed",
      });
      expect(repo.updateParticipantState).toHaveBeenCalledWith(
        expect.anything(),
        "p1",
        { heldAmount: 0 },
      );
      expect(repo.updateBookingHoldAmount).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        0,
      );
      expect(result.currentState).toBe("scheduled");
    });

    test("L1: group-series completion deducts at most each participant's remaining hold after an admin partial cancel", async () => {
      const booking = makeBooking({
        type: "series",
        targetGroupSize: 3,
        currentState: "scheduled",
        holdAmount: 40,
        originalMarks: 120,
      });
      const session = {
        id: "s1",
        seriesBookingId: "b1",
        scheduledStartAt: new Date(Date.now() - 3600_000),
        scheduledEndAt: new Date(Date.now() + 3600_000),
        currentState: "scheduled",
        holdAmount: 40,
        priceSnapshot: null,
      };
      const sessions = [
        session,
        { ...session, id: "s2", currentState: "scheduled" },
        { ...session, id: "s3", currentState: "scheduled" },
      ];
      const refreshed = { ...booking, holdAmount: 40, version: 2 };
      const { service, wallet, repo } = createService({
        repo: {
          findBookingById: mock(async () => refreshed)
            .mockImplementationOnce(async () => booking)
            .mockImplementationOnce(async () => refreshed),
          findSessionById: mock(async () => session),
          listSessionsBySeriesId: mock(async () => sessions),
          findConfirmedParticipants: mock(async () => [
            { id: "p1", userId: "student1", heldAmount: 20 },
            { id: "p2", userId: "student2", heldAmount: 20 },
          ]),
          updateParticipantState: mock(async () => {}),
          updateBookingHoldAmount: mock(async () => {}),
          completeSession: mock(async () => {}),
          updateBookingVersioned: mock(async () => ({
            updated: { ...booking, currentState: "completed" },
            newVersion: 2,
          })),
        },
      });

      const result = await service.completeSession("b1", "tutor1", "s1");

      // Each participant holds only 20 of the 40 per-session amount after the
      // admin released part of their package — never deduct more than held.
      expect(wallet.deduct).toHaveBeenCalledTimes(2);
      for (const call of wallet.deduct.mock.calls) {
        expect(call[1]).toMatchObject({ amount: 20 });
      }
      expect(repo.updateBookingHoldAmount).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        0,
      );
      expect(result.currentState).toBe("scheduled");
    });

    test("completing the last series session transitions booking to completed (G18)", async () => {
      const booking = makeBooking({
        type: "series",
        currentState: "scheduled",
        holdAmount: 50,
        originalMarks: 150,
      });
      const sessions = [
        {
          id: "s1",
          seriesBookingId: "b1",
          scheduledStartAt: new Date(Date.now() - 3600_000),
          scheduledEndAt: new Date(Date.now() + 3600_000),
          currentState: "completed",
          holdAmount: 50,
          priceSnapshot: null,
        },
        {
          id: "s2",
          seriesBookingId: "b1",
          scheduledStartAt: new Date(Date.now() - 3600_000),
          scheduledEndAt: new Date(Date.now() + 3600_000),
          currentState: "completed",
          holdAmount: 50,
          priceSnapshot: null,
        },
        {
          id: "s3",
          seriesBookingId: "b1",
          scheduledStartAt: new Date(Date.now() - 3600_000),
          scheduledEndAt: new Date(Date.now() + 3600_000),
          currentState: "scheduled",
          holdAmount: 50,
          priceSnapshot: null,
        },
      ];
      const completedBooking = {
        ...booking,
        currentState: "completed",
        holdAmount: 0,
        version: 2,
      };
      const { service, repo, notification, wallet } = createService({
        repo: {
          findBookingById: mock(async () => completedBooking)
            .mockImplementationOnce(async () => booking)
            .mockImplementationOnce(async () => booking),
          findSessionById: mock(async () => sessions[2]),
          listSessionsBySeriesId: mock(async () => [
            ...sessions.slice(0, 2),
            { ...sessions[2]!, currentState: "completed" },
          ]),
          findParticipant: mock(async () => ({
            id: "p1",
            userId: "student1",
            heldAmount: 50,
          })),
          updateParticipantState: mock(async () => {}),
          updateBookingHoldAmount: mock(async () => {}),
          completeSession: mock(async () => {}),
          updateBookingVersioned: mock(async () => ({
            updated: { ...booking, currentState: "completed", holdAmount: 0 },
            newVersion: 2,
          })),
        },
      });

      const result = await service.completeSession("b1", "tutor1", "s3");

      expect(repo.updateBookingVersioned).toHaveBeenCalledTimes(1);
      expect(repo.updateBookingHoldAmount).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        0,
      );
      expect(result.currentState).toBe("completed");
      expect(result.holdAmount).toBe(0);
      expect(wallet.release).not.toHaveBeenCalled();
      // 2 per-session notifications + 2 series-completed notifications
      expect(notification.writeBestEffort.mock.calls.length).toBe(4);
    });

    test("completing the last series session releases a residual participant hold (G18)", async () => {
      const booking = makeBooking({
        type: "series",
        currentState: "scheduled",
        holdAmount: 50,
        originalMarks: 150,
      });
      const sessions = [
        {
          id: "s1",
          seriesBookingId: "b1",
          scheduledStartAt: new Date(Date.now() - 3600_000),
          scheduledEndAt: new Date(Date.now() + 3600_000),
          currentState: "completed",
          holdAmount: 50,
          priceSnapshot: null,
        },
        {
          id: "s2",
          seriesBookingId: "b1",
          scheduledStartAt: new Date(Date.now() - 3600_000),
          scheduledEndAt: new Date(Date.now() + 3600_000),
          currentState: "completed",
          holdAmount: 50,
          priceSnapshot: null,
        },
        {
          id: "s3",
          seriesBookingId: "b1",
          scheduledStartAt: new Date(Date.now() - 3600_000),
          scheduledEndAt: new Date(Date.now() + 3600_000),
          currentState: "scheduled",
          holdAmount: 50,
          priceSnapshot: null,
        },
      ];
      const completedBooking = {
        ...booking,
        currentState: "completed",
        holdAmount: 0,
        version: 2,
      };
      const { service, repo, notification, wallet } = createService({
        repo: {
          findBookingById: mock(async () => completedBooking)
            .mockImplementationOnce(async () => booking)
            .mockImplementationOnce(async () => booking),
          findSessionById: mock(async () => sessions[2]),
          listSessionsBySeriesId: mock(async () => [
            ...sessions.slice(0, 2),
            { ...sessions[2]!, currentState: "completed" },
          ]),
          findParticipant: mock(async () => ({
            id: "p1",
            userId: "student1",
            heldAmount: 60,
          })),
          updateParticipantState: mock(async () => {}),
          updateBookingHoldAmount: mock(async () => {}),
          completeSession: mock(async () => {}),
          updateBookingVersioned: mock(async () => ({
            updated: { ...booking, currentState: "completed", holdAmount: 0 },
            newVersion: 2,
          })),
        },
      });

      const result = await service.completeSession("b1", "tutor1", "s3");

      expect(result.currentState).toBe("completed");
      expect(result.holdAmount).toBe(0);
      expect(repo.updateParticipantState).toHaveBeenCalledWith(
        expect.anything(),
        "p1",
        { heldAmount: 10 },
      );
      expect(wallet.release).toHaveBeenCalledTimes(1);
      expect(wallet.release.mock.calls[0][1]).toMatchObject({
        walletId: "w1",
        amount: 10,
        eventKey: "booking.b1.series-release",
        sourceReference: "b1",
        bookingId: "b1",
        actorType: "tutor",
        reason: "Series completed: released residual hold",
      });
      expect(notification.writeBestEffort.mock.calls.length).toBe(4);
    });

    test("series future session completion is rejected (G18)", async () => {
      const booking = makeBooking({
        type: "series",
        currentState: "scheduled",
        holdAmount: 150,
      });
      const session = {
        id: "s1",
        seriesBookingId: "b1",
        scheduledStartAt: new Date(Date.now() + 48 * 3600_000),
        scheduledEndAt: new Date(Date.now() + 48 * 3600_000 + 3600_000),
        currentState: "scheduled",
        holdAmount: 50,
        priceSnapshot: null,
      };
      const { service } = createService({
        repo: {
          findBookingById: mock(async () => booking),
          findSessionById: mock(async () => session),
        },
      });

      await expect(
        service.completeSession("b1", "tutor1", "s1"),
      ).rejects.toThrow(BookingSessionNotStartedError);
    });

    test("series already-completed session completion is rejected (G18)", async () => {
      const booking = makeBooking({
        type: "series",
        currentState: "scheduled",
        holdAmount: 150,
      });
      const session = {
        id: "s1",
        seriesBookingId: "b1",
        scheduledStartAt: new Date(Date.now() - 3600_000),
        scheduledEndAt: new Date(Date.now() + 3600_000),
        currentState: "completed",
        holdAmount: 50,
        priceSnapshot: null,
      };
      const { service } = createService({
        repo: {
          findBookingById: mock(async () => booking),
          findSessionById: mock(async () => session),
        },
      });

      await expect(
        service.completeSession("b1", "tutor1", "s1"),
      ).rejects.toThrow(BookingStateTransitionError);
    });

    test("throws BookingStateTransitionError when not in scheduled state", async () => {
      const { service } = createService({
        repo: {
          findBookingById: mock(async () =>
            makeBooking({ currentState: "confirmed" }),
          ),
        },
      });

      await expect(service.completeSession("b1", "tutor1")).rejects.toThrow(
        BookingStateTransitionError,
      );
    });

    test("group booking after proposer withdrawal deducts each confirmed participant's hold", async () => {
      const booking = makeBooking({
        type: "group",
        currentState: "scheduled",
        holdAmount: 105,
        scheduledStartAt: new Date(Date.now() - 3600_000),
      });
      const participants = [
        { id: "p2", userId: "student2", heldAmount: 35 },
        { id: "p3", userId: "student3", heldAmount: 35 },
        { id: "p4", userId: "student4", heldAmount: 35 },
      ];
      const { service, wallet, repo, notification } = createService({
        repo: {
          findBookingById: mock(async () => booking),
          findConfirmedParticipants: mock(async () => participants),
          updateBookingVersioned: mock(async () => ({
            updated: { ...booking, currentState: "completed" },
            newVersion: 2,
          })),
        },
        wallet: {
          getByUserId: mock(async (_conn: any, userId: string) => ({
            id: `w-${userId}`,
            totalBalance: 500,
            heldBalance: 0,
            availableBalance: 500,
          })),
        },
      });

      await service.completeSession("b1", "tutor1");

      expect(repo.findConfirmedParticipants).toHaveBeenCalledTimes(1);
      expect(wallet.deduct).toHaveBeenCalledTimes(3);
      const deductCalls = wallet.deduct.mock.calls.map((c) => c[1]);
      expect(deductCalls).toEqual([
        expect.objectContaining({
          walletId: "w-student2",
          amount: 35,
          eventKey: "booking.b1.complete.student2",
        }),
        expect.objectContaining({
          walletId: "w-student3",
          amount: 35,
          eventKey: "booking.b1.complete.student3",
        }),
        expect.objectContaining({
          walletId: "w-student4",
          amount: 35,
          eventKey: "booking.b1.complete.student4",
        }),
      ]);
      expect(wallet.getByUserId.mock.calls.map((c) => c[1])).toEqual([
        "student2",
        "student3",
        "student4",
      ]);
      expect(wallet.getByUserId.mock.calls.map((c) => c[1])).not.toContain(
        "student1",
      );
      expect(repo.updateBookingHoldAmount).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        0,
      );
      expect(notification.writeBestEffort).toHaveBeenCalledTimes(1);
    });

    test("completes session, deducts marks, sets holdAmount to 0", async () => {
      const booking = makeBooking({
        currentState: "scheduled",
        holdAmount: 42,
        scheduledStartAt: new Date(Date.now() - 3600_000),
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
      expect(notification.writeBestEffort).toHaveBeenCalledTimes(1);
      expect(notification.writeBestEffort.mock.calls[0][0].title).toBe(
        "Session completed",
      );
    });
  });

  describe("confirmInvite", () => {
    test("throws BookingNotFoundError when booking does not exist", async () => {
      const { service } = createService({
        repo: { findBookingById: mock(async () => null) },
      });

      await expect(service.confirmInvite("student2", "b1")).rejects.toThrow(
        BookingNotFoundError,
      );
    });

    test("throws BookingNotAwaitingConfirmationError when booking is not awaiting participant confirmation", async () => {
      const { service } = createService({
        repo: {
          findBookingById: mock(async () =>
            makeBooking({ currentState: "confirmed" }),
          ),
        },
      });

      await expect(service.confirmInvite("student2", "b1")).rejects.toThrow(
        BookingNotAwaitingConfirmationError,
      );
    });

    test("throws BookingNotOwnedError when user is not a participant", async () => {
      const { service } = createService({
        repo: {
          findBookingById: mock(async () =>
            makeBooking({ currentState: "awaiting_participant_confirmation" }),
          ),
          findParticipant: mock(async () => null),
        },
      });

      await expect(service.confirmInvite("student2", "b1")).rejects.toThrow(
        BookingNotOwnedError,
      );
    });

    test("throws BookingNotEditableError when user is not an invitee", async () => {
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
        BookingNotEditableError,
      );
    });

    test("throws BookingParticipantAlreadyConfirmedError when invite already confirmed or declined", async () => {
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
        BookingParticipantAlreadyConfirmedError,
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
          baselineCogitoTake: 12,
          baselineTutorShare: 30,
          extraTotal: 0,
          cogitoExtraTake: 0,
          tutorExtraShare: 0,
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
          incrementBookingConfirmedHeadcount: mock(async () => ({
            ...booking,
            confirmedHeadcount: 2,
          })),
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
      expect(repo.incrementBookingConfirmedHeadcount).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
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
          baselineCogitoTake: 12,
          baselineTutorShare: 30,
          extraTotal: 0,
          cogitoExtraTake: 0,
          tutorExtraShare: 0,
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
          incrementBookingConfirmedHeadcount: mock(async () => ({
            ...booking,
            confirmedHeadcount: 2,
          })),
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

    test("throws BookingNotEditableError when user is not an invitee", async () => {
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
        BookingNotEditableError,
      );
    });
  });

  describe("reconfirm", () => {
    test("throws BookingNotAwaitingReconfirmationError when booking is not awaiting reconfirmation", async () => {
      const { service } = createService({
        repo: {
          findBookingById: mock(async () =>
            makeBooking({ currentState: "confirmed" }),
          ),
          findParticipant: mock(async () => makeParticipant()),
        },
      });

      await expect(service.reconfirm("student1", "b1", true)).rejects.toThrow(
        BookingNotAwaitingReconfirmationError,
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

    test("syncs the booking hold when a flat group price map keeps the same rate", async () => {
      let booking = makeBooking({
        type: "group",
        currentState: "awaiting_reconfirmation",
        targetGroupSize: 3,
        holdAmount: 126,
        priceSnapshot: {
          perStudent: 42,
          baseline: 42,
          tutorShare: 33.6,
          cogitoTake: 8.4,
          baselineCogitoTake: 12,
          baselineTutorShare: 30,
          extraTotal: 0,
          cogitoExtraTake: 0,
          tutorExtraShare: 0,
        },
      });
      let reconfirmedCount = 0;
      const participant = makeParticipant({
        confirmationState: "confirmed",
        heldAmount: 42,
      });
      const confirmed = [
        participant,
        makeParticipant({ id: "p2", userId: "student2", heldAmount: 42 }),
      ];
      const { service, repo } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findParticipant: mock(async () => participant),
          findReconfirmedParticipants: mock(async () =>
            confirmed.slice(0, reconfirmedCount),
          ),
          findConfirmedParticipants: mock(async () => confirmed),
          findTutorProfile: mock(async () =>
            makeTutorProfile({ prices: { "2": 42, "3": 42 } }),
          ),
          updateParticipantState: mock(
            async (_tx: any, _id: string, updates: any) => {
              if (updates.confirmationState === "reconfirmed") {
                reconfirmedCount += 1;
              }
            },
          ),
          resetReconfirmedParticipants: mock(async () => {
            reconfirmedCount = 0;
          }),
          updateBookingPriceSnapshot: mock(
            async (_tx: any, _id: string, updates: any) => {
              booking = { ...booking, ...updates };
            },
          ),
          updateBookingHoldAmount: mock(
            async (_tx: any, _id: string, amount: number) => {
              booking = { ...booking, holdAmount: amount };
            },
          ),
          updateBookingVersioned: mock(
            async (_tx: any, _id: string, version: number, updates: any) => ({
              updated: { ...booking, ...updates, version: version + 1 },
              newVersion: version + 1,
            }),
          ),
        },
      });

      await service.reconfirm("student1", "b1", true);

      expect(repo.updateBookingHoldAmount).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        84,
      );
      expect(repo.updateBookingDeadline).toHaveBeenCalledTimes(1);

      reconfirmedCount = 1;
      const result = await service.reconfirm("student1", "b1", true);

      expect(result).toEqual({ reconfirmed: true });
      expect(repo.updateBookingVersioned).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        1,
        expect.objectContaining({ currentState: "awaiting_tutor_review" }),
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

    test("releases the declining participant's hold and reprices (H5)", async () => {
      const booking = makeBooking({
        type: "group",
        currentState: "awaiting_reconfirmation",
        targetGroupSize: 3,
        priceSnapshot: {
          perStudent: 42,
          baseline: 42,
          tutorShare: 33.6,
          cogitoTake: 8.4,
          baselineCogitoTake: 12,
          baselineTutorShare: 30,
          extraTotal: 0,
          cogitoExtraTake: 0,
          tutorExtraShare: 0,
        },
      });
      const participant = makeParticipant({
        confirmationState: "reconfirmed",
        heldAmount: 42,
      });
      const { service, wallet, repo } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findParticipant: mock(async () => participant),
          decrementBookingConfirmedHeadcount: mock(async () => {}),
          findConfirmedParticipants: mock(async () => [
            makeParticipant({ id: "p2", userId: "student2" }),
            makeParticipant({ id: "p3", userId: "student3" }),
          ]),
          findTutorProfile: mock(async () => makeTutorProfile()),
        },
        wallet: {
          ...makeWallet(),
          getByUserId: mock(async () => ({
            id: "w1",
            totalBalance: 100,
            heldBalance: 42,
            availableBalance: 58,
          })),
        },
      });

      const result = await service.reconfirm("student1", "b1", false);
      expect(result).toEqual({ reconfirmed: false });
      expect(wallet.release).toHaveBeenCalledTimes(1);
      expect(wallet.release.mock.calls[0][1].amount).toBe(42);
      expect(repo.decrementBookingConfirmedHeadcount).toHaveBeenCalledTimes(1);
      expect(repo.updateParticipantState).toHaveBeenCalledWith(
        expect.anything(),
        "p1",
        expect.objectContaining({ heldAmount: 0 }),
      );
    });

    test("M5: decline refreshes the reconfirmation deadline to now + 12h when the group survives", async () => {
      const booking = makeBooking({
        type: "group",
        currentState: "awaiting_reconfirmation",
        targetGroupSize: 3,
        priceSnapshot: {
          perStudent: 42,
          baseline: 42,
          tutorShare: 33.6,
          cogitoTake: 8.4,
          baselineCogitoTake: 12,
          baselineTutorShare: 30,
          extraTotal: 0,
          cogitoExtraTake: 0,
          tutorExtraShare: 0,
        },
      });
      const participant = makeParticipant({
        confirmationState: "reconfirmed",
        heldAmount: 42,
      });
      const { service, repo } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findParticipant: mock(async () => participant),
          decrementBookingConfirmedHeadcount: mock(async () => {}),
          // Two confirmed participants remain — the group survives and
          // reprices, so the reconfirmation window must refresh.
          findConfirmedParticipants: mock(async () => [
            makeParticipant({ id: "p2", userId: "student2" }),
            makeParticipant({ id: "p3", userId: "student3" }),
          ]),
          findTutorProfile: mock(async () => makeTutorProfile()),
        },
        wallet: {
          ...makeWallet(),
          getByUserId: mock(async () => ({
            id: "w1",
            totalBalance: 100,
            heldBalance: 42,
            availableBalance: 58,
          })),
        },
      });

      const result = await service.reconfirm("student1", "b1", false);
      expect(result).toEqual({ reconfirmed: false });
      expect(repo.updateBookingDeadline).toHaveBeenCalledTimes(1);
      const deadlineArg = repo.updateBookingDeadline.mock.calls[0][2] as Date;
      const diff = deadlineArg.getTime() - Date.now();
      expect(diff).toBeGreaterThanOrEqual(RESPONSE_WINDOW_MS - 1000);
      expect(diff).toBeLessThanOrEqual(RESPONSE_WINDOW_MS + 1000);
    });

    test("N1: equal per-student price at the old and new headcounts does not loop the F3 reissue forever", async () => {
      // Legacy flat price map: the per-student price is the same at sizes 2
      // and 3, so repriceGroupForHeadcount early-returns without updating
      // holdAmount — the F3 derivation (holdAmount/perStudent) then reports a
      // stale size-3 headcount for a booking that now has 2 confirmed
      // participants, re-firing the reissue branch on every accept.
      const booking = makeBooking({
        type: "group",
        currentState: "awaiting_reconfirmation",
        targetGroupSize: 3,
        // Stale: priced at the size-3 total (3 × 42) after one participant
        // left mid-cycle.
        holdAmount: 126,
        priceSnapshot: {
          perStudent: 42,
          baseline: 126,
          tutorShare: 100.8,
          cogitoTake: 25.2,
        },
      });
      const p2 = makeParticipant({
        id: "p2",
        userId: "student2",
        heldAmount: 42,
      });
      const p3 = makeParticipant({
        id: "p3",
        userId: "student3",
        heldAmount: 42,
      });
      const participants = [p2, p3];
      // Stateful booking row so the mock reflects holdAmount syncs the way
      // the real DB row would after updateBookingHoldAmount.
      const liveBooking = { ...booking, holdAmount: 126 };

      const { service, repo } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...liveBooking, version: 1 })),
          findParticipant: mock(
            async (_conn: unknown, _bookingId: string, userId: string) =>
              userId === "student2" ? p2 : p3,
          ),
          updateParticipantState: mock(
            async (_tx: unknown, _id: string, updates: any) => {
              if (updates.confirmationState) {
                const target = participants.find((p) => p.id === _id);
                if (target) {
                  target.confirmationState = updates.confirmationState;
                }
              }
            },
          ),
          updateBookingHoldAmount: mock(
            async (_tx: unknown, _id: string, amount: number) => {
              liveBooking.holdAmount = amount;
            },
          ),
          findReconfirmedParticipants: mock(async () =>
            participants.filter((p) => p.confirmationState === "reconfirmed"),
          ),
          findConfirmedParticipants: mock(async () => participants),
          resetReconfirmedParticipants: mock(async () => {
            for (const p of participants) {
              p.confirmationState = "confirmed";
            }
          }),
          findTutorProfile: mock(async () =>
            // FLAT legacy price map: sizes 2 and 3 price identically.
            makeTutorProfile({ prices: { "2": 42, "3": 42 } }),
          ),
          updateBookingVersioned: mock(
            async (_tx: unknown, _id: string, ver: number, updates: any) => ({
              updated: { ...booking, ...updates, version: ver + 1 },
              newVersion: ver + 1,
            }),
          ),
        },
        pricing: { computeSplit: mock(realComputeSplit) },
      });

      // First accept: headcount dropped 3 → 2 while holdAmount still says 3,
      // so the F3 branch re-issues reconfirmation (and must sync holdAmount
      // to the actual participant-held total even though the price is equal).
      await service.reconfirm("student2", "b1", true);
      expect(repo.resetReconfirmedParticipants).toHaveBeenCalledTimes(1);

      // After the sync, further accepts must converge: each remaining
      // participant reconfirms against the size-2 snapshot and the booking
      // finalizes to AWAITING_TUTOR_REVIEW instead of looping.
      await service.reconfirm("student3", "b1", true);
      await service.reconfirm("student2", "b1", true);

      expect(repo.resetReconfirmedParticipants).toHaveBeenCalledTimes(1);
      expect(repo.updateBookingHoldAmount).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        84,
      );
      expect(repo.updateBookingVersioned).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        1,
        expect.objectContaining({ currentState: "awaiting_tutor_review" }),
      );
    });

    test("M5: decline that drops the group below minimum does not refresh the deadline", async () => {
      const booking = makeBooking({
        type: "group",
        currentState: "awaiting_reconfirmation",
        targetGroupSize: 3,
        priceSnapshot: {
          perStudent: 42,
          baseline: 42,
          tutorShare: 33.6,
          cogitoTake: 8.4,
        },
      });
      const participant = makeParticipant({
        confirmationState: "reconfirmed",
        heldAmount: 42,
      });
      const { service, repo } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findParticipant: mock(async () => participant),
          decrementBookingConfirmedHeadcount: mock(async () => {}),
          // Only one confirmed participant remains — the group expires.
          findConfirmedParticipants: mock(async () => [
            makeParticipant({ id: "p2", userId: "student2" }),
          ]),
        },
      });

      await service.reconfirm("student1", "b1", false);
      expect(repo.updateBookingDeadline).not.toHaveBeenCalled();
    });
  });

  describe("withdraw", () => {
    test("throws BookingParticipantNotFoundError when user is not a participant", async () => {
      const { service } = createService({
        repo: {
          findBookingById: mock(async () => makeBooking()),
          findParticipant: mock(async () => null),
        },
      });

      await expect(service.withdraw("student1", "b1")).rejects.toThrow(
        BookingParticipantNotFoundError,
      );
    });

    test("throws BookingCancelledError when booking is already terminal", async () => {
      const { service } = createService({
        repo: {
          findBookingById: mock(async () =>
            makeBooking({ currentState: "completed" }),
          ),
          findParticipant: mock(async () => makeParticipant()),
        },
      });

      await expect(service.withdraw("student1", "b1")).rejects.toThrow(
        BookingCancelledError,
      );
    });

    test("throws BookingSeriesNoOptOutError when withdrawing from a group series (U4)", async () => {
      const booking = makeBooking({
        type: "series",
        targetGroupSize: 3,
        currentState: "confirmed",
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      const participant = makeParticipant({ heldAmount: 42 });
      const { service, wallet, repo } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findParticipant: mock(async () => participant),
          findConfirmedParticipants: mock(async () => []),
        },
      });

      await expect(service.withdraw("student1", "b1")).rejects.toThrow(
        BookingSeriesNoOptOutError,
      );

      expect(wallet.release).not.toHaveBeenCalled();
      expect(wallet.deduct).not.toHaveBeenCalled();
      expect(repo.updateParticipantState).not.toHaveBeenCalled();
    });

    test("solo-series withdraw still works (targetGroupSize 1 is not a group series) (U4)", async () => {
      const booking = makeBooking({
        type: "series",
        targetGroupSize: 1,
        currentState: "confirmed",
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      const participant = makeParticipant({ heldAmount: 42 });
      const { service, wallet } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findParticipant: mock(async () => participant),
          findConfirmedParticipants: mock(async () => []),
        },
      });

      const result = await service.withdraw("student1", "b1");
      expect(result.withdrawn).toBe(true);
      expect(wallet.release).toHaveBeenCalledTimes(1);
    });

    test("B3: solo withdraw from AWAITING_TUTOR_REVIEW cancels + zeroes the hold (never regresses)", async () => {
      const booking = makeBooking({
        currentState: "awaiting_tutor_review",
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      const participant = makeParticipant({ heldAmount: 42 });
      const { service, repo } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findParticipant: mock(async () => participant),
          findConfirmedParticipants: mock(async () => []),
        },
      });

      const result = await service.withdraw("student1", "b1");

      expect(result.withdrawn).toBe(true);
      expect(repo.updateBookingHoldAmount).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        0,
      );
      expect(repo.updateBookingVersioned).toHaveBeenCalledTimes(1);
      const versionedCall = repo.updateBookingVersioned.mock
        .calls[0] as unknown[];
      expect(versionedCall[3]).toEqual(
        expect.objectContaining({ currentState: "cancelled" }),
      );
    });

    test("B3: solo-series withdraw from AWAITING_TUTOR_REVIEW cancels + zeroes the hold (never regresses)", async () => {
      const booking = makeBooking({
        type: "series",
        targetGroupSize: 1,
        currentState: "awaiting_tutor_review",
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      const participant = makeParticipant({ heldAmount: 42 });
      const { service, repo } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findParticipant: mock(async () => participant),
          findConfirmedParticipants: mock(async () => []),
        },
      });

      const result = await service.withdraw("student1", "b1");

      expect(result.withdrawn).toBe(true);
      expect(repo.updateBookingHoldAmount).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        0,
      );
      const versionedCall = repo.updateBookingVersioned.mock
        .calls[0] as unknown[];
      expect(versionedCall[3]).toEqual(
        expect.objectContaining({ currentState: "cancelled" }),
      );
    });

    test("B7: withdrawing a pending (non-confirmed) participant does not decrement confirmedHeadcount", async () => {
      const booking = makeBooking({
        type: "group",
        targetGroupSize: 4,
        minConfirmedHeadcount: 2,
        confirmedHeadcount: 2,
        currentState: "awaiting_participant_confirmation",
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      const participant = makeParticipant({
        confirmationState: "pending",
        heldAmount: 42,
      });
      const { service, repo } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findParticipant: mock(async () => participant),
          // The two confirmed participants remain after the pending invitee
          // withdraws — the group survives and reprices.
          findConfirmedParticipants: mock(async () => [
            makeParticipant({ id: "p2", userId: "student2", heldAmount: 42 }),
            makeParticipant({ id: "p3", userId: "student3", heldAmount: 42 }),
          ]),
        },
      });

      await service.withdraw("student1", "b1");

      expect(repo.decrementBookingConfirmedHeadcount).not.toHaveBeenCalled();
      expect(repo.updateParticipantState).toHaveBeenCalledTimes(1);
    });

    test("B7: double-withdraw is a no-op (no second headcount decrement)", async () => {
      const booking = makeBooking({
        currentState: "confirmed",
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      const participant = makeParticipant({
        confirmationState: "withdrawn_pre_h2",
        heldAmount: 0,
      });
      const { service, repo, wallet } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findParticipant: mock(async () => participant),
          findConfirmedParticipants: mock(async () => []),
        },
      });

      const result = await service.withdraw("student1", "b1");

      expect(result.withdrawn).toBe(false);
      expect(repo.decrementBookingConfirmedHeadcount).not.toHaveBeenCalled();
      expect(repo.updateParticipantState).not.toHaveBeenCalled();
      expect(repo.updateBookingVersioned).not.toHaveBeenCalled();
      expect(wallet.release).not.toHaveBeenCalled();
      expect(wallet.deduct).not.toHaveBeenCalled();
    });

    test("B7+: confirmed participant leaving a partial group (remaining < minimum) expires the booking when CANCELLED is not reachable", async () => {
      const booking = makeBooking({
        type: "group",
        targetGroupSize: 4,
        minConfirmedHeadcount: 2,
        confirmedHeadcount: 2,
        currentState: "awaiting_participant_confirmation",
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      const participant = makeParticipant({ heldAmount: 42 });
      const { service, repo } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findParticipant: mock(async () => participant),
          // Only one confirmed participant remains — below the minimum.
          findConfirmedParticipants: mock(async () => [
            makeParticipant({ id: "p2", userId: "student2", heldAmount: 42 }),
          ]),
        },
      });

      await service.withdraw("student1", "b1");

      expect(repo.decrementBookingConfirmedHeadcount).toHaveBeenCalledTimes(1);
      expect(repo.updateBookingHoldAmount).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        0,
      );
      const versionedCall = repo.updateBookingVersioned.mock
        .calls[0] as unknown[];
      expect(versionedCall[3]).toEqual(
        expect.objectContaining({ currentState: "expired" }),
      );
    });

    test("withdraws and releases held marks for participant", async () => {
      const booking = makeBooking({
        currentState: "awaiting_tutor_review",
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

    test("withdraws after H-2 and deducts held marks (late withdrawal penalty)", async () => {
      const booking = makeBooking({
        currentState: "awaiting_participant_confirmation",
        scheduledStartAt: new Date(Date.now() + 1 * 60 * 60 * 1000),
      });
      const participant = makeParticipant({ heldAmount: 42 });
      const { service, wallet, repo } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findParticipant: mock(async () => participant),
          findConfirmedParticipants: mock(async () => []),
          updateBookingVersioned: mock(async () => ({
            updated: { ...booking, currentState: "awaiting_reconfirmation" },
            newVersion: 2,
          })),
        },
      });

      const result = await service.withdraw(
        "student1",
        "b1",
        "late withdrawal",
      );
      expect(result).toEqual({ withdrawn: true, late: true });

      expect(wallet.release).not.toHaveBeenCalled();
      expect(wallet.deduct).toHaveBeenCalledTimes(1);
      expect(wallet.deduct.mock.calls[0][1].eventKey).toBe(
        "booking.b1.withdraw-late.student1",
      );
      expect(wallet.deduct.mock.calls[0][1].reason).toBe(
        "Late withdrawal penalty",
      );
      expect(repo.updateParticipantState).toHaveBeenCalledWith(
        expect.anything(),
        "p1",
        expect.objectContaining({
          confirmationState: "withdrawn_post_h2",
          heldAmount: 0,
        }),
      );
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
        currentState: "awaiting_tutor_review",
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

    test("confirmed group withdraw reprices + reconfirms instead of cancelling (C1)", async () => {
      const booking = makeBooking({
        type: "group",
        currentState: "confirmed",
        targetGroupSize: 3,
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        priceSnapshot: {
          perStudent: 42,
          baseline: 42,
          tutorShare: 33.6,
          cogitoTake: 8.4,
          baselineCogitoTake: 12,
          baselineTutorShare: 30,
          extraTotal: 0,
          cogitoExtraTake: 0,
          tutorExtraShare: 0,
        },
      });
      const participant = makeParticipant({ heldAmount: 42 });
      const { service, wallet, repo, meeting } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findParticipant: mock(async () => participant),
          findConfirmedParticipants: mock(async () => [
            makeParticipant({ id: "p2", userId: "student2", heldAmount: 42 }),
            makeParticipant({ id: "p3", userId: "student3", heldAmount: 42 }),
          ]),
          findTutorProfile: mock(async () => makeTutorProfile()),
          updateBookingVersioned: mock(async () => ({
            updated: { ...booking, currentState: "awaiting_reconfirmation" },
            newVersion: 2,
          })),
        },
        wallet: {
          ...makeWallet(),
          getByUserId: mock(async () => ({
            id: "w1",
            totalBalance: 100,
            heldBalance: 42,
            availableBalance: 58,
          })),
        },
      });

      await service.withdraw("student1", "b1");

      expect(wallet.release).toHaveBeenCalledTimes(1);
      expect(repo.updateBookingVersioned).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        1,
        expect.objectContaining({ currentState: "awaiting_reconfirmation" }),
      );
      expect(meeting.cancelEvent).toHaveBeenCalledWith("b1");
    });

    test("M7: group withdraw from AWAITING_ADMIN_ROOM_APPROVAL cancels the requested roomBooking and refreshes the reconfirmation deadline", async () => {
      const booking = makeBooking({
        type: "group",
        currentState: "awaiting_admin_room_approval",
        targetGroupSize: 3,
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        priceSnapshot: {
          perStudent: 42,
          baseline: 42,
          tutorShare: 33.6,
          cogitoTake: 8.4,
          baselineCogitoTake: 12,
          baselineTutorShare: 30,
          extraTotal: 0,
          cogitoExtraTake: 0,
          tutorExtraShare: 0,
        },
      });
      const participant = makeParticipant({ heldAmount: 42 });
      const { service, repo, roomPort } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findParticipant: mock(async () => participant),
          findConfirmedParticipants: mock(async () => [
            makeParticipant({ id: "p2", userId: "student2", heldAmount: 42 }),
            makeParticipant({ id: "p3", userId: "student3", heldAmount: 42 }),
          ]),
          findTutorProfile: mock(async () => makeTutorProfile()),
          updateBookingVersioned: mock(async () => ({
            updated: { ...booking, currentState: "awaiting_reconfirmation" },
            newVersion: 2,
          })),
        },
        wallet: {
          ...makeWallet(),
          getByUserId: mock(async () => ({
            id: "w1",
            totalBalance: 100,
            heldBalance: 42,
            availableBalance: 58,
          })),
        },
      });

      await service.withdraw("student1", "b1");

      // The pending room request must not survive for an admin to assign
      // mid-reconfirmation (the booking regressed to tutor review).
      expect(roomPort.cancelRequestedRoomForBooking).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
      );
      // The new 12h reconfirmation window starts now.
      expect(repo.updateBookingDeadline).toHaveBeenCalledTimes(1);
      const deadlineArg = repo.updateBookingDeadline.mock.calls[0][2] as Date;
      const diff = deadlineArg.getTime() - Date.now();
      expect(diff).toBeGreaterThanOrEqual(RESPONSE_WINDOW_MS - 1000);
      expect(diff).toBeLessThanOrEqual(RESPONSE_WINDOW_MS + 1000);
    });

    test("M7: solo withdraw from AWAITING_ADMIN_ROOM_APPROVAL cancels the requested roomBooking", async () => {
      const booking = makeBooking({
        type: "solo",
        currentState: "awaiting_admin_room_approval",
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      const participant = makeParticipant({ heldAmount: 42 });
      const { service, roomPort } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findParticipant: mock(async () => participant),
          findConfirmedParticipants: mock(async () => []),
          updateBookingVersioned: mock(async () => ({
            updated: { ...booking, currentState: "cancelled" },
            newVersion: 2,
          })),
        },
      });

      await service.withdraw("student1", "b1");

      expect(roomPort.cancelRequestedRoomForBooking).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
      );
    });

    test("M8: pre-H2 withdraw reprice InsufficientMarksError falls through to the expiry branch (release all + EXPIRED)", async () => {
      const booking = makeBooking({
        type: "group",
        currentState: "confirmed",
        targetGroupSize: 3,
        confirmedHeadcount: 3,
        holdAmount: 126,
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        priceSnapshot: {
          perStudent: 42,
          baseline: 126,
          tutorShare: 100.8,
          cogitoTake: 25.2,
          baselineCogitoTake: 16,
          baselineTutorShare: 54,
          extraTotal: 0,
          cogitoExtraTake: 0,
          tutorExtraShare: 0,
        },
      });
      const participant = makeParticipant({ heldAmount: 42 });
      const { service, repo } = createService({
        repo: {
          findBookingById: mock(async () => {
            const calls = repo.findBookingById.mock.calls.length;
            // Calls 1-2: load + regression-transition read (still confirmed).
            // Call 3+: the expiry-fallback transition read sees the
            // post-regression state so confirmed → ... → expired is valid.
            return calls <= 2
              ? { ...booking, currentState: "confirmed", version: 1 }
              : {
                  ...booking,
                  currentState: "awaiting_reconfirmation",
                  version: 2,
                };
          }),
          findParticipant: mock(async () => participant),
          findConfirmedParticipants: mock(async () => [
            makeParticipant({ id: "p2", userId: "student2", heldAmount: 42 }),
            makeParticipant({ id: "p3", userId: "student3", heldAmount: 42 }),
          ]),
          findTutorProfile: mock(async () =>
            makeTutorProfile({ prices: { "2": 60 } }),
          ),
          updateBookingVersioned: mock(async () => ({
            updated: { ...booking, currentState: "expired" },
            newVersion: 2,
          })),
        },
        wallet: {
          ...makeWallet(),
          getByUserId: mock(async () => ({
            id: "w1",
            totalBalance: 84,
            heldBalance: 42,
            availableBalance: 42,
          })),
          // The repricing hold of the increased per-student price cannot be
          // funded (60 > 42 available) → InsufficientMarksError.
          hold: mock(async () => {
            throw new InsufficientMarksError(60, 84);
          }),
        },
        pricing: { computeSplit: mock(realComputeSplit) },
      });

      const result = await service.withdraw("student1", "b1");

      // PRD TC-19: the group falls through to expiry on an unfunded reprice —
      // the withdrawer still leaves, remaining holds are released, and the
      // booking expires (never wedged, never rolled back). The regression to
      // AWAITING_RECONFIRMATION happens first; the expiry fallback is the
      // final transition.
      expect(result.withdrawn).toBe(true);
      expect(repo.updateBookingVersioned).toHaveBeenCalledTimes(2);
      const lastCall = repo.updateBookingVersioned.mock.calls[1] as unknown[];
      expect(lastCall[3]).toEqual(
        expect.objectContaining({ currentState: "expired" }),
      );
      expect(repo.updateBookingHoldAmount).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        0,
      );
    });

    test("group withdraw in a non-regressable state does not cancel (C1)", async () => {
      const booking = makeBooking({
        type: "group",
        currentState: "reschedule_proposed",
        targetGroupSize: 3,
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      const participant = makeParticipant({ heldAmount: 42 });
      const { service, wallet, repo } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findParticipant: mock(async () => participant),
          findConfirmedParticipants: mock(async () => [
            makeParticipant({ id: "p2", userId: "student2", heldAmount: 42 }),
            makeParticipant({ id: "p3", userId: "student3", heldAmount: 42 }),
          ]),
          updateBookingVersioned: mock(async () => ({
            updated: booking,
            newVersion: 2,
          })),
        },
        wallet: {
          ...makeWallet(),
          getByUserId: mock(async () => ({
            id: "w1",
            totalBalance: 100,
            heldBalance: 42,
            availableBalance: 58,
          })),
        },
      });

      await service.withdraw("student1", "b1");

      expect(wallet.release).toHaveBeenCalledTimes(1);
      expect(repo.updateBookingVersioned).not.toHaveBeenCalled();
    });

    test("solo withdraw from a confirmed booking transitions to cancelled, zeroes hold, cancels the meeting (R2)", async () => {
      const booking = makeBooking({
        type: "solo",
        currentState: "confirmed",
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      const participant = makeParticipant({ heldAmount: 42 });
      const { service, repo, meeting } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findParticipant: mock(async () => participant),
          findConfirmedParticipants: mock(async () => []),
          updateBookingVersioned: mock(async () => ({
            updated: { ...booking, currentState: "cancelled" },
            newVersion: 2,
          })),
        },
      });

      await service.withdraw("student1", "b1");

      expect(repo.updateBookingVersioned).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        1,
        expect.objectContaining({ currentState: "cancelled" }),
      );
      expect(repo.updateBookingHoldAmount).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        0,
      );
      expect(meeting.cancelEvent).toHaveBeenCalledWith("b1");
    });

    test("solo withdraw from a scheduled booking cancels and zeroes hold (R2)", async () => {
      const booking = makeBooking({
        type: "solo",
        currentState: "scheduled",
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      const participant = makeParticipant({ heldAmount: 42 });
      const { service, repo } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findParticipant: mock(async () => participant),
          findConfirmedParticipants: mock(async () => []),
          updateBookingVersioned: mock(async () => ({
            updated: { ...booking, currentState: "cancelled" },
            newVersion: 2,
          })),
        },
      });

      await service.withdraw("student1", "b1");

      expect(repo.updateBookingVersioned).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        1,
        expect.objectContaining({ currentState: "cancelled" }),
      );
      expect(repo.updateBookingHoldAmount).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        0,
      );
    });

    test("rejects participant withdrawal once the booking has started", async () => {
      const { service, wallet, repo } = createService({
        repo: {
          findBookingById: mock(async () =>
            makeBooking({
              currentState: "scheduled",
              scheduledStartAt: new Date(Date.now() - 1_000),
            }),
          ),
          findParticipant: mock(async () => makeParticipant()),
        },
      });

      await expect(service.withdraw("student1", "b1")).rejects.toThrow(
        BookingCancellationDeadlinePassedError,
      );
      expect(wallet.deduct).not.toHaveBeenCalled();
      expect(wallet.release).not.toHaveBeenCalled();
      expect(repo.updateBookingVersioned).not.toHaveBeenCalled();
    });

    test("meeting cancellation happens after the transaction commits, not inside it (R3)", async () => {
      const booking = makeBooking({
        type: "group",
        currentState: "confirmed",
        targetGroupSize: 3,
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        priceSnapshot: {
          perStudent: 42,
          baseline: 42,
          tutorShare: 33.6,
          cogitoTake: 8.4,
          baselineCogitoTake: 12,
          baselineTutorShare: 30,
          extraTotal: 0,
          cogitoExtraTake: 0,
          tutorExtraShare: 0,
        },
      });
      const participant = makeParticipant({ heldAmount: 42 });
      const order: string[] = [];
      const { service, db, meeting } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findParticipant: mock(async () => participant),
          findConfirmedParticipants: mock(async () => [
            makeParticipant({ id: "p2", userId: "student2", heldAmount: 42 }),
            makeParticipant({ id: "p3", userId: "student3", heldAmount: 42 }),
          ]),
          findTutorProfile: mock(async () => makeTutorProfile()),
          updateBookingVersioned: mock(async () => ({
            updated: { ...booking, currentState: "awaiting_reconfirmation" },
            newVersion: 2,
          })),
        },
        wallet: {
          ...makeWallet(),
          getByUserId: mock(async () => ({
            id: "w1",
            totalBalance: 100,
            heldBalance: 42,
            availableBalance: 58,
          })),
        },
        meeting: {
          ...makeMeeting(),
          cancelEvent: mock(async () => {
            order.push("cancel");
          }),
        },
      });

      const origTransaction = db.transaction;
      db.transaction = mock(async (fn: any) => {
        order.push("tx-start");
        const result = await origTransaction(fn);
        order.push("tx-end");
        return result;
      });

      await service.withdraw("student1", "b1");

      expect(meeting.cancelEvent).toHaveBeenCalledTimes(1);
      expect(order[order.length - 1]).toBe("cancel");
      expect(order[order.length - 2]).toBe("tx-end");
    });
  });

  describe("proposeReschedule", () => {
    test("throws BookingNotFoundError when booking does not exist", async () => {
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
      ).rejects.toThrow(BookingNotFoundError);
    });

    test("proposes reschedule successfully (tutor-only)", async () => {
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
        "tutor1",
        "b1",
        start,
        end,
        "schedule conflict",
      );

      expect(repo.insertRescheduleProposal).toHaveBeenCalledTimes(1);
      expect(notification.write).toHaveBeenCalledTimes(1);
      expect(notification.write.mock.calls[0][0]).toMatchObject({
        userId: "student1",
        title: "Reschedule proposed",
        body: "A new time was proposed for the booking.",
      });
    });

    test("allows the booking proposer to propose inside tutor availability", async () => {
      const booking = makeBooking({
        currentState: "awaiting_tutor_review",
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      const { service, repo } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findParticipant: mock(async () => makeParticipant()),
          findAvailabilityWindowContaining: mock(async () => makeSlot()),
        },
      });

      const start = new Date(Date.now() + 72 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 90 * 60 * 1000);

      await service.proposeReschedule("student1", "b1", start, end);
      expect(repo.insertRescheduleProposal).toHaveBeenCalledTimes(1);
    });

    test("rejects a proposed time matching the current schedule", async () => {
      const scheduledStartAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
      scheduledStartAt.setSeconds(0, 0);
      const booking = makeBooking({ scheduledStartAt });
      const { service, repo } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findParticipant: mock(async () => makeParticipant()),
        },
      });

      await expect(
        service.proposeReschedule(
          "tutor1",
          "b1",
          new Date(scheduledStartAt),
          new Date(scheduledStartAt.getTime() + 90 * 60 * 1000),
        ),
      ).rejects.toThrow(
        "Proposed time must be different from the current schedule",
      );
      expect(repo.insertRescheduleProposal).not.toHaveBeenCalled();
    });

    test("rejects a series proposal matching the target session schedule", async () => {
      const scheduledStartAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
      scheduledStartAt.setSeconds(0, 0);
      const { service, repo } = createService({
        repo: {
          findBookingById: mock(async () =>
            makeBooking({ type: "series", scheduledStartAt: new Date(0) }),
          ),
          findSessionById: mock(async () => ({
            id: "s2",
            seriesBookingId: "b1",
            scheduledStartAt,
            scheduledEndAt: new Date(
              scheduledStartAt.getTime() + 90 * 60 * 1000,
            ),
            currentState: "scheduled",
          })),
        },
      });

      await expect(
        service.proposeReschedule(
          "tutor1",
          "b1",
          scheduledStartAt,
          new Date(scheduledStartAt.getTime() + 90 * 60 * 1000),
          undefined,
          undefined,
          "s2",
        ),
      ).rejects.toThrow(
        "Proposed time must be different from the current schedule",
      );
      expect(repo.insertRescheduleProposal).not.toHaveBeenCalled();
    });

    test("rejects a proposal matching the pending proposal", async () => {
      const proposedStartAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
      proposedStartAt.setSeconds(0, 0);
      const { service, repo } = createService({
        repo: {
          findBookingById: mock(async () =>
            makeBooking({ currentState: "reschedule_proposed" }),
          ),
          findPendingRescheduleProposal: mock(async () => ({
            id: "pending-proposal",
            sessionId: null,
            proposedStartAt,
          })),
        },
      });

      await expect(
        service.proposeReschedule(
          "tutor1",
          "b1",
          proposedStartAt,
          new Date(proposedStartAt.getTime() + 90 * 60 * 1000),
        ),
      ).rejects.toThrow(
        "Proposed time must be different from the pending proposal",
      );
      expect(repo.updateRescheduleProposal).not.toHaveBeenCalled();
      expect(repo.insertRescheduleProposal).not.toHaveBeenCalled();
    });
  });

  describe("listSessions", () => {
    test("throws BookingNotFoundError when booking does not exist", async () => {
      const { service } = createService({
        repo: { findBookingById: mock(async () => null) },
      });

      await expect(
        service.listSessions("nonexistent", "user1"),
      ).rejects.toThrow(BookingNotFoundError);
    });

    test("throws BookingNotEditableError when booking is not a series", async () => {
      const { service } = createService({
        repo: {
          findBookingById: mock(async () => makeBooking({ type: "solo" })),
        },
      });

      await expect(service.listSessions("b1", "student1")).rejects.toThrow(
        BookingNotEditableError,
      );
    });

    test("returns sessions for a series booking when user is proposer", async () => {
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

      const result = await service.listSessions("b1", "student1");
      expect(result).toEqual(sessions);
    });

    test("throws BookingNotOwnedError when user has no access", async () => {
      const { service } = createService({
        repo: {
          findBookingById: mock(async () => ({
            id: "b1",
            proposerId: "other",
            tutorId: "other_tutor",
          })),
          findParticipant: mock(async () => null),
        },
      });

      await expect(service.listSessions("b1", "userB")).rejects.toThrow(
        BookingNotOwnedError,
      );
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
          findConfirmedParticipants: mock(async () => [
            makeParticipant({ heldAmount: 42 }),
          ]),
          updateBookingVersioned: mock(async () => ({
            updated: { ...expiringBooking, currentState: "expired" },
            newVersion: 2,
          })),
        },
      });

      const result = await service.expireBookings();

      expect(result).toEqual({ expired: 1, failed: 0 });
      expect(wallet.release).toHaveBeenCalledTimes(1);
      expect(wallet.release.mock.calls[0][1]).toMatchObject({
        amount: 42,
        actorType: "system",
        reason: "Booking expired",
      });
    });

    test("OQ-05: expireBookings cancels the provider-side meeting event (best-effort)", async () => {
      const expiringBooking = makeBooking({
        currentState: "awaiting_tutor_review",
        holdAmount: 42,
        proposerId: "student1",
      });

      const { service, meeting } = createService({
        repo: {
          findBookingsExpiringByDeadline: mock(async () => [expiringBooking]),
          findBookingById: mock(async () => ({
            ...expiringBooking,
            currentState: "awaiting_tutor_review",
            version: 1,
          })),
          findConfirmedParticipants: mock(async () => [
            makeParticipant({ heldAmount: 42 }),
          ]),
          updateBookingVersioned: mock(async () => ({
            updated: { ...expiringBooking, currentState: "expired" },
            newVersion: 2,
          })),
        },
      });

      const result = await service.expireBookings();

      expect(result).toEqual({ expired: 1, failed: 0 });
      expect(meeting.cancelEvent).toHaveBeenCalledWith("b1");
    });

    test("writes expiry notifications to proposer and tutor", async () => {
      const expiringBooking = makeBooking({
        currentState: "awaiting_tutor_review",
        holdAmount: 42,
        proposerId: "student1",
        tutorId: "tutor1",
      });

      const { service, notification } = createService({
        repo: {
          findBookingsExpiringByDeadline: mock(async () => [expiringBooking]),
          findBookingById: mock(async () => ({
            ...expiringBooking,
            currentState: "awaiting_tutor_review",
            version: 1,
          })),
          findConfirmedParticipants: mock(async () => [
            makeParticipant({ heldAmount: 42 }),
          ]),
          updateBookingVersioned: mock(async () => ({
            updated: { ...expiringBooking, currentState: "expired" },
            newVersion: 2,
          })),
        },
      });

      await service.expireBookings();

      expect(notification.writeBestEffort).toHaveBeenCalledTimes(2);
      const studentNotif = notification.writeBestEffort.mock.calls.find(
        (c: any) => c[0].userId === "student1",
      );
      const tutorNotif = notification.writeBestEffort.mock.calls.find(
        (c: any) => c[0].userId === "tutor1",
      );
      expect(studentNotif).toBeDefined();
      expect(studentNotif[0]).toMatchObject({
        bookingId: "b1",
        eventKey: "booking.b1.expired.student",
        title: "Booking expired",
      });
      expect(tutorNotif).toBeDefined();
      expect(tutorNotif[0].eventKey).toBe("booking.b1.expired.tutor");
    });

    test("uses no-show notification title for scheduled expiry", async () => {
      const expiringBooking = makeBooking({
        currentState: "scheduled",
        holdAmount: 42,
        proposerId: "student1",
        tutorId: "tutor1",
      });

      const { service, notification } = createService({
        repo: {
          findBookingsExpiringByDeadline: mock(async () => [expiringBooking]),
          findBookingById: mock(async () => ({
            ...expiringBooking,
            currentState: "scheduled",
            version: 1,
          })),
          findConfirmedParticipants: mock(async () => [
            makeParticipant({ heldAmount: 42 }),
          ]),
          updateBookingVersioned: mock(async () => ({
            updated: { ...expiringBooking, currentState: "no_show" },
            newVersion: 2,
          })),
        },
      });

      await service.expireBookings();

      const studentNotif = notification.writeBestEffort.mock.calls.find(
        (c: any) => c[0].userId === "student1",
      );
      const tutorNotif = notification.writeBestEffort.mock.calls.find(
        (c: any) => c[0].userId === "tutor1",
      );
      expect(studentNotif[0].title).toBe("Session marked as no-show");
      expect(studentNotif[0].body).toBe(
        "The session was marked as a no-show and held marks were forfeited.",
      );
      expect(tutorNotif[0].title).toBe("Session marked as no-show");
      expect(tutorNotif[0].body).toBe(
        "The session was marked as a no-show and held marks were forfeited.",
      );
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
          findConfirmedParticipants: mock(async () => []),
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
      expect(result).toEqual({ expired: 0, failed: 0 });
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
          findConfirmedParticipants: mock(async () => [
            makeParticipant({ heldAmount: 30 }),
          ]),
          updateBookingVersioned: mock(async () => ({
            updated: { ...b2, currentState: "expired" },
            newVersion: 2,
          })),
        },
      });

      const result = await service.expireBookings();
      expect(result).toEqual({ expired: 1, failed: 1 });
    });
  });

  describe("transition", () => {
    test("throws BookingNotFoundError when booking does not exist", async () => {
      const { service } = createService({
        repo: { findBookingById: mock(async () => null) },
      });

      await expect(
        service.transition(makeDb(), "nonexistent", "confirmed", {
          actorId: "tutor1",
          actorType: "tutor",
        }),
      ).rejects.toThrow(BookingNotFoundError);
    });

    test("throws BookingStateTransitionError when transition is invalid", async () => {
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
      ).rejects.toThrow(BookingStateTransitionError);
    });

    test("throws BookingStateTransitionError when versioned update fails", async () => {
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
      ).rejects.toThrow(BookingStateTransitionError);
    });
  });

  describe("checkTutorLateness", () => {
    test("flags scheduled booking with unknown tutor attendance instead of auto-cancelling", async () => {
      const candidate = makeBooking({
        currentState: "scheduled",
        holdAmount: 42,
        proposerId: "student1",
        tutorId: "tutor1",
        scheduledStartAt: new Date(Date.now() - 20 * 60 * 1000),
      });
      const { service, repo, notification, wallet, audit } = createService({
        repo: {
          findBookingsWithTutorLateness: mock(async () => [candidate]),
          updateBookingVersioned: mock(async () => ({
            updated: { ...candidate },
            newVersion: 2,
          })),
        },
      });

      const result = await service.checkTutorLateness();

      expect(result).toEqual({ flagged: 1, failed: 0 });
      expect(repo.updateBookingVersioned).toHaveBeenCalledTimes(1);
      const [, bookingId, expectedVersion, updates] =
        repo.updateBookingVersioned.mock.calls[0]!;
      expect(bookingId).toBe("b1");
      expect(expectedVersion).toBe(1);
      expect(updates).toMatchObject({
        overrideMeta: {
          category: "tutor_lateness_pending",
        },
      });
      expect(updates!.overrideMeta!.flaggedAt).toEqual(expect.any(String));
      expect(repo.insertParticipant).not.toHaveBeenCalled();
      expect(repo.updateParticipantState).not.toHaveBeenCalled();
      expect(repo.updateBookingHoldAmount).not.toHaveBeenCalled();
      expect(wallet.release).not.toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledTimes(1);
      const auditArg = audit.record.mock.calls[0]![0];
      expect(auditArg).toMatchObject({
        actorId: null,
        actorType: "system",
        action: "tutor_lateness_pending_review",
        targetId: "b1",
        targetType: "booking",
      });
      expect(notification.writeBestEffort).toHaveBeenCalledTimes(2);
    });

    test("skips booking when the versioned update races", async () => {
      const candidate = makeBooking({
        currentState: "scheduled",
        holdAmount: 42,
        proposerId: "student1",
        tutorId: "tutor1",
        scheduledStartAt: new Date(Date.now() - 20 * 60 * 1000),
      });
      const { service, notification, audit } = createService({
        repo: {
          findBookingsWithTutorLateness: mock(async () => [candidate]),
          updateBookingVersioned: mock(async () => null),
        },
      });

      const result = await service.checkTutorLateness();

      expect(result).toEqual({ flagged: 0, failed: 0 });
      expect(audit.record).not.toHaveBeenCalled();
      expect(notification.writeBestEffort).not.toHaveBeenCalled();
    });

    test("returns zero when no candidates", async () => {
      const { service } = createService();

      const result = await service.checkTutorLateness();
      expect(result).toEqual({ flagged: 0, failed: 0 });
    });

    test("continues processing when individual booking fails", async () => {
      const b1 = makeBooking({
        id: "b1",
        currentState: "scheduled",
        holdAmount: 42,
        proposerId: "student1",
        tutorId: "tutor1",
        scheduledStartAt: new Date(Date.now() - 20 * 60 * 1000),
      });
      const b2 = makeBooking({
        id: "b2",
        currentState: "scheduled",
        holdAmount: 30,
        proposerId: "student2",
        tutorId: "tutor2",
        scheduledStartAt: new Date(Date.now() - 20 * 60 * 1000),
      });

      const { service } = createService({
        repo: {
          findBookingsWithTutorLateness: mock(async () => [b1, b2]),
          updateBookingVersioned: mock(async () => {
            throw new Error("DB error");
          }),
        },
      });

      const result = await service.checkTutorLateness();
      expect(result).toEqual({ flagged: 0, failed: 2 });
    });
  });

  describe("markTutorAttendance", () => {
    const withinWindowStart = () => new Date(Date.now() - 5 * 60 * 1000);

    test("throws BookingNotOwnedError when caller is not the booking tutor", async () => {
      const booking = makeBooking({
        currentState: "scheduled",
        scheduledStartAt: withinWindowStart(),
      });
      const { service } = createService({
        repo: { findBookingById: mock(async () => booking) },
      });

      await expect(
        service.markTutorAttendance("b1", "other-tutor", "present"),
      ).rejects.toThrow(BookingNotOwnedError);
    });

    test("throws BookingStateTransitionError when booking is not scheduled", async () => {
      const booking = makeBooking({
        currentState: "confirmed",
        scheduledStartAt: withinWindowStart(),
      });
      const { service } = createService({
        repo: { findBookingById: mock(async () => booking) },
      });

      await expect(
        service.markTutorAttendance("b1", "tutor1", "present"),
      ).rejects.toThrow(BookingStateTransitionError);
    });

    test("throws BookingNotEditableError when marking before the window", async () => {
      const booking = makeBooking({
        currentState: "scheduled",
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      const { service } = createService({
        repo: { findBookingById: mock(async () => booking) },
      });

      await expect(
        service.markTutorAttendance("b1", "tutor1", "present"),
      ).rejects.toThrow(BookingNotEditableError);
    });

    test("throws BookingNotEditableError when marking after the window", async () => {
      const booking = makeBooking({
        currentState: "scheduled",
        scheduledStartAt: new Date(Date.now() - 30 * 60 * 1000),
      });
      const { service } = createService({
        repo: { findBookingById: mock(async () => booking) },
      });

      await expect(
        service.markTutorAttendance("b1", "tutor1", "present"),
      ).rejects.toThrow(BookingNotEditableError);
    });

    test("upserts a tutor participant with present attendance when no row exists", async () => {
      const booking = makeBooking({
        currentState: "scheduled",
        scheduledStartAt: withinWindowStart(),
      });
      const { service, repo } = createService({
        repo: {
          findBookingById: mock(async () => booking),
          findTutorParticipant: mock(async () => null),
        },
      });

      const result = await service.markTutorAttendance(
        "b1",
        "tutor1",
        "present",
      );

      expect(repo.insertParticipant).toHaveBeenCalledTimes(1);
      expect(repo.insertParticipant.mock.calls[0][1]).toMatchObject({
        bookingId: "b1",
        userId: "tutor1",
        role: "tutor",
        confirmationState: "confirmed",
        heldAmount: 0,
        attendanceState: "present",
      });
      expect(repo.updateParticipantState).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        bookingId: "b1",
        attendanceState: "present",
      });
    });

    test("updates an existing tutor participant attendance to late", async () => {
      const booking = makeBooking({
        currentState: "scheduled",
        scheduledStartAt: withinWindowStart(),
      });
      const existing = makeParticipant({
        id: "tp1",
        userId: "tutor1",
        role: "tutor",
        attendanceState: "unknown",
      });
      const { service, repo } = createService({
        repo: {
          findBookingById: mock(async () => booking),
          findTutorParticipant: mock(async () => existing),
        },
      });

      await service.markTutorAttendance("b1", "tutor1", "late");

      expect(repo.updateParticipantState).toHaveBeenCalledWith(
        expect.anything(),
        "tp1",
        expect.objectContaining({ attendanceState: "late" }),
      );
      expect(repo.insertParticipant).not.toHaveBeenCalled();
    });

    test("throws BookingNotFoundError when booking does not exist", async () => {
      const { service } = createService();

      await expect(
        service.markTutorAttendance("missing", "tutor1", "present"),
      ).rejects.toThrow(BookingNotFoundError);
    });
  });

  describe("Story 1: Group Booking Hold Leaks", () => {
    test("cancel group releases all participants", async () => {
      const booking = makeBooking({
        type: "group",
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      const p1 = makeParticipant({
        id: "p1",
        userId: "student1",
        heldAmount: 42,
      });
      const p2 = makeParticipant({
        id: "p2",
        userId: "student2",
        heldAmount: 42,
      });
      const p3 = makeParticipant({
        id: "p3",
        userId: "student3",
        heldAmount: 42,
      });

      const { service, wallet, repo } = createService({
        repo: {
          findBookingById: mock(async () => booking),
          findParticipant: mock(async () => p1),
          findConfirmedParticipants: mock(async () => [p1, p2, p3]),
          updateBookingVersioned: mock(async () => ({
            updated: { ...booking, currentState: "cancelled" },
            newVersion: 2,
          })),
        },
      });

      await service.cancel("student1", "b1");

      expect(wallet.release).toHaveBeenCalledTimes(3);
      expect(repo.updateParticipantState).toHaveBeenCalledTimes(3);
      expect(repo.updateBookingHoldAmount).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        0,
      );
    });

    test("tutorDecline group releases all participants", async () => {
      const booking = makeBooking({ holdAmount: 42 });
      const p1 = makeParticipant({
        id: "p1",
        userId: "student1",
        heldAmount: 42,
      });
      const p2 = makeParticipant({
        id: "p2",
        userId: "student2",
        heldAmount: 42,
      });
      const p3 = makeParticipant({
        id: "p3",
        userId: "student3",
        heldAmount: 42,
      });

      const { service, wallet, repo } = createService({
        repo: {
          findBookingById: mock(async () => booking),
          findConfirmedParticipants: mock(async () => [p1, p2, p3]),
          updateBookingVersioned: mock(async () => ({
            updated: { ...booking, currentState: "declined" },
            newVersion: 2,
          })),
        },
      });

      await service.tutorDecline("b1", "tutor1");

      expect(wallet.release).toHaveBeenCalledTimes(3);
      expect(repo.updateParticipantState).toHaveBeenCalledTimes(3);
      expect(repo.updateBookingHoldAmount).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        0,
      );
    });

    test("expireBookings releases all participants", async () => {
      const expiringBooking = makeBooking({
        currentState: "awaiting_tutor_review",
        holdAmount: 42,
        proposerId: "student1",
      });
      const p1 = makeParticipant({
        id: "p1",
        userId: "student1",
        heldAmount: 42,
      });
      const p2 = makeParticipant({
        id: "p2",
        userId: "student2",
        heldAmount: 42,
      });

      const { service, wallet, repo } = createService({
        repo: {
          findBookingsExpiringByDeadline: mock(async () => [expiringBooking]),
          findBookingById: mock(async () => ({
            ...expiringBooking,
            currentState: "awaiting_tutor_review",
            version: 1,
          })),
          findConfirmedParticipants: mock(async () => [p1, p2]),
          updateBookingVersioned: mock(async () => ({
            updated: { ...expiringBooking, currentState: "expired" },
            newVersion: 2,
          })),
        },
      });

      await service.expireBookings();

      expect(wallet.release).toHaveBeenCalledTimes(2);
      expect(repo.updateParticipantState).toHaveBeenCalledTimes(2);
      expect(repo.updateBookingHoldAmount).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        0,
      );
    });

    test("withdraw decrements headcount", async () => {
      const booking = makeBooking({
        currentState: "awaiting_tutor_review",
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      const participant = makeParticipant({ heldAmount: 42 });

      const { service, repo } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findParticipant: mock(async () => participant),
          findConfirmedParticipants: mock(async () => []),
          updateBookingVersioned: mock(async () => ({
            updated: { ...booking, currentState: "awaiting_reconfirmation" },
            newVersion: 2,
          })),
        },
      });

      await service.withdraw("student1", "b1");

      expect(repo.decrementBookingConfirmedHeadcount).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
      );
    });

    test("withdraw group cancel releases other participants excluding withdrawing user", async () => {
      const booking = makeBooking({
        type: "group",
        currentState: "awaiting_tutor_review",
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      const participant = makeParticipant({ heldAmount: 42 });
      const other = makeParticipant({
        id: "p2",
        userId: "student2",
        heldAmount: 42,
      });

      const { service, wallet, repo } = createService({
        repo: {
          findBookingById: mock(async () => booking),
          findParticipant: mock(async () => participant),
          findConfirmedParticipants: mock(async () => [other]),
          updateBookingVersioned: mock(async () => ({
            updated: { ...booking, currentState: "cancelled" },
            newVersion: 2,
          })),
        },
      });

      await service.withdraw("student1", "b1");

      expect(wallet.release).toHaveBeenCalledTimes(2);
      expect(repo.updateBookingHoldAmount).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        0,
      );
    });

    test("series cancel cascades to sessions", async () => {
      const booking = makeBooking({
        type: "series",
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      const { service, repo } = createService({
        repo: {
          findBookingById: mock(async () => booking),
          findParticipant: mock(async () => makeParticipant()),
          findConfirmedParticipants: mock(async () => [
            makeParticipant({ heldAmount: 42 }),
          ]),
          updateBookingVersioned: mock(async () => ({
            updated: { ...booking, currentState: "cancelled" },
            newVersion: 2,
          })),
        },
      });

      await service.cancel("student1", "b1");

      expect(repo.cancelAllSessions).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
      );
      expect(repo.updateBookingHoldAmount).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        0,
      );
    });

    test("releaseAllParticipantHolds zero participants is no-op", async () => {
      const booking = makeBooking({
        holdAmount: 0,
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      const { service, wallet, repo } = createService({
        repo: {
          findBookingById: mock(async () => booking),
          findParticipant: mock(async () => makeParticipant()),
          findConfirmedParticipants: mock(async () => []),
          updateBookingVersioned: mock(async () => ({
            updated: { ...booking, currentState: "cancelled" },
            newVersion: 2,
          })),
        },
      });

      await service.cancel("student1", "b1");

      expect(wallet.release).not.toHaveBeenCalled();
      expect(repo.updateParticipantState).not.toHaveBeenCalled();
    });
  });

  describe("declineInvite", () => {
    test("throws BookingNotFoundError when booking does not exist", async () => {
      const { service } = createService({
        repo: { findBookingById: mock(async () => null) },
      });

      await expect(service.declineInvite("student2", "b1")).rejects.toThrow(
        BookingNotFoundError,
      );
    });

    test("throws BookingNotAwaitingConfirmationError when booking is not awaiting participant confirmation", async () => {
      const { service } = createService({
        repo: {
          findBookingById: mock(async () =>
            makeBooking({ currentState: "confirmed" }),
          ),
        },
      });

      await expect(service.declineInvite("student2", "b1")).rejects.toThrow(
        BookingNotAwaitingConfirmationError,
      );
    });

    test("throws BookingNotOwnedError when user is not a participant", async () => {
      const { service } = createService({
        repo: {
          findBookingById: mock(async () =>
            makeBooking({ currentState: "awaiting_participant_confirmation" }),
          ),
          findParticipant: mock(async () => null),
        },
      });

      await expect(service.declineInvite("student2", "b1")).rejects.toThrow(
        BookingNotOwnedError,
      );
    });

    test("throws BookingNotEditableError when user is not an invitee", async () => {
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
        BookingNotEditableError,
      );
    });

    test("throws BookingParticipantAlreadyConfirmedError when participant already confirmed/declined", async () => {
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

      await expect(service.declineInvite("student2", "b1")).rejects.toThrow(
        BookingParticipantAlreadyConfirmedError,
      );
    });
  });

  describe("confirmInvite — insufficient marks", () => {
    test("throws InsufficientMarksError when invitee has insufficient balance", async () => {
      const booking = makeBooking({
        currentState: "awaiting_participant_confirmation",
        priceSnapshot: {
          perStudent: 42,
          baseline: 42,
          tutorShare: 33.6,
          cogitoTake: 8.4,
          baselineCogitoTake: 12,
          baselineTutorShare: 30,
          extraTotal: 0,
          cogitoExtraTake: 0,
          tutorExtraShare: 0,
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
        },
        wallet: {
          ...makeWallet(),
          getByUserId: mock(async () => ({
            id: "w2",
            totalBalance: 10,
            heldBalance: 0,
            availableBalance: 10,
          })),
        },
      });

      await expect(service.confirmInvite("student2", "b1")).rejects.toThrow(
        InsufficientMarksError,
      );
    });

    test("throws BookingNotFoundError when invitee wallet not found", async () => {
      const booking = makeBooking({
        currentState: "awaiting_participant_confirmation",
        priceSnapshot: {
          perStudent: 42,
          baseline: 42,
          tutorShare: 33.6,
          cogitoTake: 8.4,
          baselineCogitoTake: 12,
          baselineTutorShare: 30,
          extraTotal: 0,
          cogitoExtraTake: 0,
          tutorExtraShare: 0,
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
        },
        wallet: {
          ...makeWallet(),
          getByUserId: mock(async () => null),
        },
      });

      await expect(service.confirmInvite("student2", "b1")).rejects.toThrow(
        BookingNotFoundError,
      );
    });
  });

  describe("withdraw — non-group, non-late, scheduled state", () => {
    test("withdraws from scheduled state transitions to cancelled", async () => {
      const booking = makeBooking({
        type: "solo",
        currentState: "scheduled",
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      const participant = makeParticipant({ heldAmount: 42 });
      const { service } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
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
  });

  describe("releaseExpiredHolds", () => {
    test("releases holds and sets holdAmount to 0 for expiring bookings", async () => {
      const b1 = makeBooking({
        id: "b1",
        currentState: "awaiting_tutor_review",
        holdAmount: 100,
        proposerId: "student1",
      });

      const { service, wallet, notification } = createService({
        repo: {
          findBookingsExpiringByDeadline: mock(async () => [b1]),
          findBookingById: mock(async () => ({ ...b1, version: 1 })),
          findConfirmedParticipants: mock(async () => [
            makeParticipant({ heldAmount: 100 }),
          ]),
          updateBookingVersioned: mock(async () => ({
            updated: { ...b1, currentState: "expired" },
            newVersion: 2,
          })),
        },
      });

      const result = await service.releaseExpiredHolds();
      expect(result).toEqual({ released: 1 });
      expect(wallet.release).toHaveBeenCalledTimes(1);
      expect(notification.writeBestEffort).toHaveBeenCalledTimes(1);
      expect(notification.writeBestEffort.mock.calls[0][0]).toMatchObject({
        userId: "student1",
        bookingId: "b1",
        eventKey: "booking.b1.hold_released_expiry",
        title: "Booking hold released",
      });
    });

    test("skips bookings with holdAmount of 0", async () => {
      const b1 = makeBooking({
        id: "b1",
        currentState: "awaiting_tutor_review",
        holdAmount: 0,
        proposerId: "student1",
      });

      const { service, wallet } = createService({
        repo: {
          findBookingsExpiringByDeadline: mock(async () => [b1]),
        },
      });

      const result = await service.releaseExpiredHolds();
      expect(result).toEqual({ released: 0 });
      expect(wallet.release).not.toHaveBeenCalled();
    });

    test("continues when individual booking fails", async () => {
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

      let callCount = 0;
      const { service } = createService({
        repo: {
          findBookingsExpiringByDeadline: mock(async () => [b1, b2]),
          findBookingById: mock(async () => {
            callCount++;
            if (callCount === 1) throw new Error("DB error");
            return { ...b2, version: 1 };
          }),
          findConfirmedParticipants: mock(async () => [
            makeParticipant({ heldAmount: 30 }),
          ]),
          updateBookingHoldAmount: mock(async () => {}),
        },
        wallet: {
          ...makeWallet(),
          release: mock(async () => {
            if (callCount === 1) throw new Error("DB error");
            return {
              id: "w1",
              totalBalance: 100,
              heldBalance: 0,
              availableBalance: 100,
            };
          }),
        },
      });

      const result = await service.releaseExpiredHolds();
      expect(result.released).toBeGreaterThanOrEqual(0);
    });

    test("M4: skips the release when the booking cannot be transitioned (version conflict) — never releases from a live booking", async () => {
      const b1 = makeBooking({
        id: "b1",
        currentState: "awaiting_tutor_review",
        holdAmount: 100,
        proposerId: "student1",
      });

      const { service, wallet, repo, notification } = createService({
        repo: {
          findBookingsExpiringByDeadline: mock(async () => [b1]),
          findBookingById: mock(async () => ({ ...b1, version: 1 })),
          findConfirmedParticipants: mock(async () => [
            makeParticipant({ heldAmount: 100 }),
          ]),
          // A concurrent writer bumped the version → transition fails.
          updateBookingVersioned: mock(async () => null),
        },
      });

      const result = await service.releaseExpiredHolds();
      expect(result).toEqual({ released: 0 });
      expect(wallet.release).not.toHaveBeenCalled();
      expect(wallet.deduct).not.toHaveBeenCalled();
      expect(repo.updateBookingHoldAmount).not.toHaveBeenCalled();
      expect(notification.writeBestEffort).not.toHaveBeenCalled();
    });

    test("M4: transitions the booking to its terminal state in the same tx before releasing holds", async () => {
      const b1 = makeBooking({
        id: "b1",
        currentState: "awaiting_tutor_review",
        holdAmount: 100,
        proposerId: "student1",
      });

      const { service, wallet, repo, notification } = createService({
        repo: {
          findBookingsExpiringByDeadline: mock(async () => [b1]),
          findBookingById: mock(async () => ({ ...b1, version: 1 })),
          findConfirmedParticipants: mock(async () => [
            makeParticipant({ heldAmount: 100 }),
          ]),
          updateBookingVersioned: mock(async () => ({
            updated: { ...b1, currentState: "expired" },
            newVersion: 2,
          })),
        },
      });

      const result = await service.releaseExpiredHolds();
      expect(result).toEqual({ released: 1 });
      expect(wallet.release).toHaveBeenCalledTimes(1);
      expect(repo.updateBookingVersioned).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        1,
        expect.objectContaining({ currentState: "expired" }),
      );
      expect(repo.insertStateHistory).toHaveBeenCalledTimes(1);
      expect(notification.writeBestEffort).toHaveBeenCalledTimes(1);
    });

    test("M4: skips already-terminal bookings (raced with expireBookings)", async () => {
      const b1 = makeBooking({
        id: "b1",
        currentState: "expired",
        holdAmount: 100,
        proposerId: "student1",
      });

      const { service, wallet } = createService({
        repo: {
          findBookingsExpiringByDeadline: mock(async () => [b1]),
          findBookingById: mock(async () => ({ ...b1, version: 1 })),
        },
      });

      const result = await service.releaseExpiredHolds();
      expect(result).toEqual({ released: 0 });
      expect(wallet.release).not.toHaveBeenCalled();
    });

    test("M4: skips RESCHEDULE_PROPOSED (expireBookings owns the proposal-expiry path)", async () => {
      const b1 = makeBooking({
        id: "b1",
        currentState: "reschedule_proposed",
        holdAmount: 100,
        proposerId: "student1",
      });

      const { service, wallet, repo } = createService({
        repo: {
          findBookingsExpiringByDeadline: mock(async () => [b1]),
          findBookingById: mock(async () => ({ ...b1, version: 1 })),
          findConfirmedParticipants: mock(async () => [
            makeParticipant({ heldAmount: 100 }),
          ]),
        },
      });

      const result = await service.releaseExpiredHolds();
      expect(result).toEqual({ released: 0 });
      expect(wallet.release).not.toHaveBeenCalled();
      expect(repo.updateBookingVersioned).not.toHaveBeenCalled();
    });

    test("M4: SCHEDULED fallback forfeits holds (NO_SHOW) instead of releasing", async () => {
      const b1 = makeBooking({
        id: "b1",
        currentState: "scheduled",
        holdAmount: 42,
        proposerId: "student1",
      });

      const { service, wallet, repo } = createService({
        repo: {
          findBookingsExpiringByDeadline: mock(async () => [b1]),
          findBookingById: mock(async () => ({ ...b1, version: 1 })),
          findConfirmedParticipants: mock(async () => [
            makeParticipant({ heldAmount: 42 }),
          ]),
          updateBookingVersioned: mock(async () => ({
            updated: { ...b1, currentState: "no_show" },
            newVersion: 2,
          })),
        },
      });

      const result = await service.releaseExpiredHolds();
      expect(result).toEqual({ released: 1 });
      expect(wallet.release).not.toHaveBeenCalled();
      expect(wallet.deduct).toHaveBeenCalledTimes(1);
      expect(wallet.deduct.mock.calls[0][1]).toMatchObject({
        amount: 42,
        reason: "No-show forfeit",
      });
      expect(repo.updateBookingVersioned).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        1,
        expect.objectContaining({ currentState: "no_show" }),
      );
    });
  });

  describe("Story 2: State Machine Completeness", () => {
    describe("RESCHEDULE_PROPOSED expiry", () => {
      test("expires only the proposal, retaining the original booking and hold", async () => {
        const expiringBooking = makeBooking({
          currentState: "reschedule_proposed",
          previousState: "scheduled",
          holdAmount: 42,
          proposerId: "student1",
        });
        const proposal = { id: "r1", bookingId: "b1", status: "pending" };

        const { service, wallet, repo, meeting } = createService({
          repo: {
            findBookingsExpiringByDeadline: mock(async () => [expiringBooking]),
            findBookingById: mock(async () => ({
              ...expiringBooking,
              currentState: "reschedule_proposed",
              version: 1,
            })),
            findPendingRescheduleProposal: mock(async () => proposal),
            updateBookingVersioned: mock(async () => ({
              updated: { ...expiringBooking, currentState: "scheduled" },
              newVersion: 2,
            })),
          },
        });

        const result = await service.expireBookings();

        expect(result).toEqual({ expired: 1, failed: 0 });
        expect(repo.updateRescheduleProposal).toHaveBeenCalledWith(
          expect.anything(),
          "r1",
          expect.objectContaining({ status: "expired" }),
        );
        expect(wallet.release).not.toHaveBeenCalled();
        expect(repo.updateBookingHoldAmount).not.toHaveBeenCalled();
        expect(meeting.cancelEvent).not.toHaveBeenCalled();
      });

      test("N3: proposal expiry resyncs a pre-assigned confirmed room back to the original schedule", async () => {
        // N3: same drift as rejection — an admin pre-assigned a room at the
        // proposal time; when the proposal EXPIRES the booking keeps its
        // original schedule, so the confirmed roomBooking row must be
        // resynced to it.
        const originalStart = new Date(Date.now() + 48 * 60 * 60 * 1000);
        const originalEnd = new Date(originalStart.getTime() + 90 * 60 * 1000);
        const expiringBooking = makeBooking({
          currentState: "reschedule_proposed",
          modality: "offline",
          previousState: "scheduled",
          scheduledStartAt: originalStart,
          scheduledEndAt: originalEnd,
          holdAmount: 42,
          proposerId: "student1",
        });
        const proposal = {
          id: "r1",
          bookingId: "b1",
          status: "pending",
          proposedStartAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
          proposedEndAt: new Date(Date.now() + 72 * 60 * 60 * 1000 + 3600_000),
        };

        const { service, roomPort, repo } = createService({
          repo: {
            findBookingsExpiringByDeadline: mock(async () => [expiringBooking]),
            findBookingById: mock(async () => ({
              ...expiringBooking,
              currentState: "reschedule_proposed",
              version: 1,
            })),
            findPendingRescheduleProposal: mock(async () => proposal),
            updateBookingVersioned: mock(async () => ({
              updated: { ...expiringBooking, currentState: "scheduled" },
              newVersion: 2,
            })),
          },
        });

        const result = await service.expireBookings();

        expect(result).toEqual({ expired: 1, failed: 0 });
        expect(roomPort.resyncRoomBookingToSchedule).toHaveBeenCalledWith(
          expect.anything(),
          "b1",
          expect.objectContaining({
            startAt: originalStart,
            endAt: originalEnd,
          }),
        );
        expect(roomPort.syncRoomBookingScheduleForBooking).toHaveBeenCalledWith(
          expect.anything(),
          "b1",
          expiringBooking.scheduledStartAt,
          expiringBooking.scheduledEndAt,
        );
        expect(repo.updateBookingVersioned).toHaveBeenCalledWith(
          expect.anything(),
          "b1",
          1,
          expect.objectContaining({ currentState: "scheduled" }),
        );
      });

      test("N3: proposal expiry routes an offline room conflict to admin approval", async () => {
        const originalStart = new Date(Date.now() + 48 * 60 * 60 * 1000);
        const originalEnd = new Date(originalStart.getTime() + 90 * 60 * 1000);
        const expiringBooking = makeBooking({
          currentState: "reschedule_proposed",
          modality: "offline",
          previousState: "scheduled",
          scheduledStartAt: originalStart,
          scheduledEndAt: originalEnd,
        });
        const proposal = {
          id: "r1",
          bookingId: "b1",
          status: "pending",
          proposedStartAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
          proposedEndAt: new Date(Date.now() + 72 * 60 * 60 * 1000 + 3600_000),
        };

        const { service, roomPort, repo } = createService({
          repo: {
            findBookingsExpiringByDeadline: mock(async () => [expiringBooking]),
            findBookingById: mock(async () => ({
              ...expiringBooking,
              currentState: "reschedule_proposed",
              version: 1,
            })),
            findPendingRescheduleProposal: mock(async () => proposal),
            updateBookingVersioned: mock(async () => ({
              updated: {
                ...expiringBooking,
                currentState: "awaiting_admin_room_approval",
              },
              newVersion: 2,
            })),
          },
          roomPort: {
            syncRoomBookingScheduleForBooking: mock(
              async () => "conflict" as const,
            ),
          },
        });

        const result = await service.expireBookings();

        expect(result).toEqual({ expired: 1, failed: 0 });
        expect(repo.updateBookingVersioned).toHaveBeenCalledWith(
          expect.anything(),
          "b1",
          1,
          expect.objectContaining({
            currentState: "awaiting_admin_room_approval",
          }),
        );
        expect(roomPort.syncRoomBookingScheduleForBooking).toHaveBeenCalledWith(
          expect.anything(),
          "b1",
          originalStart,
          originalEnd,
        );
      });
    });

    describe("SCHEDULED expiry → NO_SHOW", () => {
      test("expires scheduled booking to NO_SHOW and FORFEITS holds via deduct (M2)", async () => {
        const expiringBooking = makeBooking({
          currentState: "scheduled",
          holdAmount: 42,
          proposerId: "student1",
        });
        const p1 = makeParticipant({ heldAmount: 42 });

        const { service, wallet, repo } = createService({
          repo: {
            findBookingsExpiringByDeadline: mock(async () => [expiringBooking]),
            findBookingById: mock(async () => ({
              ...expiringBooking,
              currentState: "scheduled",
              version: 1,
            })),
            findConfirmedParticipants: mock(async () => [p1]),
            updateBookingVersioned: mock(async () => ({
              updated: { ...expiringBooking, currentState: "no_show" },
              newVersion: 2,
            })),
          },
        });

        const result = await service.expireBookings();

        expect(result).toEqual({ expired: 1, failed: 0 });
        expect(wallet.release).not.toHaveBeenCalled();
        expect(wallet.deduct).toHaveBeenCalledTimes(1);
        expect(wallet.deduct.mock.calls[0][1]).toMatchObject({
          amount: 42,
          actorType: "system",
          reason: "No-show forfeit",
        });
        expect(repo.updateBookingHoldAmount).toHaveBeenCalledWith(
          expect.anything(),
          "b1",
          0,
        );
        expect(repo.updateBookingVersioned).toHaveBeenCalledWith(
          expect.anything(),
          "b1",
          1,
          expect.objectContaining({ currentState: "no_show" }),
        );
      });
    });

    describe("AWAITING_ADMIN_ROOM_APPROVAL expiry → CANCELLED", () => {
      test("expires awaiting_admin_room_approval booking to CANCELLED and releases holds", async () => {
        const expiringBooking = makeBooking({
          currentState: "awaiting_admin_room_approval",
          holdAmount: 42,
          proposerId: "student1",
        });
        const p1 = makeParticipant({ heldAmount: 42 });

        const { service, wallet, repo } = createService({
          repo: {
            findBookingsExpiringByDeadline: mock(async () => [expiringBooking]),
            findBookingById: mock(async () => ({
              ...expiringBooking,
              currentState: "awaiting_admin_room_approval",
              version: 1,
            })),
            findConfirmedParticipants: mock(async () => [p1]),
            updateBookingVersioned: mock(async () => ({
              updated: { ...expiringBooking, currentState: "cancelled" },
              newVersion: 2,
            })),
          },
        });

        const result = await service.expireBookings();

        expect(result).toEqual({ expired: 1, failed: 0 });
        expect(wallet.release).toHaveBeenCalledTimes(1);
        expect(repo.updateBookingHoldAmount).toHaveBeenCalledWith(
          expect.anything(),
          "b1",
          0,
        );
        expect(repo.updateBookingVersioned).toHaveBeenCalledWith(
          expect.anything(),
          "b1",
          1,
          expect.objectContaining({ currentState: "cancelled" }),
        );
      });
    });

    describe("proposeReschedule sets deadlineAt", () => {
      test("proposeReschedule sets deadline 24h in the future", async () => {
        const booking = makeBooking({
          currentState: "awaiting_tutor_review",
          scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        });
        const { service, repo } = createService({
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

        await service.proposeReschedule("tutor1", "b1", start, end);

        expect(repo.updateBookingDeadline).toHaveBeenCalledTimes(1);
        const deadlineArg = repo.updateBookingDeadline.mock.calls[0][2] as Date;
        const diff = deadlineArg.getTime() - Date.now();
        expect(diff).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 1000);
        expect(diff).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 1000);
      });
    });

    describe("tutorAccept sets deadlineAt for SCHEDULED", () => {
      test("online tutorAccept sets deadlineAt to scheduledEndAt + 24h", async () => {
        const scheduledEndAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
        const booking = makeBooking({
          modality: "online",
          scheduledEndAt,
        });
        let findCallCount = 0;
        const { service, repo } = createService({
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
              async (_conn: any, _id: any, ver: number, updates: any) => ({
                updated: { ...booking, ...updates, version: ver + 1 },
                newVersion: ver + 1,
              }),
            ),
          },
        });

        await service.tutorAccept("b1", "tutor1");

        expect(repo.updateBookingDeadline).toHaveBeenCalledTimes(1);
        const deadlineArg = repo.updateBookingDeadline.mock.calls[0][2] as Date;
        const expected = scheduledEndAt.getTime() + 24 * 60 * 60 * 1000;
        expect(deadlineArg.getTime()).toBeGreaterThanOrEqual(expected - 1000);
        expect(deadlineArg.getTime()).toBeLessThanOrEqual(expected + 1000);
      });

      test("offline tutorAccept caps the room-approval deadline at 12h (DL-25/U12)", async () => {
        const scheduledStartAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
        const booking = makeBooking({
          modality: "offline",
          scheduledStartAt,
        });
        let findCallCount = 0;
        const { service, repo } = createService({
          repo: {
            findBookingById: mock(async () => {
              findCallCount++;
              if (findCallCount === 1)
                return {
                  ...booking,
                  currentState: "awaiting_tutor_review",
                  version: 1,
                };
              if (findCallCount === 2)
                return {
                  ...booking,
                  currentState: "awaiting_tutor_review",
                  version: 1,
                };
              if (findCallCount === 3)
                return {
                  ...booking,
                  currentState: "confirmed",
                  version: 2,
                };
              return {
                ...booking,
                currentState: "awaiting_admin_room_approval",
                version: 3,
              };
            }),
            updateBookingVersioned: mock(
              async (_conn: any, _id: any, ver: number, updates: any) => ({
                updated: { ...booking, ...updates, version: ver + 1 },
                newVersion: ver + 1,
              }),
            ),
          },
        });

        await service.tutorAccept("b1", "tutor1");

        expect(repo.updateBookingDeadline).toHaveBeenCalledTimes(1);
        const deadlineArg = repo.updateBookingDeadline.mock.calls[0][2] as Date;
        // DL-25 (U12): room approval window is 12h, capped at session start —
        // this session is 48h out, so the deadline is now + 12h.
        const expected = Date.now() + 12 * 60 * 60 * 1000;
        expect(deadlineArg.getTime()).toBeGreaterThan(expected - 60_000);
        expect(deadlineArg.getTime()).toBeLessThan(expected + 60_000);
      });
    });

    describe("expireBookings routes to correct terminal state", () => {
      test("default states expire to EXPIRED", async () => {
        const expiringBooking = makeBooking({
          currentState: "awaiting_tutor_review",
          holdAmount: 0,
          proposerId: "student1",
        });

        const { service, repo } = createService({
          repo: {
            findBookingsExpiringByDeadline: mock(async () => [expiringBooking]),
            findBookingById: mock(async () => ({
              ...expiringBooking,
              currentState: "awaiting_tutor_review",
              version: 1,
            })),
            findConfirmedParticipants: mock(async () => []),
            updateBookingVersioned: mock(async () => ({
              updated: { ...expiringBooking, currentState: "expired" },
              newVersion: 2,
            })),
          },
        });

        await service.expireBookings();

        expect(repo.updateBookingVersioned).toHaveBeenCalledWith(
          expect.anything(),
          "b1",
          1,
          expect.objectContaining({ currentState: "expired" }),
        );
      });
    });
  });

  describe("G4 group repricing on headcount change", () => {
    function makeGroupBooking(overrides: Record<string, unknown> = {}) {
      return makeBooking({
        type: "group",
        currentState: "awaiting_tutor_review",
        targetGroupSize: 4,
        confirmedHeadcount: 4,
        holdAmount: 112,
        priceSnapshot: {
          perStudent: 28,
          baseline: 112,
          tutorShare: 89.6,
          cogitoTake: 22.4,
        },
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        ...overrides,
      });
    }

    function makeRemainingParticipant(
      id: string,
      userId: string,
      heldAmount: number,
    ) {
      return {
        id,
        bookingId: "b1",
        userId,
        role: "invitee",
        confirmationState: "confirmed",
        heldAmount,
      };
    }

    test("withdraw from group reprices remaining participants to higher per-student price", async () => {
      const booking = makeGroupBooking();
      const proposer = makeParticipant({ heldAmount: 112 });
      const remaining = [
        makeRemainingParticipant("p2", "student2", 28),
        makeRemainingParticipant("p3", "student3", 28),
        makeRemainingParticipant("p4", "student4", 28),
      ];
      const { service, wallet, repo, notification } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findParticipant: mock(async () => proposer),
          findConfirmedParticipants: mock(async () => remaining),
          findTutorProfile: mock(async () =>
            makeTutorProfile({ prices: { "3": 35 } }),
          ),
          updateBookingVersioned: mock(
            async (_conn: any, _id: any, ver: number, updates: any) => ({
              updated: { ...booking, ...updates, version: ver + 1 },
              newVersion: ver + 1,
            }),
          ),
        },
        pricing: { computeSplit: mock(realComputeSplit) },
      });

      const result = await service.withdraw("student1", "b1");

      expect(result.withdrawn).toBe(true);
      // 3 remaining participants each need +7 (28 -> 35)
      expect(wallet.hold).toHaveBeenCalledTimes(3);
      for (const call of wallet.hold.mock.calls) {
        expect(call[1].amount).toBe(7);
        expect(call[1].reason).toContain("Group repricing");
      }
      expect(repo.updateBookingPriceSnapshot).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        expect.objectContaining({ holdAmount: 105 }),
      );
      const snapshotArg = repo.updateBookingPriceSnapshot.mock.calls[0][2] as {
        priceSnapshot: { perStudent: number };
      };
      expect(snapshotArg.priceSnapshot.perStudent).toBe(35);
      expect(repo.updateParticipantState).toHaveBeenCalledWith(
        expect.anything(),
        "p2",
        expect.objectContaining({ heldAmount: 35 }),
      );
      expect(notification.writeBestEffort).toHaveBeenCalledTimes(3);
      expect(notification.writeBestEffort.mock.calls[0][0]).toMatchObject({
        title: "Group price updated",
      });
    });

    test("M8: unfunded reprice after withdrawal expires the group instead of rolling back the withdrawal", async () => {
      const booking = makeGroupBooking();
      const proposer = makeParticipant({ heldAmount: 112 });
      const remaining = [
        makeRemainingParticipant("p2", "student2", 28),
        makeRemainingParticipant("p3", "student3", 28),
      ];
      const { service, repo } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findParticipant: mock(async () => proposer),
          findConfirmedParticipants: mock(async () => remaining),
          findTutorProfile: mock(async () =>
            makeTutorProfile({ prices: { "3": 35 } }),
          ),
          updateBookingVersioned: mock(
            async (_conn: any, _id: any, ver: number, updates: any) => ({
              updated: { ...booking, ...updates, version: ver + 1 },
              newVersion: ver + 1,
            }),
          ),
        },
        wallet: {
          ...makeWallet(),
          getByUserId: mock(async () => ({
            id: "w2",
            totalBalance: 28,
            heldBalance: 28,
            availableBalance: 0,
          })),
        },
        pricing: { computeSplit: mock(realComputeSplit) },
      });

      // PRD TC-19: the group falls through to expiry on an unfunded reprice —
      // the withdrawer is not stuck in a group they cannot leave, and the
      // remaining holds are released with the booking EXPIRED. The regression
      // to AWAITING_RECONFIRMATION happens first; the expiry fallback is the
      // final transition.
      const result = await service.withdraw("student1", "b1");
      expect(result.withdrawn).toBe(true);
      expect(repo.updateBookingVersioned).toHaveBeenCalledTimes(2);
      const lastCall = repo.updateBookingVersioned.mock.calls[1] as unknown[];
      expect(lastCall[3]).toEqual(
        expect.objectContaining({ currentState: "expired" }),
      );
      expect(repo.updateBookingHoldAmount).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        0,
      );
    });

    test("withdraw repricing releases excess hold when per-student price drops", async () => {
      const booking = makeGroupBooking();
      const proposer = makeParticipant({ heldAmount: 112 });
      const remaining = [
        makeRemainingParticipant("p2", "student2", 28),
        makeRemainingParticipant("p3", "student3", 28),
      ];
      const { service, wallet, repo } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findParticipant: mock(async () => proposer),
          findConfirmedParticipants: mock(async () => remaining),
          findTutorProfile: mock(async () =>
            makeTutorProfile({ prices: { "2": 20 } }),
          ),
          updateBookingVersioned: mock(
            async (_conn: any, _id: any, ver: number, updates: any) => ({
              updated: { ...booking, ...updates, version: ver + 1 },
              newVersion: ver + 1,
            }),
          ),
        },
        pricing: { computeSplit: mock(realComputeSplit) },
      });

      await service.withdraw("student1", "b1");

      // 1 release for the withdrawn proposer + 2 excess releases (28 -> 20)
      expect(wallet.release).toHaveBeenCalledTimes(3);
      const repriceReleases = wallet.release.mock.calls.slice(1);
      for (const call of repriceReleases) {
        expect(call[1].amount).toBe(8);
      }
      expect(repo.updateBookingPriceSnapshot).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        expect.objectContaining({ holdAmount: 40 }),
      );
    });

    test("withdraw from non-group booking does not reprice", async () => {
      const booking = makeBooking({
        type: "solo",
        currentState: "awaiting_tutor_review",
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      const participant = makeParticipant({ heldAmount: 42 });
      const { service, repo } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findParticipant: mock(async () => participant),
          findConfirmedParticipants: mock(async () => []),
          updateBookingVersioned: mock(
            async (_conn: any, _id: any, ver: number, updates: any) => ({
              updated: { ...booking, ...updates, version: ver + 1 },
              newVersion: ver + 1,
            }),
          ),
        },
      });

      await service.withdraw("student1", "b1");

      expect(repo.updateBookingPriceSnapshot).not.toHaveBeenCalled();
    });
  });

  describe("G5 series session cancellation", () => {
    test("rejects session cancellation when the parent booking is terminal", async () => {
      const booking = makeBooking({
        type: "series",
        targetGroupSize: 1,
        currentState: "cancelled",
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      const session = {
        id: "s1",
        seriesBookingId: "b1",
        scheduledStartAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        scheduledEndAt: new Date(Date.now() + 72 * 60 * 60 * 1000 + 3600_000),
        currentState: "scheduled",
        holdAmount: 42,
      };
      const { service, repo } = createService({
        repo: {
          findSessionById: mock(async () => session),
          findBookingById: mock(async () => booking),
        },
      });

      await expect(service.cancelSession("student1", "s1")).rejects.toThrow(
        BookingCancelledError,
      );
      expect(repo.cancelSession).not.toHaveBeenCalled();
    });

    test("rejects series-session cancellation once that session has started", async () => {
      const booking = makeBooking({
        type: "series",
        targetGroupSize: 1,
        currentState: "scheduled",
      });
      const session = {
        id: "s1",
        seriesBookingId: "b1",
        scheduledStartAt: new Date(Date.now() - 1_000),
        scheduledEndAt: new Date(Date.now() + 60 * 60 * 1000),
        currentState: "scheduled",
        holdAmount: 42,
      };
      const { service, wallet, repo } = createService({
        repo: {
          findSessionById: mock(async () => session),
          findBookingById: mock(async () => booking),
        },
      });

      await expect(service.cancelSession("student1", "s1")).rejects.toThrow(
        BookingCancellationDeadlinePassedError,
      );
      expect(wallet.deduct).not.toHaveBeenCalled();
      expect(wallet.release).not.toHaveBeenCalled();
      expect(repo.cancelSession).not.toHaveBeenCalled();
    });

    test("cancels a solo series session before H-2 and releases its hold", async () => {
      const booking = makeBooking({
        type: "series",
        targetGroupSize: 1,
        holdAmount: 84,
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      const session = {
        id: "s1",
        seriesBookingId: "b1",
        scheduledStartAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        scheduledEndAt: new Date(Date.now() + 72 * 60 * 60 * 1000 + 3600_000),
        currentState: "scheduled",
        holdAmount: 42,
      };
      const { service, repo, wallet, notification } = createService({
        repo: {
          findSessionById: mock(async () => session),
          findBookingById: mock(async () => booking),
          findParticipant: mock(async () =>
            makeParticipant({ heldAmount: 84 }),
          ),
        },
      });

      const result = await service.cancelSession("student1", "s1");

      expect(result).toEqual({
        cancelled: true,
        sessionId: "s1",
        forfeited: false,
      });
      expect(wallet.release).toHaveBeenCalledTimes(1);
      expect(wallet.release.mock.calls[0][1]).toMatchObject({
        amount: 42,
        reason: "Series session cancelled",
      });
      expect(repo.updateParticipantState).toHaveBeenCalledWith(
        expect.anything(),
        "p1",
        expect.objectContaining({ heldAmount: 42 }),
      );
      expect(repo.cancelSession).toHaveBeenCalledWith(expect.anything(), "s1");
      expect(repo.updateBookingHoldAmount).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        42,
      );
      expect(notification.writeBestEffort).toHaveBeenCalledTimes(1);
    });

    test("TC-30: cancelling a session within 2h of start forfeits the session hold", async () => {
      const booking = makeBooking({
        type: "series",
        targetGroupSize: 1,
        holdAmount: 84,
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      const session = {
        id: "s1",
        seriesBookingId: "b1",
        scheduledStartAt: new Date(Date.now() + 60 * 60 * 1000),
        scheduledEndAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        currentState: "scheduled",
        holdAmount: 42,
      };
      const { service, wallet, repo } = createService({
        repo: {
          findSessionById: mock(async () => session),
          findBookingById: mock(async () => booking),
          findParticipant: mock(async () =>
            makeParticipant({ heldAmount: 84 }),
          ),
        },
      });

      const result = await service.cancelSession("student1", "s1");

      expect(result).toEqual({
        cancelled: true,
        sessionId: "s1",
        forfeited: true,
      });
      expect(wallet.release).not.toHaveBeenCalled();
      expect(wallet.deduct).toHaveBeenCalledTimes(1);
      expect(wallet.deduct.mock.calls[0][1]).toMatchObject({
        amount: 42,
        eventKey: "booking.b1.session.s1.forfeit",
        reason: "Session cancelled after cancellation deadline (forfeit)",
      });
      expect(repo.cancelSession).toHaveBeenCalledWith(expect.anything(), "s1");
    });

    test("rejects cancellation for group series bookings", async () => {
      const booking = makeBooking({
        type: "series",
        targetGroupSize: 3,
        holdAmount: 252,
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      const session = {
        id: "s1",
        seriesBookingId: "b1",
        scheduledStartAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        scheduledEndAt: new Date(Date.now() + 72 * 60 * 60 * 1000 + 3600_000),
        currentState: "scheduled",
        holdAmount: 84,
      };
      const { service } = createService({
        repo: {
          findSessionById: mock(async () => session),
          findBookingById: mock(async () => booking),
        },
      });

      await expect(service.cancelSession("student1", "s1")).rejects.toThrow(
        BookingSessionNotCancellableError,
      );
    });

    test("rejects cancellation for non-series bookings", async () => {
      const booking = makeBooking({
        type: "solo",
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      const session = {
        id: "s1",
        seriesBookingId: "b1",
        scheduledStartAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        scheduledEndAt: new Date(Date.now() + 72 * 60 * 60 * 1000 + 3600_000),
        currentState: "scheduled",
        holdAmount: 42,
      };
      const { service } = createService({
        repo: {
          findSessionById: mock(async () => session),
          findBookingById: mock(async () => booking),
        },
      });

      await expect(service.cancelSession("student1", "s1")).rejects.toThrow(
        BookingNotEditableError,
      );
    });

    test("throws BookingSessionNotFoundError for unknown session", async () => {
      const { service } = createService();

      await expect(
        service.cancelSession("student1", "missing"),
      ).rejects.toThrow(BookingSessionNotFoundError);
    });

    test("series get response includes group disclaimer", async () => {
      const series = {
        id: "b1",
        type: "series",
        targetGroupSize: 3,
        proposerId: "student1",
        tutorId: "tutor1",
      };
      const { service } = createService({
        repo: {
          findBookingWithParticipants: mock(async () => series),
        },
      });

      const result = await service.getById("b1", "student1");
      expect(result.disclaimer).toContain("full-series commitment");
      expect(result.disclaimer).toContain("cannot opt out");
    });
  });

  describe("G6 reschedule accept/reject", () => {
    function makeRescheduleBooking(overrides: Record<string, unknown> = {}) {
      return makeBooking({
        currentState: "reschedule_proposed",
        previousState: "awaiting_tutor_review",
        scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        ...overrides,
      });
    }

    test("acceptReschedule updates time, accepts proposal, transitions, notifies tutor", async () => {
      const booking = makeRescheduleBooking();
      const proposal = {
        id: "r1",
        bookingId: "b1",
        proposedBy: "tutor1",
        proposedStartAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        proposedEndAt: new Date(Date.now() + 72 * 60 * 60 * 1000 + 3600_000),
        status: "pending",
      };
      const { service, repo, notification } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findPendingRescheduleProposal: mock(async () => proposal),
          updateBookingVersioned: mock(
            async (_conn: any, _id: any, ver: number, updates: any) => ({
              updated: { ...booking, ...updates, version: ver + 1 },
              newVersion: ver + 1,
            }),
          ),
        },
      });

      const result = await service.acceptReschedule("student1", "b1");

      expect(result.currentState).toBe("awaiting_tutor_review");
      expect(repo.updateRescheduleProposal).toHaveBeenCalledWith(
        expect.anything(),
        "r1",
        expect.objectContaining({ status: "accepted" }),
      );
      expect(repo.updateBookingSchedule).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        expect.objectContaining({
          scheduledStartAt: proposal.proposedStartAt,
          scheduledEndAt: proposal.proposedEndAt,
        }),
      );
      expect(repo.updateBookingDeadline).toHaveBeenCalledTimes(1);
      expect(notification.write).toHaveBeenCalledTimes(1);
      expect(notification.write.mock.calls[0][0]).toMatchObject({
        userId: "tutor1",
        title: "Reschedule accepted",
      });
    });

    test("acceptReschedule syncs an offline room assignment to the proposed time", async () => {
      const booking = makeRescheduleBooking({
        modality: "offline",
        previousState: "scheduled",
      });
      const proposal = {
        id: "r1",
        bookingId: "b1",
        proposedBy: "tutor1",
        proposedStartAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        proposedEndAt: new Date(Date.now() + 72 * 60 * 60 * 1000 + 3600_000),
        status: "pending",
      };
      const { service, roomPort, repo } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findPendingRescheduleProposal: mock(async () => proposal),
          updateBookingVersioned: mock(
            async (_conn: any, _id: any, ver: number, updates: any) => ({
              updated: { ...booking, ...updates, version: ver + 1 },
              newVersion: ver + 1,
            }),
          ),
        },
      });

      const result = await service.acceptReschedule("student1", "b1");

      expect(result.currentState).toBe("scheduled");
      expect(roomPort.syncRoomBookingScheduleForBooking).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        proposal.proposedStartAt,
        proposal.proposedEndAt,
      );
      expect(repo.updateBookingDeadline).toHaveBeenCalledTimes(1);
    });

    test("acceptReschedule returns an offline room conflict to admin approval", async () => {
      const booking = makeRescheduleBooking({
        modality: "offline",
        previousState: "scheduled",
      });
      const proposal = {
        id: "r1",
        bookingId: "b1",
        proposedBy: "tutor1",
        proposedStartAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        proposedEndAt: new Date(Date.now() + 72 * 60 * 60 * 1000 + 3600_000),
        status: "pending",
      };
      const { service, roomPort } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findPendingRescheduleProposal: mock(async () => proposal),
          updateBookingVersioned: mock(
            async (_conn: any, _id: any, ver: number, updates: any) => ({
              updated: { ...booking, ...updates, version: ver + 1 },
              newVersion: ver + 1,
            }),
          ),
        },
        roomPort: {
          syncRoomBookingScheduleForBooking: mock(
            async () => "conflict" as const,
          ),
        },
      });

      const result = await service.acceptReschedule("student1", "b1");

      expect(result.currentState).toBe("awaiting_admin_room_approval");
      expect(roomPort.syncRoomBookingScheduleForBooking).toHaveBeenCalled();
    });

    test("acceptReschedule moves the provider-side meeting event to the new time (OQ-05)", async () => {
      const booking = makeRescheduleBooking();
      const proposal = {
        id: "r1",
        bookingId: "b1",
        proposedBy: "tutor1",
        proposedStartAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        proposedEndAt: new Date(Date.now() + 72 * 60 * 60 * 1000 + 3600_000),
        status: "pending",
      };
      const { service, meeting } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findPendingRescheduleProposal: mock(async () => proposal),
          updateBookingVersioned: mock(
            async (_conn: any, _id: any, ver: number, updates: any) => ({
              updated: { ...booking, ...updates, version: ver + 1 },
              newVersion: ver + 1,
            }),
          ),
        },
      });

      await service.acceptReschedule("student1", "b1");

      expect(meeting.updateEvent).toHaveBeenCalledWith("b1", {
        startAt: proposal.proposedStartAt,
        endAt: proposal.proposedEndAt,
      });
    });

    test("partial acceptance records the decision without changing the schedule", async () => {
      const booking = makeRescheduleBooking({ previousState: "scheduled" });
      const proposal = {
        id: "r1",
        bookingId: "b1",
        proposedBy: "student1",
        proposedStartAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        proposedEndAt: new Date(Date.now() + 72 * 60 * 60 * 1000 + 5400_000),
        decisions: {
          student1: "accepted" as const,
          tutor1: "pending" as const,
          student2: "pending" as const,
        },
        status: "pending",
      };
      const { service, repo, meeting } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findPendingRescheduleProposal: mock(async () => proposal),
          findParticipant: mock(async () => ({ id: "p2", userId: "student2" })),
        },
      });

      const result = await service.acceptReschedule("student2", "b1", "r1");

      expect(result.currentState).toBe("reschedule_proposed");
      expect(repo.updateRescheduleProposal).toHaveBeenCalledWith(
        expect.anything(),
        "r1",
        expect.objectContaining({
          status: "pending",
          decisions: {
            student1: "accepted",
            tutor1: "pending",
            student2: "accepted",
          },
        }),
      );
      expect(repo.updateBookingSchedule).not.toHaveBeenCalled();
      expect(meeting.updateEvent).not.toHaveBeenCalled();
    });

    test("tutor can provide the final acceptance and restore scheduled state", async () => {
      const booking = makeRescheduleBooking({ previousState: "scheduled" });
      const proposal = {
        id: "r1",
        bookingId: "b1",
        proposedBy: "student1",
        proposedStartAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        proposedEndAt: new Date(Date.now() + 72 * 60 * 60 * 1000 + 5400_000),
        decisions: {
          student1: "accepted" as const,
          tutor1: "pending" as const,
        },
        status: "pending",
      };
      const { service, repo } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findPendingRescheduleProposal: mock(async () => proposal),
          updateBookingVersioned: mock(
            async (_conn: any, _id: any, ver: number, updates: any) => ({
              updated: { ...booking, ...updates, version: ver + 1 },
              newVersion: ver + 1,
            }),
          ),
        },
      });

      const result = await service.acceptReschedule("tutor1", "b1", "r1");

      expect(result.currentState).toBe("scheduled");
      expect(repo.updateBookingSchedule).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        expect.objectContaining({
          scheduledStartAt: proposal.proposedStartAt,
          scheduledEndAt: proposal.proposedEndAt,
        }),
      );
    });

    test("acceptReschedule throws when caller is not the proposer", async () => {
      const booking = makeRescheduleBooking({ proposerId: "other" });
      const { service } = createService({
        repo: {
          findBookingById: mock(async () => booking),
        },
      });

      await expect(service.acceptReschedule("student1", "b1")).rejects.toThrow(
        BookingNotOwnedError,
      );
    });

    test("acceptReschedule throws when booking is not in reschedule_proposed", async () => {
      const booking = makeRescheduleBooking({ currentState: "scheduled" });
      const { service } = createService({
        repo: {
          findBookingById: mock(async () => booking),
        },
      });

      await expect(service.acceptReschedule("student1", "b1")).rejects.toThrow(
        BookingRescheduleNotPendingError,
      );
    });

    test("acceptReschedule throws when no pending proposal exists", async () => {
      const booking = makeRescheduleBooking();
      const { service } = createService({
        repo: {
          findBookingById: mock(async () => booking),
          findPendingRescheduleProposal: mock(async () => null),
        },
      });

      await expect(service.acceptReschedule("student1", "b1")).rejects.toThrow(
        BookingRescheduleNotFoundError,
      );
    });

    test("rejectReschedule rejects proposal and reverts to previous state", async () => {
      const booking = makeRescheduleBooking();
      const proposal = {
        id: "r1",
        bookingId: "b1",
        proposedBy: "tutor1",
        proposedStartAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        proposedEndAt: new Date(Date.now() + 72 * 60 * 60 * 1000 + 3600_000),
        status: "pending",
      };
      const { service, repo, notification } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findPendingRescheduleProposal: mock(async () => proposal),
          updateBookingVersioned: mock(
            async (_conn: any, _id: any, ver: number, updates: any) => ({
              updated: { ...booking, ...updates, version: ver + 1 },
              newVersion: ver + 1,
            }),
          ),
        },
      });

      const result = await service.rejectReschedule("student1", "b1");

      expect(result.currentState).toBe("awaiting_tutor_review");
      expect(repo.updateRescheduleProposal).toHaveBeenCalledWith(
        expect.anything(),
        "r1",
        expect.objectContaining({ status: "rejected" }),
      );
      expect(repo.updateBookingSchedule).not.toHaveBeenCalled();
      expect(notification.write).toHaveBeenCalledTimes(1);
      expect(notification.write.mock.calls[0][0]).toMatchObject({
        userId: "tutor1",
        title: "Reschedule rejected",
      });
    });

    test("rejectReschedule reverts to awaiting_admin_room_approval when that was the prior state", async () => {
      const booking = makeRescheduleBooking({
        previousState: "awaiting_admin_room_approval",
      });
      const proposal = {
        id: "r1",
        bookingId: "b1",
        proposedBy: "tutor1",
        proposedStartAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        proposedEndAt: new Date(Date.now() + 72 * 60 * 60 * 1000 + 3600_000),
        status: "pending",
      };
      const { service, repo } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findPendingRescheduleProposal: mock(async () => proposal),
          updateBookingVersioned: mock(
            async (_conn: any, _id: any, ver: number, updates: any) => ({
              updated: { ...booking, ...updates, version: ver + 1 },
              newVersion: ver + 1,
            }),
          ),
        },
      });

      const result = await service.rejectReschedule("student1", "b1");

      expect(result.currentState).toBe("awaiting_admin_room_approval");
      const transitionCall = repo.updateBookingVersioned.mock.calls[0][3];
      expect(transitionCall).toMatchObject({
        currentState: "awaiting_admin_room_approval",
      });
    });

    test("N3: rejectReschedule resyncs a pre-assigned confirmed room back to the original schedule", async () => {
      // N3: the RESCHEDULE_PROPOSED carve-out lets an admin assign a room at
      // the proposal time before the proposal settles. When the proposal is
      // REJECTED the booking returns to its original schedule, so the
      // confirmed roomBooking row must be resynced to that original schedule
      // — otherwise the room stays blocked for the wrong window.
      const originalStart = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const originalEnd = new Date(originalStart.getTime() + 90 * 60 * 1000);
      const booking = makeRescheduleBooking({
        modality: "offline",
        previousState: "awaiting_admin_room_approval",
        scheduledStartAt: originalStart,
        scheduledEndAt: originalEnd,
      });
      const proposal = {
        id: "r1",
        bookingId: "b1",
        proposedBy: "tutor1",
        proposedStartAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        proposedEndAt: new Date(Date.now() + 72 * 60 * 60 * 1000 + 3600_000),
        status: "pending",
      };
      const { service, roomPort } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findPendingRescheduleProposal: mock(async () => proposal),
          updateBookingVersioned: mock(
            async (_conn: any, _id: any, ver: number, updates: any) => ({
              updated: { ...booking, ...updates, version: ver + 1 },
              newVersion: ver + 1,
            }),
          ),
        },
      });

      await service.rejectReschedule("student1", "b1");

      expect(roomPort.resyncRoomBookingToSchedule).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        expect.objectContaining({
          startAt: originalStart,
          endAt: originalEnd,
        }),
      );
    });

    test("rejectReschedule restores the original offline room schedule", async () => {
      const booking = makeRescheduleBooking({
        modality: "offline",
        previousState: "scheduled",
      });
      const proposal = {
        id: "r1",
        bookingId: "b1",
        proposedBy: "tutor1",
        proposedStartAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        proposedEndAt: new Date(Date.now() + 72 * 60 * 60 * 1000 + 3600_000),
        status: "pending",
      };
      const { service, roomPort } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findPendingRescheduleProposal: mock(async () => proposal),
          updateBookingVersioned: mock(
            async (_conn: any, _id: any, ver: number, updates: any) => ({
              updated: { ...booking, ...updates, version: ver + 1 },
              newVersion: ver + 1,
            }),
          ),
        },
      });

      const result = await service.rejectReschedule("student1", "b1");

      expect(result.currentState).toBe("scheduled");
      expect(roomPort.syncRoomBookingScheduleForBooking).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        booking.scheduledStartAt,
        booking.scheduledEndAt,
      );
    });

    test("rejectReschedule routes an offline room conflict to admin approval", async () => {
      const booking = makeRescheduleBooking({
        modality: "offline",
        previousState: "scheduled",
      });
      const proposal = {
        id: "r1",
        bookingId: "b1",
        proposedBy: "tutor1",
        proposedStartAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        proposedEndAt: new Date(Date.now() + 72 * 60 * 60 * 1000 + 3600_000),
        status: "pending",
      };
      const { service, roomPort, repo } = createService({
        repo: {
          findBookingById: mock(async () => ({ ...booking, version: 1 })),
          findPendingRescheduleProposal: mock(async () => proposal),
          updateBookingVersioned: mock(
            async (_conn: any, _id: any, ver: number, updates: any) => ({
              updated: {
                ...booking,
                ...updates,
                version: ver + 1,
              },
              newVersion: ver + 1,
            }),
          ),
        },
        roomPort: {
          syncRoomBookingScheduleForBooking: mock(
            async () => "conflict" as const,
          ),
        },
      });

      const result = await service.rejectReschedule("student1", "b1");

      expect(result.currentState).toBe("awaiting_admin_room_approval");
      expect(repo.updateBookingVersioned).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        1,
        expect.objectContaining({
          currentState: "awaiting_admin_room_approval",
        }),
      );
      expect(roomPort.syncRoomBookingScheduleForBooking).toHaveBeenCalledWith(
        expect.anything(),
        "b1",
        booking.scheduledStartAt,
        booking.scheduledEndAt,
      );
    });
  });

  describe("G7 session notes", () => {
    test("addSessionNote rejects when booking is not completed", async () => {
      const booking = makeBooking({ currentState: "scheduled" });
      const { service } = createService({
        repo: {
          findBookingById: mock(async () => booking),
        },
      });

      await expect(
        service.addSessionNote("student1", "b1", "great session"),
      ).rejects.toThrow(BookingNotCompletedError);
    });

    test("addSessionNote stores sanitized content on completed booking", async () => {
      const booking = makeBooking({ currentState: "completed" });
      const note = { id: "n1", bookingId: "b1", content: "ok", authorId: "t1" };
      const { service, repo } = createService({
        repo: {
          findBookingById: mock(async () => booking),
          insertSessionNote: mock(async () => note),
        },
      });

      const result = await service.addSessionNote(
        "tutor1",
        "b1",
        "<script>alert(1)</script>Great <b>session</b>",
      );

      expect(result).toEqual(note);
      expect(repo.insertSessionNote).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ content: "Great <b>session</b>" }),
      );
    });

    test("getSessionNotes rejects when booking is not completed", async () => {
      const booking = makeBooking({ currentState: "scheduled" });
      const { service } = createService({
        repo: {
          findBookingById: mock(async () => booking),
        },
      });

      await expect(service.getSessionNotes("student1", "b1")).rejects.toThrow(
        BookingNotCompletedError,
      );
    });

    test("getSessionNotes returns notes for a completed booking", async () => {
      const booking = makeBooking({ currentState: "completed" });
      const notes = [{ id: "n1", bookingId: "b1", content: "ok" }];
      const { service } = createService({
        repo: {
          findBookingById: mock(async () => booking),
          listSessionNotes: mock(async () => notes),
        },
      });

      const result = await service.getSessionNotes("student1", "b1");
      expect(result).toEqual(notes);
    });
  });
});

describe("BookingService additional coverage paths", () => {
  test("rejects cancellation by an authorized tutor who is not the proposer", async () => {
    const { service } = createService({
      repo: {
        findBookingById: mock(async () => makeBooking()),
        findParticipant: mock(async () =>
          makeParticipant({ userId: "tutor1", role: "tutor" }),
        ),
      },
    });

    await expect(service.cancel("tutor1", "b1")).rejects.toThrow(
      BookingNotOwnedError,
    );
  });

  test("covers tutor accept recovery when the confirmed transition fails", async () => {
    const booking = makeBooking();
    let findCall = 0;
    const { service } = createService({
      repo: {
        findBookingById: mock(async () => {
          findCall += 1;
          if (findCall === 3) throw new Error("refresh failed");
          return booking;
        }),
      },
      meeting: {
        createEvent: mock(async () => {
          throw new Error("meeting provider unavailable");
        }),
      },
    });

    await expect(service.tutorAccept("b1", "tutor1")).resolves.toEqual(booking);
  });

  test("rejects tutor decline outside the tutor-review state", async () => {
    const { service } = createService({
      repo: {
        findBookingById: mock(async () =>
          makeBooking({ currentState: "confirmed" }),
        ),
      },
    });

    await expect(service.tutorDecline("b1", "tutor1")).rejects.toThrow(
      BookingNotAwaitingReviewError,
    );
  });

  test("rejects completing a series whose parent is not scheduled", async () => {
    const { service } = createService({
      repo: {
        findBookingById: mock(async () =>
          makeBooking({ type: "series", currentState: "confirmed" }),
        ),
      },
    });

    await expect(service.completeSession("b1", "tutor1", "s1")).rejects.toThrow(
      BookingStateTransitionError,
    );
  });

  test("rejects completing a session that belongs to another booking", async () => {
    const { service } = createService({
      repo: {
        findBookingById: mock(async () =>
          makeBooking({ type: "series", currentState: "scheduled" }),
        ),
        findSessionById: mock(async () => ({
          id: "s1",
          seriesBookingId: "other-booking",
          currentState: "scheduled",
          scheduledStartAt: new Date(Date.now() - 60 * 60 * 1000),
          scheduledEndAt: new Date(Date.now() + 30 * 60 * 1000),
          holdAmount: 42,
        })),
      },
    });

    await expect(service.completeSession("b1", "tutor1", "s1")).rejects.toThrow(
      BookingSessionNotFoundError,
    );
  });

  test("releases residual holds when a group series completes", async () => {
    const booking = makeBooking({
      type: "series",
      targetGroupSize: 3,
      currentState: "scheduled",
      holdAmount: 100,
      scheduledStartAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    const session = {
      id: "s1",
      seriesBookingId: "b1",
      currentState: "scheduled",
      scheduledStartAt: new Date(Date.now() - 60 * 60 * 1000),
      scheduledEndAt: new Date(Date.now() + 30 * 60 * 1000),
      holdAmount: 50,
      priceSnapshot: null,
    };
    const participants = [
      makeParticipant({ id: "p1", userId: "student1", heldAmount: 60 }),
      makeParticipant({ id: "p2", userId: "student2", heldAmount: 50 }),
    ];
    let participantCall = 0;
    const { service, wallet, repo } = createService({
      repo: {
        findBookingById: mock(async () => booking),
        findSessionById: mock(async () => session),
        findConfirmedParticipants: mock(async () => {
          participantCall += 1;
          return participantCall === 1
            ? participants
            : [
                makeParticipant({
                  id: "p1",
                  userId: "student1",
                  heldAmount: 10,
                }),
              ];
        }),
        listSessionsBySeriesId: mock(async () => [
          { ...session, currentState: "completed" },
        ]),
        updateBookingVersioned: mock(async () => ({
          updated: { ...booking, currentState: "completed" },
          newVersion: 2,
        })),
      },
      wallet: {
        ...makeWallet(),
        getByUserId: mock(async (_db: unknown, userId: string) => ({
          id: `wallet-${userId}`,
          totalBalance: 100,
          heldBalance: 60,
          availableBalance: 40,
        })),
      },
    });

    await service.completeSession("b1", "tutor1", "s1");

    expect(wallet.release).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        walletId: "wallet-student1",
        amount: 10,
        reason: "Group series completed: released residual hold",
      }),
    );
    expect(repo.updateParticipantState).toHaveBeenCalledWith(
      expect.anything(),
      "p1",
      { heldAmount: 0 },
    );
  });

  test("rejects cancelling a series session for a non-proposer", async () => {
    const { service } = createService({
      repo: {
        findSessionById: mock(async () => ({
          id: "s1",
          seriesBookingId: "b1",
          currentState: "scheduled",
          scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
          scheduledEndAt: new Date(Date.now() + 49 * 60 * 60 * 1000),
        })),
        findBookingById: mock(async () =>
          makeBooking({ type: "series", currentState: "scheduled" }),
        ),
      },
    });

    await expect(service.cancelSession("tutor1", "s1")).rejects.toThrow(
      BookingNotOwnedError,
    );
  });

  test("rejects cancelling a series session that is not scheduled", async () => {
    const { service } = createService({
      repo: {
        findSessionById: mock(async () => ({
          id: "s1",
          seriesBookingId: "b1",
          currentState: "completed",
          scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
          scheduledEndAt: new Date(Date.now() + 49 * 60 * 60 * 1000),
        })),
        findBookingById: mock(async () =>
          makeBooking({ type: "series", currentState: "scheduled" }),
        ),
      },
    });

    await expect(service.cancelSession("student1", "s1")).rejects.toThrow(
      BookingStateTransitionError,
    );
  });

  test("rejects no-show marking when the session is no longer scheduled", async () => {
    const { service } = createService({
      repo: {
        findBookingById: mock(async () =>
          makeBooking({ type: "series", currentState: "scheduled" }),
        ),
        findParticipant: mock(async () => makeParticipant()),
        findSessionById: mock(async () => ({
          id: "s1",
          seriesBookingId: "b1",
          currentState: "completed",
          scheduledStartAt: new Date(Date.now() - 60 * 60 * 1000),
          scheduledEndAt: new Date(Date.now() - 30 * 60 * 1000),
          holdAmount: 42,
        })),
      },
    });

    await expect(
      service.markParticipantNoShow("b1", "tutor1", "student1", "s1"),
    ).rejects.toThrow(BookingStateTransitionError);
  });

  test("rejects a series reschedule for an unknown session", async () => {
    const start = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const { service } = createService({
      repo: {
        findBookingById: mock(async () => makeBooking()),
        findSessionById: mock(async () => null),
      },
    });

    await expect(
      service.proposeReschedule(
        "tutor1",
        "b1",
        start,
        new Date(start.getTime() + 90 * 60 * 1000),
        undefined,
        undefined,
        "s1",
      ),
    ).rejects.toThrow(BookingSessionNotFoundError);
  });

  test("supersedes an existing reschedule proposal", async () => {
    const booking = makeBooking({ currentState: "reschedule_proposed" });
    const pending = {
      id: "old-proposal",
      sessionId: null,
      proposedStartAt: new Date(Date.now() + 96 * 60 * 60 * 1000),
    };
    const start = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const { service, repo } = createService({
      repo: {
        findBookingById: mock(async () => booking),
        findPendingRescheduleProposal: mock(async () => pending),
        findConfirmedParticipants: mock(async () => []),
      },
    });

    await service.proposeReschedule(
      "tutor1",
      "b1",
      start,
      new Date(start.getTime() + 90 * 60 * 1000),
    );

    expect(repo.updateRescheduleProposal).toHaveBeenCalledWith(
      expect.anything(),
      "old-proposal",
      expect.objectContaining({ status: "superseded" }),
    );
  });

  test("rejects accepting a reschedule with the wrong proposal id", async () => {
    const booking = makeBooking({ currentState: "reschedule_proposed" });
    const { service } = createService({
      repo: {
        findBookingById: mock(async () => booking),
        findPendingRescheduleProposal: mock(async () => ({ id: "r1" })),
      },
    });

    await expect(
      service.acceptReschedule("student1", "b1", "wrong"),
    ).rejects.toThrow(BookingRescheduleNotFoundError);
  });

  test("rejects accepting a reschedule when the caller is absent from decisions", async () => {
    const booking = makeBooking({ currentState: "reschedule_proposed" });
    const { service } = createService({
      repo: {
        findBookingById: mock(async () => booking),
        findPendingRescheduleProposal: mock(async () => ({
          id: "r1",
          decisions: { tutor1: "accepted", student2: "pending" },
        })),
      },
    });

    await expect(
      service.acceptReschedule("student1", "b1", "r1"),
    ).rejects.toThrow(BookingNotOwnedError);
  });

  test("rejects rejecting a reschedule outside the proposed state", async () => {
    const { service } = createService({
      repo: {
        findBookingById: mock(async () =>
          makeBooking({ currentState: "scheduled" }),
        ),
      },
    });

    await expect(service.rejectReschedule("student1", "b1")).rejects.toThrow(
      BookingRescheduleNotPendingError,
    );
  });

  test("rejects rejecting a reschedule with a stale proposal id", async () => {
    const { service } = createService({
      repo: {
        findBookingById: mock(async () =>
          makeBooking({ currentState: "reschedule_proposed" }),
        ),
        findPendingRescheduleProposal: mock(async () => ({ id: "r1" })),
      },
    });

    await expect(
      service.rejectReschedule("student1", "b1", "wrong"),
    ).rejects.toThrow(BookingRescheduleNotFoundError);
  });

  test("rejects rejecting a reschedule when caller has no decision", async () => {
    const { service } = createService({
      repo: {
        findBookingById: mock(async () =>
          makeBooking({ currentState: "reschedule_proposed" }),
        ),
        findPendingRescheduleProposal: mock(async () => ({
          id: "r1",
          decisions: { tutor1: "accepted", student2: "pending" },
        })),
      },
    });

    await expect(
      service.rejectReschedule("student1", "b1", "r1"),
    ).rejects.toThrow(BookingNotOwnedError);
  });

  test("aggregates completed series session payout snapshots", async () => {
    const series = makeBooking({
      id: "series-1",
      type: "series",
      priceSnapshot: { baseline: 100, cogitoTake: 20, tutorShare: 80 },
    });
    const solo = makeBooking({
      id: "solo-1",
      type: "solo",
      priceSnapshot: { baseline: 50, cogitoTake: 10, tutorShare: 40 },
    });
    const { service } = createService({
      repo: {
        findCompletedBookingsByTutor: mock(async () => [series, solo]),
        listSessionsBySeriesId: mock(async () => [
          {
            currentState: "completed",
            priceSnapshot: {
              baseline: 90,
              actualMarksPooled: 90,
              cogitoTake: 18,
              tutorShare: 72,
              tutorHonorariumIdr: 360_000,
            },
          },
        ]),
      },
    });

    await expect(
      service.getTutorPayouts({ tutorId: "tutor1" }),
    ).resolves.toEqual({
      completedSessions: 2,
      totalMarks: 140,
      cogitoTake: 28,
      tutorPayout: 112,
      tutorPayoutIdr: 640_000,
    });
  });

  test("falls back to the series booking snapshot when no session rows are completed", async () => {
    const series = makeBooking({
      id: "series-without-rows",
      type: "series",
      priceSnapshot: {
        baseline: 100,
        cogitoTake: 20,
        tutorShare: 80,
        tutorHonorariumIdr: 81_000,
      },
    });
    const { service } = createService({
      repo: {
        findCompletedBookingsByTutor: mock(async () => [series]),
        listSessionsBySeriesId: mock(async () => []),
      },
    });

    await expect(
      service.getTutorPayouts({ tutorId: "tutor1" }),
    ).resolves.toEqual({
      completedSessions: 1,
      totalMarks: 100,
      cogitoTake: 20,
      tutorPayout: 80,
      tutorPayoutIdr: 81_000,
    });
  });

  test("reports totalMarks from the split basis (baseline), not actualMarksPooled", async () => {
    const solo = makeBooking({
      id: "solo-ledger",
      type: "solo",
      priceSnapshot: {
        baseline: 100,
        actualMarksPooled: 102,
        cogitoTake: 20,
        tutorShare: 80,
        tutorHonorariumIdr: 400_000,
      },
    });
    const { service } = createService({
      repo: {
        findCompletedBookingsByTutor: mock(async () => [solo]),
        listSessionsBySeriesId: mock(async () => []),
      },
    });

    const result = await service.getTutorPayouts({ tutorId: "tutor1" });
    // The ledger columns reconcile: totalMarks = cogitoTake + tutorPayout
    // (both are derived from the same `baseline` split basis).
    expect(result.totalMarks).toBe(result.cogitoTake + result.tutorPayout);
    expect(result.totalMarks).toBe(100);
    // IDR honorarium is authoritative when present.
    expect(result.tutorPayoutIdr).toBe(400_000);
  });

  test("reconciles series session payouts the same way (baseline basis, not pooled)", async () => {
    const series = makeBooking({
      id: "series-ledger",
      type: "series",
      priceSnapshot: { baseline: 100, cogitoTake: 20, tutorShare: 80 },
    });
    const { service } = createService({
      repo: {
        findCompletedBookingsByTutor: mock(async () => [series]),
        listSessionsBySeriesId: mock(async () => [
          {
            currentState: "completed",
            priceSnapshot: {
              baseline: 60,
              actualMarksPooled: 62,
              cogitoTake: 14,
              tutorShare: 46,
              tutorHonorariumIdr: 230_000,
            },
          },
        ]),
      },
    });

    const result = await service.getTutorPayouts({ tutorId: "tutor1" });
    expect(result.totalMarks).toBe(result.cogitoTake + result.tutorPayout);
    expect(result.totalMarks).toBe(60);
    expect(result.tutorPayoutIdr).toBe(230_000);
  });

  test("cancels sessions for an expiring series booking", async () => {
    const expiring = makeBooking({
      type: "series",
      currentState: "awaiting_tutor_review",
      holdAmount: 42,
    });
    const { service, repo } = createService({
      repo: {
        findBookingsExpiringByDeadline: mock(async () => [expiring]),
        findBookingById: mock(async () => ({ ...expiring, version: 1 })),
        findConfirmedParticipants: mock(async () => [
          makeParticipant({ heldAmount: 42 }),
        ]),
        updateBookingVersioned: mock(async () => ({
          updated: { ...expiring, currentState: "expired" },
          newVersion: 2,
        })),
      },
    });

    await service.expireBookings();
    expect(repo.cancelAllSessions).toHaveBeenCalledWith(
      expect.anything(),
      "b1",
    );
  });

  test("logs and survives provider cleanup failure during meeting retry", async () => {
    const candidate = makeBooking({
      id: "retry-cleanup",
      currentState: "confirmed",
    });
    const { service, meeting } = createService({
      repo: {
        findConfirmedMeetingsPendingRetry: mock(async () => [candidate]),
        findBookingById: mock(async () => candidate),
      },
      meeting: {
        createEvent: mock(async () => {
          throw new Error("provider unavailable");
        }),
        cancelEvent: mock(async () => {
          throw new Error("cleanup unavailable");
        }),
      },
    });

    await expect(service.retryFailedMeetings()).resolves.toEqual({
      succeeded: 0,
      failed: 1,
    });
    expect(meeting.cancelEvent).toHaveBeenCalledWith("retry-cleanup");
  });
});

describe("retryFailedMeetings", () => {
  const confirmedBooking = makeBooking({
    id: "b-meet",
    currentState: "confirmed",
    modality: "online",
    scheduledStartAt: new Date(Date.now() + 86400_000),
    scheduledEndAt: new Date(Date.now() + 86400_000 + 90 * 60_000),
  });

  test("leaves the booking CONFIRMED when meeting creation still fails", async () => {
    const { service } = createService({
      repo: {
        findConfirmedMeetingsPendingRetry: mock(async () => [confirmedBooking]),
        findBookingById: mock(async () => ({
          ...confirmedBooking,
          currentState: "confirmed",
        })),
      },
      meeting: {
        createEvent: mock(async () => ({
          id: "m1",
          bookingId: "b-meet",
          provider: "google_meet",
          externalEventId: null,
          meetingUrl: null,
          status: "failed",
          errorReason: "provider down",
        })),
      },
    });

    const result = await service.retryFailedMeetings();
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(1);
  });

  test("schedules the booking and notifies when meeting creation succeeds", async () => {
    const { service, repo, notification, meeting } = createService({
      repo: {
        findConfirmedMeetingsPendingRetry: mock(async () => [confirmedBooking]),
        findBookingById: mock(async () => confirmedBooking),
        findConfirmedParticipants: mock(async () => [
          {
            id: "p1",
            bookingId: "b-meet",
            userId: "student1",
            role: "proposer",
            confirmationState: "confirmed",
            heldAmount: 42,
          },
        ]),
        findUserEmails: mock(async () => [
          { email: "tutor@cogito.test", name: "Tutor" },
          { email: "student@cogito.test", name: "Student" },
        ]),
      },
      meeting: {
        createEvent: mock(async () => ({
          id: "m1",
          bookingId: "b-meet",
          provider: "google_meet",
          externalEventId: "ext1",
          meetingUrl: "https://meet.google.com/abc",
          status: "created",
          errorReason: null,
        })),
      },
    });

    const result = await service.retryFailedMeetings();
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    expect(repo.updateBookingVersioned).toHaveBeenCalled();
    expect(notification.writeBestEffort).toHaveBeenCalled();
    expect(meeting.createEvent).toHaveBeenCalledTimes(1);
  });

  test("returns zeroes when no bookings need retry", async () => {
    const { service } = createService({
      repo: {
        findConfirmedMeetingsPendingRetry: mock(async () => []),
      },
    });

    const result = await service.retryFailedMeetings();
    expect(result).toEqual({ succeeded: 0, failed: 0 });
  });
});

describe("cancelOfflineBooking (M6)", () => {
  test("cancels an awaiting-room-approval booking: releases holds, zeroes hold, transitions, records reason", async () => {
    const booking = makeBooking({
      currentState: "awaiting_admin_room_approval",
      holdAmount: 42,
      proposerId: "student1",
    });
    const { service, repo, wallet } = createService({
      repo: {
        findBookingById: mock(async () => ({ ...booking, version: 1 })),
        findConfirmedParticipants: mock(async () => [
          makeParticipant({ heldAmount: 42 }),
        ]),
        updateBookingVersioned: mock(async () => ({
          updated: { ...booking, currentState: "cancelled" },
          newVersion: 2,
        })),
      },
    });

    await service.cancelOfflineBooking({} as any, "b1", "admin1");

    expect(wallet.release).toHaveBeenCalledTimes(1);
    expect(repo.updateBookingHoldAmount).toHaveBeenCalledWith(
      expect.anything(),
      "b1",
      0,
    );
    expect(repo.updateBookingVersioned).toHaveBeenCalledWith(
      expect.anything(),
      "b1",
      1,
      expect.objectContaining({ currentState: "cancelled" }),
    );
    expect(repo.updateBookingCancellationReason).toHaveBeenCalledWith(
      expect.anything(),
      "b1",
      "No room available",
    );
  });

  test("is a no-op for a booking no longer awaiting room approval (SCHEDULED)", async () => {
    const booking = makeBooking({
      currentState: "scheduled",
      holdAmount: 42,
      proposerId: "student1",
    });
    const { service, repo, wallet } = createService({
      repo: {
        findBookingById: mock(async () => ({ ...booking, version: 1 })),
      },
    });

    await service.cancelOfflineBooking({} as any, "b1", "admin1");

    expect(wallet.release).not.toHaveBeenCalled();
    expect(repo.updateBookingVersioned).not.toHaveBeenCalled();
  });
});

describe("BookingService coverage paths", () => {
  test("listForTutor applies the page limit and returns a composite cursor", async () => {
    const rows = [
      { id: "b1", scheduledStartAt: new Date("2026-08-24T10:00:00.000Z") },
      { id: "b2", scheduledStartAt: new Date("2026-08-24T11:00:00.000Z") },
      { id: "b3", scheduledStartAt: new Date("2026-08-24T12:00:00.000Z") },
    ];
    const { service, repo } = createService({
      repo: { listBookingsByTutor: mock(async () => rows) },
    });

    const result = await service.listForTutor("tutor1", {
      limit: 2,
      states: ["confirmed"],
      cursor: "2026-08-23T10:00:00.000Z|old",
    });

    expect(result.items).toEqual(rows.slice(0, 2));
    expect(result.nextCursor).toBe("2026-08-24T11:00:00.000Z|b2");
    expect(repo.listBookingsByTutor).toHaveBeenCalledWith("tutor1", {
      states: ["confirmed"],
      limit: 2,
      cursor: "2026-08-23T10:00:00.000Z|old",
    });
  });

  test("rejects an IDR booking when the economy pricing port is unavailable", async () => {
    const input = {
      tutorId: "tutor1",
      availabilitySlotId: "slot1",
      modality: "online" as const,
      scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      scheduledEndAt: new Date(
        Date.now() + 48 * 60 * 60 * 1000 + 90 * 60 * 1000,
      ),
      timezone: "Asia/Jakarta",
    };
    const { service } = createService({
      repo: {
        findTutorProfile: mock(async () =>
          makeTutorProfile({ baseRatesIdr: { online: 125_000 } }),
        ),
        findAvailabilitySlot: mock(async () => makeSlot()),
        findOverlappingBookings: mock(async () => []),
      },
    });

    await expect(service.createSolo("student1", input)).rejects.toThrow(
      "IDR pricing is not configured",
    );
  });

  test("preserves IDR snapshot economics while repricing online and offline groups", async () => {
    const previousSnapshot = {
      perStudent: 100,
      baseline: 100,
      tutorShare: 80,
      cogitoTake: 20,
      economyVersion: 7,
      tutorBaseRateIdr: 125_000,
      markValueIdr: 1_000,
      tutorIncrementIdr: 5_000,
      cogitoBaseTakeIdr: 20_000,
      cogitoIncrementIdr: 2_000,
    };
    const economy = {
      version: 9,
      markValueIdr: 2_000,
      onlineTutorIncrementIdr: 10_000,
      offlineTutorIncrementIdr: 12_000,
      onlineCogitoBaseIdr: 30_000,
      offlineCogitoBaseIdr: 35_000,
      onlineCogitoIncrementIdr: 3_000,
      offlineCogitoIncrementIdr: 4_000,
    };
    const computeEconomics = mock(
      (
        _modality: string,
        _baseRateIdr: number,
        _groupSize: number,
        _config: unknown,
      ) => previousSnapshot,
    );

    for (const modality of ["online", "offline"] as const) {
      const booking = makeBooking({
        type: "group",
        modality,
        targetGroupSize: 3,
        currentState: "confirmed",
        priceSnapshot: previousSnapshot,
      });
      const { service } = createService({
        repo: {
          findBookingById: mock(async () => booking),
          findParticipant: mock(async () =>
            makeParticipant({ heldAmount: 100 }),
          ),
          findConfirmedParticipants: mock(async () => [
            makeParticipant({ id: "p2", userId: "student2", heldAmount: 100 }),
            makeParticipant({ id: "p3", userId: "student3", heldAmount: 100 }),
          ]),
          findTutorProfile: mock(async () =>
            makeTutorProfile({
              baseRatesIdr: { online: 125_000, offline: 150_000 },
            }),
          ),
        },
        pricing: {
          getEconomyConfig: mock(async () => economy),
          computeEconomics,
        },
      });

      await service.withdraw("student1", "b1");
    }

    expect(computeEconomics).toHaveBeenCalledTimes(2);
    expect(computeEconomics.mock.calls[0]?.[3]).toEqual(
      expect.objectContaining({
        version: 7,
        markValueIdr: 1_000,
        onlineTutorIncrementIdr: 5_000,
        onlineCogitoBaseIdr: 20_000,
        onlineCogitoIncrementIdr: 2_000,
      }),
    );
    expect(computeEconomics.mock.calls[1]?.[3]).toEqual(
      expect.objectContaining({
        version: 7,
        markValueIdr: 1_000,
        offlineTutorIncrementIdr: 5_000,
        offlineCogitoBaseIdr: 20_000,
        offlineCogitoIncrementIdr: 2_000,
      }),
    );
  });

  test("rejects a group booking when the tutor slot overlaps an existing booking", async () => {
    const input = {
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
    const { service } = createService({
      repo: {
        findTutorProfile: mock(async () => makeTutorProfile()),
        findAvailabilitySlot: mock(async () => makeSlot()),
        findUsersByIds: mock(async () => [
          { id: "student2" },
          { id: "student3" },
        ]),
        findOverlappingBookings: mock(async () => [{ id: "existing" }]),
      },
    });

    await expect(service.createGroup("student1", input)).rejects.toThrow(
      BookingConflictError,
    );
  });

  test("requests a room when creating an offline group booking", async () => {
    const input = {
      tutorId: "tutor1",
      availabilitySlotId: "slot1",
      modality: "offline" as const,
      requestedRoomId: "room1",
      targetGroupSize: 3,
      inviteeUserIds: ["student2", "student3"],
      scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      scheduledEndAt: new Date(
        Date.now() + 48 * 60 * 60 * 1000 + 90 * 60 * 1000,
      ),
      timezone: "Asia/Jakarta",
    };
    const { service, roomPort } = createService({
      repo: {
        findTutorProfile: mock(async () => makeTutorProfile()),
        findAvailabilitySlot: mock(async () => makeSlot()),
        findUsersByIds: mock(async () => [
          { id: "student2" },
          { id: "student3" },
        ]),
        findOverlappingBookings: mock(async () => []),
        insertBooking: mock(async () =>
          makeBooking({
            type: "group",
            modality: "offline",
            targetGroupSize: 3,
          }),
        ),
      },
    });

    const result = await service.createGroup("student1", input);

    expect(result).toMatchObject({ roomRequested: true, roomConflict: false });
    expect(roomPort.requestRoomForBooking).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ roomId: "room1" }),
    );
  });

  test("withdrawInvite validates state, ownership, booking type, role, and confirmation", async () => {
    const call = async (
      booking: Record<string, unknown>,
      participant?: Record<string, unknown>,
    ) => {
      const { service } = createService({
        repo: {
          findBookingById: mock(async () => makeBooking(booking)),
          findParticipant: mock(async () => participant ?? makeParticipant()),
        },
      });
      return service.withdrawInvite("student1", "b1", "student2");
    };

    await expect(call({ currentState: "confirmed" })).rejects.toThrow(
      BookingNotAwaitingConfirmationError,
    );
    await expect(
      call({
        currentState: "awaiting_participant_confirmation",
        proposerId: "other",
      }),
    ).rejects.toThrow(BookingNotOwnedError);
    await expect(
      call({
        currentState: "awaiting_participant_confirmation",
        type: "solo",
      }),
    ).rejects.toThrow(BookingNotEditableError);
    await expect(
      call(
        { currentState: "awaiting_participant_confirmation", type: "group" },
        makeParticipant({ role: "proposer", userId: "student2" }),
      ),
    ).rejects.toThrow(BookingNotEditableError);
    await expect(
      call(
        { currentState: "awaiting_participant_confirmation", type: "group" },
        makeParticipant({
          role: "invitee",
          userId: "student2",
          confirmationState: "confirmed",
        }),
      ),
    ).rejects.toThrow(BookingParticipantAlreadyConfirmedError);
  });

  test("withdrawInvite escapes the reason interpolated into the notification body", async () => {
    const { service, notification } = createService({
      repo: {
        findBookingById: mock(async () =>
          makeBooking({
            currentState: "awaiting_participant_confirmation",
            type: "group",
          }),
        ),
        findParticipant: mock(async () =>
          makeParticipant({
            role: "invitee",
            userId: "student2",
            confirmationState: "pending",
          }),
        ),
      },
    });

    await service.withdrawInvite(
      "student1",
      "b1",
      "student2",
      "<script>alert(1)</script>",
    );

    const calls = notification.writeBestEffort.mock.calls;
    expect(calls.length).toBe(1);
    const body = calls[0]![0].body as string;
    expect(body).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(body).not.toContain("<script>");
  });

  test("cancels an unknown booking type defensively during withdraw", async () => {
    const booking = makeBooking({
      type: "future_booking_type",
      currentState: "awaiting_tutor_review",
      proposerId: "student1",
    });
    const { service, repo } = createService({
      repo: {
        findBookingById: mock(async () => booking),
        findParticipant: mock(async () => makeParticipant()),
        findConfirmedParticipants: mock(async () => []),
      },
    });

    await expect(service.withdraw("student1", "b1")).resolves.toEqual({
      withdrawn: true,
      late: false,
    });
    expect(repo.updateBookingVersioned).toHaveBeenCalledWith(
      expect.anything(),
      "b1",
      1,
      expect.objectContaining({ currentState: "cancelled" }),
    );
  });

  test("rejects a series when the proposer cannot fund all sessions", async () => {
    const input = {
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
          totalBalance: 1,
          heldBalance: 0,
          availableBalance: 1,
        })),
      },
    });

    await expect(service.createSeries("student1", input)).rejects.toThrow(
      InsufficientMarksError,
    );
  });

  test("validates group-series session count, invitees, funding, and overlap", async () => {
    const session = (days: number) => ({
      scheduledStartAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      scheduledEndAt: new Date(
        Date.now() + days * 24 * 60 * 60 * 1000 + 90 * 60 * 1000,
      ),
    });
    const baseInput = {
      tutorId: "tutor1",
      availabilitySlotId: "slot1",
      modality: "online" as const,
      targetGroupSize: 3,
      inviteeUserIds: ["student2", "student3"],
      sessions: [session(2), session(4)],
      timezone: "Asia/Jakarta",
    };

    const expectNotEditable = async (input: typeof baseInput) => {
      const { service } = createService({
        repo: {
          findTutorProfile: mock(async () => makeTutorProfile()),
          findAvailabilitySlot: mock(async () => makeSlot()),
        },
      });
      await expect(
        service.createGroupSeries("student1", input),
      ).rejects.toThrow(BookingNotEditableError);
    };

    const { service: tooShort } = createService({
      repo: {
        findTutorProfile: mock(async () => makeTutorProfile()),
      },
    });
    await expect(
      tooShort.createGroupSeries("student1", {
        ...baseInput,
        sessions: [baseInput.sessions[0]!],
      }),
    ).rejects.toThrow(BookingSeriesSizeError);

    await expectNotEditable({
      ...baseInput,
      inviteeUserIds: ["student2", "student2"],
    });
    await expectNotEditable({
      ...baseInput,
      inviteeUserIds: ["student1", "student2"],
    });
    await expectNotEditable({
      ...baseInput,
      targetGroupSize: 2,
      inviteeUserIds: ["student2", "student3"],
    });

    const { service: underfunded } = createService({
      repo: {
        findTutorProfile: mock(async () => makeTutorProfile()),
        findAvailabilitySlot: mock(async () => makeSlot()),
        findUsersByIds: mock(async () => [
          { id: "student2" },
          { id: "student3" },
        ]),
      },
      wallet: {
        ...makeWallet(),
        getByUserId: mock(async () => ({
          id: "w1",
          totalBalance: 1,
          heldBalance: 0,
          availableBalance: 1,
        })),
      },
    });
    await expect(
      underfunded.createGroupSeries("student1", baseInput),
    ).rejects.toThrow(InsufficientMarksError);

    const { service: overlapping } = createService({
      repo: {
        findTutorProfile: mock(async () => makeTutorProfile()),
        findAvailabilitySlot: mock(async () => makeSlot()),
        findUsersByIds: mock(async () => [
          { id: "student2" },
          { id: "student3" },
        ]),
        findOverlappingBookings: mock(async () => [{ id: "existing" }]),
      },
    });
    await expect(
      overlapping.createGroupSeries("student1", baseInput),
    ).rejects.toThrow(BookingConflictError);
  });

  test("uses the IDR economy pricing snapshot when creating a solo booking", async () => {
    const input = {
      tutorId: "tutor1",
      availabilitySlotId: "slot1",
      modality: "online" as const,
      scheduledStartAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      scheduledEndAt: new Date(
        Date.now() + 48 * 60 * 60 * 1000 + 90 * 60 * 1000,
      ),
      timezone: "Asia/Jakarta",
    };
    const snapshot = {
      perStudent: 125_000,
      baseline: 125_000,
      tutorShare: 100_000,
      cogitoTake: 25_000,
      baselineCogitoTake: 25_000,
      baselineTutorShare: 100_000,
      extraTotal: 0,
      cogitoExtraTake: 0,
      tutorExtraShare: 0,
      economyVersion: 3,
      tutorBaseRateIdr: 125_000,
      markValueIdr: 1_000,
      tutorIncrementIdr: 0,
      cogitoBaseTakeIdr: 25_000,
      cogitoIncrementIdr: 0,
    };
    const getEconomyConfig = mock(async () => ({
      version: 3,
      markValueIdr: 1_000,
      onlineTutorIncrementIdr: 0,
      offlineTutorIncrementIdr: 0,
      onlineCogitoBaseIdr: 25_000,
      offlineCogitoBaseIdr: 25_000,
      onlineCogitoIncrementIdr: 0,
      offlineCogitoIncrementIdr: 0,
    }));
    const computeEconomics = mock(() => snapshot);
    const booking = makeBooking({ priceSnapshot: snapshot });
    const { service, repo } = createService({
      repo: {
        findTutorProfile: mock(async () =>
          makeTutorProfile({ baseRatesIdr: { online: 125_000 } }),
        ),
        findAvailabilitySlot: mock(async () => makeSlot()),
        findOverlappingBookings: mock(async () => []),
        insertBooking: mock(async () => booking),
      },
      pricing: { getEconomyConfig, computeEconomics },
      wallet: {
        ...makeWallet(),
        getByUserId: mock(async () => ({
          id: "w1",
          totalBalance: 500_000,
          heldBalance: 0,
          availableBalance: 500_000,
        })),
      },
    });

    await service.createSolo("student1", input);

    expect(getEconomyConfig).toHaveBeenCalledTimes(1);
    expect(computeEconomics).toHaveBeenCalledWith(
      "online",
      125_000,
      1,
      expect.objectContaining({ version: 3, markValueIdr: 1_000 }),
    );
    expect(repo.insertBooking).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ priceSnapshot: snapshot }),
    );
  });

  test("rejects a solo booking that does not fit the tutor availability window", async () => {
    const start = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const input = {
      tutorId: "tutor1",
      availabilitySlotId: "slot1",
      modality: "online" as const,
      scheduledStartAt: start,
      scheduledEndAt: new Date(start.getTime() + 90 * 60 * 1000),
      timezone: "Asia/Jakarta",
    };
    const { service } = createService({
      repo: {
        findTutorProfile: mock(async () => makeTutorProfile()),
        findAvailabilitySlot: mock(async () =>
          makeSlot({ endDate: new Date(start.getTime() + 60 * 60 * 1000) }),
        ),
      },
    });

    await expect(service.createSolo("student1", input)).rejects.toThrow(
      BookingNotEditableError,
    );
  });

  test("rejects rescheduling a terminal booking", async () => {
    const { service } = createService({
      repo: {
        findBookingById: mock(async () =>
          makeBooking({ currentState: "completed" }),
        ),
      },
    });
    const start = new Date(Date.now() + 48 * 60 * 60 * 1000);

    await expect(
      service.proposeReschedule(
        "student1",
        "b1",
        start,
        new Date(start.getTime() + 90 * 60 * 1000),
      ),
    ).rejects.toThrow(BookingStateTransitionError);
  });

  test("counts a retry transaction failure as a failed meeting", async () => {
    const candidate = makeBooking({
      id: "retry-failure",
      currentState: "confirmed",
      modality: "online",
    });
    const { service, db } = createService({
      repo: {
        findConfirmedMeetingsPendingRetry: mock(async () => [candidate]),
      },
    });
    db.transaction = mock(async () => {
      throw new Error("transaction unavailable");
    });

    await expect(service.retryFailedMeetings()).resolves.toEqual({
      succeeded: 0,
      failed: 1,
    });
  });
});
