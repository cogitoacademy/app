import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import type { MeetingAttendee, MeetingEvent } from "../meeting/meeting.types";
import type { AuditRecordParams } from "../audit/audit.service";
import type {
  GroupSize,
  Modality,
  PriceSnapshot,
} from "../pricing/pricing.service";
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
  ): Promise<MeetingEvent>;
  updateEvent(
    bookingId: string,
    changes: { startAt?: Date; endAt?: Date },
  ): Promise<void>;
  cancelEvent(bookingId: string): Promise<void>;
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
