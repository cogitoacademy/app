import { describe, test, expect, mock } from "bun:test";
import { createBookingService } from "../../modules/booking/booking.service";
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
      expect(result.nextCursor).toBe(
        new Date("2025-01-01T00:00:00Z").toISOString(),
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
      expect(result.nextCursor).toBe(
        new Date("2025-01-01T00:00:00Z").toISOString(),
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
      expect(result.disclaimer).toContain("Group series bookings");
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
      );
      expect(notification.write).toHaveBeenCalledTimes(1);
      expect(notification.write.mock.calls[0][0].title).toBe(
        "Booking accepted",
      );
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
      const { service, meeting } = createService({
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
        scheduledStartAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
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
        "The session was marked as no-show and held marks were released.",
      );
      expect(tutorNotif[0].title).toBe("Session marked as no-show");
      expect(tutorNotif[0].body).toBe(
        "The session was marked as no-show and held marks were released.",
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
    test("auto-cancels scheduled booking with unknown tutor attendance", async () => {
      const candidate = makeBooking({
        currentState: "scheduled",
        holdAmount: 42,
        proposerId: "student1",
        tutorId: "tutor1",
        scheduledStartAt: new Date(Date.now() - 20 * 60 * 1000),
      });
      const { service, repo, notification, wallet } = createService({
        repo: {
          findBookingsWithTutorLateness: mock(async () => [candidate]),
          findTutorParticipant: mock(async () => null),
          findBookingById: mock(async () => ({ ...candidate, version: 1 })),
          findConfirmedParticipants: mock(async () => [
            makeParticipant({ heldAmount: 42 }),
          ]),
          updateBookingVersioned: mock(async () => ({
            updated: { ...candidate, currentState: "no_show" },
            newVersion: 2,
          })),
        },
      });

      const result = await service.checkTutorLateness();

      expect(result).toEqual({ autoCancelled: 1, failed: 0 });
      expect(repo.insertParticipant).toHaveBeenCalledTimes(1);
      const insertArg = repo.insertParticipant.mock.calls[0][1];
      expect(insertArg).toMatchObject({
        bookingId: "b1",
        userId: "tutor1",
        role: "tutor",
        attendanceState: "absent",
      });
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
        expect.objectContaining({ currentState: "no_show" }),
      );
      expect(notification.writeBestEffort).toHaveBeenCalledTimes(2);
    });

    test("updates existing tutor participant attendance to absent", async () => {
      const candidate = makeBooking({
        currentState: "scheduled",
        holdAmount: 0,
        proposerId: "student1",
        tutorId: "tutor1",
        scheduledStartAt: new Date(Date.now() - 20 * 60 * 1000),
      });
      const { service, repo } = createService({
        repo: {
          findBookingsWithTutorLateness: mock(async () => [candidate]),
          findTutorParticipant: mock(async () => ({
            id: "tp1",
            bookingId: "b1",
            userId: "tutor1",
            role: "tutor",
            attendanceState: "unknown",
          })),
          findConfirmedParticipants: mock(async () => []),
          updateBookingVersioned: mock(async () => ({
            updated: { ...candidate, currentState: "no_show" },
            newVersion: 2,
          })),
        },
      });

      await service.checkTutorLateness();

      expect(repo.insertParticipant).not.toHaveBeenCalled();
      expect(repo.updateParticipantState).toHaveBeenCalledWith(
        expect.anything(),
        "tp1",
        expect.objectContaining({ attendanceState: "absent" }),
      );
    });

    test("returns zero when no candidates", async () => {
      const { service } = createService();

      const result = await service.checkTutorLateness();
      expect(result).toEqual({ autoCancelled: 0, failed: 0 });
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

      let callCount = 0;
      const { service } = createService({
        repo: {
          findBookingsWithTutorLateness: mock(async () => [b1, b2]),
          findTutorParticipant: mock(async () => null),
          findBookingById: mock(async () => {
            callCount++;
            if (callCount === 1) throw new Error("DB error");
            return { ...b2, version: 1 };
          }),
          findConfirmedParticipants: mock(async () => [
            makeParticipant({ heldAmount: 30 }),
          ]),
          updateBookingVersioned: mock(async () => ({
            updated: { ...b2, currentState: "no_show" },
            newVersion: 2,
          })),
        },
      });

      const result = await service.checkTutorLateness();
      expect(result).toEqual({ autoCancelled: 1, failed: 1 });
    });
  });

  describe("markTutorAttendance", () => {
    test("throws BookingNotOwnedError when caller is not the booking tutor", async () => {
      const booking = makeBooking({ currentState: "scheduled" });
      const { service } = createService({
        repo: { findBookingById: mock(async () => booking) },
      });

      await expect(
        service.markTutorAttendance("b1", "other-tutor", "present"),
      ).rejects.toThrow(BookingNotOwnedError);
    });

    test("throws BookingStateTransitionError when booking is not scheduled", async () => {
      const booking = makeBooking({ currentState: "confirmed" });
      const { service } = createService({
        repo: { findBookingById: mock(async () => booking) },
      });

      await expect(
        service.markTutorAttendance("b1", "tutor1", "present"),
      ).rejects.toThrow(BookingStateTransitionError);
    });

    test("upserts a tutor participant with present attendance when no row exists", async () => {
      const booking = makeBooking({ currentState: "scheduled" });
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
      const booking = makeBooking({ currentState: "scheduled" });
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
    });

    describe("SCHEDULED expiry → NO_SHOW", () => {
      test("expires scheduled booking to NO_SHOW and releases holds", async () => {
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
        expect(wallet.release).toHaveBeenCalledTimes(1);
        expect(wallet.release.mock.calls[0][1]).toMatchObject({
          amount: 42,
          actorType: "system",
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

    test("withdraw repricing rolls back when a remaining participant cannot cover the increased hold", async () => {
      const booking = makeGroupBooking();
      const proposer = makeParticipant({ heldAmount: 112 });
      const remaining = [
        makeRemainingParticipant("p2", "student2", 28),
        makeRemainingParticipant("p3", "student3", 28),
      ];
      const { service, wallet } = createService({
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

      await expect(service.withdraw("student1", "b1")).rejects.toThrow(
        InsufficientMarksError,
      );
      // the transaction aborts before any repricing hold is placed
      expect(wallet.hold).not.toHaveBeenCalled();
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
      expect(result.disclaimer).toBe(
        "Group series bookings require attendance at all sessions. Individual sessions cannot be cancelled.",
      );
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
