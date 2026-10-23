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
  V3SessionPrice,
  V3ConfigRevision,
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
  createBookingReportReminderProcessor,
  createBookingReportReminderRepo,
} from "./booking.report-reminders";
import {
  createBookingHandler,
  createTutorActionsHandler,
} from "./booking.handler";
import type {
  TutorPayoutAllocationDetail,
  TutorPayoutSourceItem,
} from "./booking.service";
import type { BookingCompetitionPalettePort } from "./booking-topic-palette";

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
  calculateV3SessionPrice?(
    input: {
      competition: string;
      modality: "online" | "offline";
      headcount: GroupSize;
    },
    values: V3ConfigRevision["values"],
  ): V3SessionPrice;
  getActiveV3Config?(conn?: DbOrTx): Promise<V3ConfigRevision | null>;
  getV3ConfigByVersion?(
    version: number,
    conn?: DbOrTx,
  ): Promise<V3ConfigRevision | null>;
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
    changes: {
      startAt?: Date;
      endAt?: Date;
      location?: string;
      description?: string;
    },
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
  getTutorPayoutReport?(input: {
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<TutorPayoutReportRow[]>;
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
  getPendingTutorPayouts?(tutorId: string): Promise<{
    completedSessions: number;
    totalMarks: number;
    cogitoTake: number;
    tutorPayout: number;
    tutorPayoutIdr: number;
    lastPaidAt: Date | null;
    items: TutorPayoutSourceItem[];
  }>;
  getTutorPayoutAllocations?(payoutId: string): Promise<{
    detailsAvailable: boolean;
    items: TutorPayoutAllocationDetail[];
  }>;
  previewTutorPayout?(
    tutorId: string,
    sourceKeys: string[],
  ): Promise<TutorPayoutPreview>;
  prepareTutorPayout?(
    adminId: string,
    input: {
      tutorId: string;
      sourceKeys: string[];
      previewVersion: string;
      operationId: string;
    },
  ): Promise<TutorPayoutMutationResult>;
  recordTutorPayoutTransfer?(
    adminId: string,
    input: {
      payoutId: string;
      previewVersion: string;
      actualAmountIdr: number;
      paidAt: Date;
      reference?: string;
      proofUrl?: string;
    },
  ): Promise<TutorPayoutMutationResult>;
  voidTutorPayout?(
    adminId: string,
    input: { payoutId: string; reason: string },
  ): Promise<TutorPayoutMutationResult>;
  resolveTutorPayoutReconciliation?(
    adminId: string,
    input: { payoutId: string; reason: string },
  ): Promise<TutorPayoutMutationResult>;
  getTutorTaxConfig?(): Promise<TutorTaxConfigView>;
  updateTutorTaxConfig?(
    adminId: string,
    input: TutorTaxConfigUpdate,
  ): Promise<TutorTaxConfigView>;
  setTutorTaxRateOverride?(
    adminId: string,
    input: { tutorId: string; rateBps: number | null; reason: string },
  ): Promise<Record<string, unknown>>;
  getTutorPayoutFinance?(tutorId: string): Promise<TutorPayoutFinance>;
}

export interface TutorTaxConfigView {
  id: "default";
  version: number;
  nikNpwpRateBps: number;
  nikOnlyRateBps: number;
  missingRateBps: number;
}

export interface TutorTaxConfigUpdate {
  expectedVersion: number;
  nikNpwpRateBps: number;
  nikOnlyRateBps: number;
  missingRateBps: number;
  reason: string;
}

export interface TutorPayoutPreview {
  previewVersion: string;
  tutorId: string;
  profileVersion: number;
  taxConfigVersion: number;
  sourceKeys: string[];
  items: TutorPayoutSourceItem[];
  grossHonorariumIdr: number;
  taxStatus: "nik_npwp" | "nik_only" | "missing";
  taxRateBps: number;
  taxRateSource: string;
  taxHonorariumIdr: number;
  transferFeeIdr: number;
  netHonorariumIdr: number;
  legalName: string | null;
  nik: string | null;
  npwp: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountHolderName: string | null;
}

export interface TutorPayoutMutationResult {
  id: string;
  tutorId: string;
  status: "prepared" | "paid" | "void";
  sourceKeys: string[];
  grossHonorariumIdr: number;
  taxStatus: string | null;
  taxRateBps: number | null;
  taxRateSource: string | null;
  taxHonorariumIdr: number | null;
  transferFeeIdr: number;
  netHonorariumIdr: number;
  actualAmountIdr: number | null;
  actualReference: string | null;
  actualProofUrl: string | null;
  transferRecordedAt: Date | null;
  transferRecordedBy: string | null;
  paidAt: Date | null;
  preparedAt: Date | null;
  voidedAt: Date | null;
  voidReason: string | null;
  reconciliationStatus: string;
  reconciliationReason: string | null;
}

export interface TutorPayoutFinance {
  pending: {
    completedSessions: number;
    grossHonorariumIdr: number;
    taxStatus: "nik_npwp" | "nik_only" | "missing";
    taxRateBps: number;
    taxRateSource: string;
    taxHonorariumIdr: number | null;
    transferFeeIdr: number;
    netHonorariumIdr: number | null;
    payoutAccountComplete: boolean;
    taxProfileComplete: boolean;
    items: TutorPayoutSourceItem[];
  };
  history: Array<{
    id: string;
    status: "prepared" | "paid" | "void";
    grossHonorariumIdr: number;
    taxStatus: string | null;
    taxRateBps: number | null;
    taxRateSource: string | null;
    taxHonorariumIdr: number | null;
    transferFeeIdr: number;
    netHonorariumIdr: number;
    actualAmountIdr: number | null;
    paidAt: Date | null;
    actualReference: string | null;
    reconciliationStatus: string;
    items: TutorPayoutAllocationDetail[];
  }>;
}

export type TutorPayoutReportStatus = "paid" | "pending" | "prepared" | "void";

export interface TutorPayoutReportRow {
  id: string;
  tutorId: string;
  tutorName: string;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountHolderName: string | null;
  bankAccountOpeningCity: string | null;
  bankAccountOwnership: "self" | "trusted_person" | null;
  taxLegalName: string | null;
  taxNik: string | null;
  taxNpwp: string | null;
  grossHonorariumIdr: number;
  transferFeeIdr: number;
  netHonorariumIdr: number | null;
  status: TutorPayoutReportStatus;
  paidAt: Date | null;
  payoutAccountComplete: boolean;
  taxProfileComplete: boolean;
  taxStatus: "nik_npwp" | "nik_only" | "missing" | null;
  taxRateBps: number | null;
  taxRateSource: string | null;
  taxHonorariumIdr: number | null;
  actualAmountIdr: number | null;
  actualReference: string | null;
  actualProofUrl: string | null;
  transferRecordedAt: Date | null;
  transferRecordedBy: string | null;
  preparedAt: Date | null;
  voidedAt: Date | null;
  voidReason: string | null;
  reconciliationStatus: string;
  reconciliationReason: string | null;
  previewVersion: string | null;
  coveredSessionCount: number;
}

export function createBookingModule(deps: {
  db: DbType;
  appBaseUrl: string;
  wallet: BookingWalletPort;
  pricing: BookingPricingPort;
  audit: BookingAuditPort;
  notification: BookingNotificationPort;
  meeting: BookingMeetingPort;
  competitionPalette?: BookingCompetitionPalettePort;
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
    competitionPalette: deps.competitionPalette,
    roomPort: deps.roomPort,
  });
  const handler = createBookingHandler(service);
  const tutorActionsHandler = createTutorActionsHandler(service);
  const reportReminders = createBookingReportReminderProcessor({
    db: deps.db,
    repo: createBookingReportReminderRepo(),
    notification: deps.notification,
    appBaseUrl: deps.appBaseUrl,
  });
  return { service, handler, tutorActionsHandler, reportReminders };
}

export type { BookingService } from "./booking.service";
export type { BookingHandler, TutorActionsHandler } from "./booking.handler";
export type BookingReportReminderService = ReturnType<
  typeof createBookingReportReminderProcessor
>;
