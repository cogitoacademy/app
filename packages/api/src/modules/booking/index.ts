import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import type {
  MeetingAttendee,
  MeetingEvent,
  MeetingEventDetails,
} from "../meeting/meeting.types";
import type { AuditRecordParams } from "../audit/audit.service";
import type {
  GroupSize,
  Modality,
  PriceSnapshot,
  EconomyPriceSnapshot,
} from "../pricing/pricing.service";
import type { EconomyParameters } from "../economy";
import type { NotificationWriteParams } from "../notification/notification.service";
import type {
  WalletSnapshot,
  HoldParams,
  ReleaseParams,
  DeductParams,
} from "../wallet/wallet.service";
import { createBookingRepo } from "./booking.repo";
import { createBookingService } from "./booking.service";
import {
  createBookingHandler,
  createTutorActionsHandler,
} from "./booking.handler";
import type { BookingService } from "./booking.service";
import type { BookingHandler, TutorActionsHandler } from "./booking.handler";

export type BookingModule = ReturnType<typeof createBookingModule>;

export interface BookingWalletPort {
  hold(db: DbOrTx, params: HoldParams): Promise<WalletSnapshot>;
  release(db: DbOrTx, params: ReleaseParams): Promise<WalletSnapshot>;
  deduct(db: DbOrTx, params: DeductParams): Promise<WalletSnapshot>;
  getByUserId(db: DbOrTx, userId: string): Promise<WalletSnapshot | null>;
}

export interface BookingPricingPort {
  computeSplit(
    modality: Modality,
    tutorPricePerStudent: number,
    confirmedHeadcount: GroupSize,
  ): PriceSnapshot;
  computeEconomics?(
    modality: Modality,
    baseRateIdr: number,
    confirmedHeadcount: GroupSize,
    config: EconomyParameters,
  ): EconomyPriceSnapshot;
  getEconomyConfig?(conn?: DbOrTx): Promise<EconomyParameters>;
}

export interface BookingAuditPort {
  record(params: AuditRecordParams): Promise<void>;
}

export interface BookingNotificationPort {
  write(params: NotificationWriteParams): Promise<void>;
  writeBestEffort(params: NotificationWriteParams): Promise<void>;
}

export interface BookingMeetingPort {
  createEvent(
    bookingId: string,
    scheduledStartAt?: Date,
    scheduledEndAt?: Date,
    attendees?: MeetingAttendee[],
    conn?: DbOrTx,
    details?: MeetingEventDetails,
  ): Promise<MeetingEvent>;
  updateEvent(
    bookingId: string,
    changes: { startAt?: Date; endAt?: Date },
  ): Promise<void>;
  cancelEvent(bookingId: string): Promise<void>;
  setManualLink(
    bookingId: string,
    url: string,
    conn?: DbOrTx,
  ): Promise<MeetingEvent>;
}

export interface BookingRoomPort {
  requestRoomForBooking(
    conn: DbOrTx,
    params: {
      bookingId: string;
      roomId: string;
      startAt: Date;
      endAt: Date;
    },
  ): Promise<{ available: boolean; reason?: string; roomBookingId?: string }>;
  /**
   * Cancels a still-pending (`requested`) room booking row (M7). No-op when
   * the request was already confirmed/cancelled.
   */
  cancelRequestedRoomForBooking(conn: DbOrTx, bookingId: string): Promise<void>;
  /**
   * N3: resyncs the booking's confirmed roomBooking row back to a schedule
   * (used when a reschedule proposal is rejected/expires and the booking
   * keeps its original time). No-op when the booking has no confirmed row.
   */
  resyncRoomBookingToSchedule(
    conn: DbOrTx,
    bookingId: string,
    schedule: { startAt: Date; endAt: Date },
  ): Promise<void>;
  /**
   * Keeps a confirmed offline room assignment aligned with a booking-level
   * reschedule. Returns `missing` when no active assignment exists and
   * `conflict` when the room cannot be used at the requested time.
   */
  syncRoomBookingScheduleForBooking(
    conn: DbOrTx,
    bookingId: string,
    startAt: Date,
    endAt: Date,
  ): Promise<"updated" | "missing" | "conflict">;
}

export interface BookingPayoutPort {
  getTutorPayouts(input: {
    tutorId: string;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<{
    completedSessions: number;
    totalMarks: number;
    cogitoTake: number;
    tutorPayout: number;
    tutorPayoutIdr: number;
  }>;
}

export function createBookingModule(deps: {
  db: DbType;
  wallet: BookingWalletPort;
  pricing: BookingPricingPort;
  audit: BookingAuditPort;
  notification: BookingNotificationPort;
  meeting: BookingMeetingPort;
  roomPort?: BookingRoomPort;
}) {
  const repo = createBookingRepo(deps.db);
  const service = createBookingService({
    db: deps.db,
    repo,
    wallet: deps.wallet,
    pricing: deps.pricing,
    audit: deps.audit,
    notification: deps.notification,
    meeting: deps.meeting,
    roomPort: deps.roomPort,
  });
  const handler = createBookingHandler(service);
  const tutorActionsHandler = createTutorActionsHandler(service);
  return { service, handler, tutorActionsHandler };
}

export type { BookingService, BookingHandler, TutorActionsHandler };
