export const INVITE_EXPIRY_DAYS = 7;

export const KNOWLEDGE_BANK_THRESHOLD = 35;

export const RESPONSE_WINDOW_MS = 12 * 60 * 60 * 1000;
export const LATE_CANCEL_THRESHOLD_MS = 2 * 60 * 60 * 1000;
export const MIN_GROUP_HEADCOUNT = 2;
export const MIN_SERIES_SESSIONS = 2;
export const MAX_SERIES_SESSIONS = 4;
export const DEFAULT_SOLO_PRICE = 42;
export const SESSION_DURATION_MINUTES = 90;

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;
export const ADMIN_DEFAULT_PAGE_LIMIT = 50;

export const COGITO_TAKE_RATE = 0.2;
export const TUTOR_PAYOUT_RATE_IDR = 7000;
export const EXTRA_TAKE_DIVISOR = 5;

export const ONLINE_BASELINE_SPLIT: Record<
  number,
  { tutor: number; cogito: number }
> = {
  1: { tutor: 30, cogito: 12 },
  2: { tutor: 54, cogito: 16 },
  3: { tutor: 64, cogito: 20 },
  4: { tutor: 74, cogito: 22 },
  5: { tutor: 81, cogito: 24 },
  6: { tutor: 88, cogito: 26 },
};

export const OFFLINE_BASELINE_SPLIT: Record<
  number,
  { tutor: number; cogito: number }
> = {
  1: { tutor: 35, cogito: 15 },
  2: { tutor: 70, cogito: 20 },
  3: { tutor: 95, cogito: 25 },
  4: { tutor: 115, cogito: 25 },
  5: { tutor: 120, cogito: 30 },
  6: { tutor: 127, cogito: 35 },
};

export const ONLINE_FLOOR_PRICES: Record<number, number> = {
  1: 42,
  2: 35,
  3: 28,
  4: 24,
  5: 21,
  6: 19,
};

export const OFFLINE_FLOOR_PRICES: Record<number, number> = {
  1: 50,
  2: 45,
  3: 40,
  4: 35,
  5: 30,
  6: 27,
};

export const USER_ROLE = {
  STUDENT: "student",
  TUTOR: "tutor",
  ADMIN: "admin",
} as const;
export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];

export const PAYMENT_STATUS = {
  PENDING: "PENDING",
  PAID: "PAID",
  SETTLED: "SETTLED",
  FAILED: "FAILED",
  EXPIRED: "EXPIRED",
  REFUNDED: "REFUNDED",
} as const;
export type PaymentStatus =
  (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

export const BOOKING_TYPE = {
  SOLO: "solo",
  GROUP: "group",
  SERIES: "series",
} as const;
export type BookingType = (typeof BOOKING_TYPE)[keyof typeof BOOKING_TYPE];

export const MODALITY = {
  ONLINE: "online",
  OFFLINE: "offline",
  BOTH: "both",
} as const;
export type Modality = (typeof MODALITY)[keyof typeof MODALITY];

export const ONBOARDING_STATUS = {
  DRAFT: "draft",
  PENDING_REVIEW: "pending_review",
  CHANGES_REQUESTED: "changes_requested",
  APPROVED_UNPUBLISHED: "approved_unpublished",
  PUBLISHED: "published",
  SUSPENDED: "suspended",
} as const;
export type OnboardingStatus =
  (typeof ONBOARDING_STATUS)[keyof typeof ONBOARDING_STATUS];

export const INVITE_STATUS = {
  INVITED: "invited",
  ACCEPTED: "accepted",
  EXPIRED: "expired",
  REVOKED: "revoked",
} as const;
export type InviteStatus = (typeof INVITE_STATUS)[keyof typeof INVITE_STATUS];

export const ACHIEVEMENT_STATUS = {
  DRAFT: "draft",
  PENDING: "pending",
  PENDING_REVIEW: "pending_review",
  APPROVED: "approved",
  REJECTED: "rejected",
  ARCHIVED: "archived",
} as const;
export type AchievementStatus =
  (typeof ACHIEVEMENT_STATUS)[keyof typeof ACHIEVEMENT_STATUS];

export const CONFIRMATION_STATE = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
  DECLINED: "declined",
  RECONFIRMED: "reconfirmed",
  WITHDRAWN_PRE_H2: "withdrawn_pre_h2",
  WITHDRAWN_POST_H2: "withdrawn_post_h2",
  NO_SHOW: "no_show",
} as const;
export type ConfirmationState =
  (typeof CONFIRMATION_STATE)[keyof typeof CONFIRMATION_STATE];

export const NOTIFICATION_CATEGORY = {
  BOOKING: "booking",
  PAYMENT: "payment",
  REFUND: "refund",
  SCHEDULE: "schedule",
  ACHIEVEMENT: "achievement",
  SYSTEM: "system",
  OVERRIDE: "override",
} as const;
export type NotificationCategory =
  (typeof NOTIFICATION_CATEGORY)[keyof typeof NOTIFICATION_CATEGORY];

export const NOTIFICATION_SEVERITY = {
  INFO: "info",
  ACTION: "action",
  CRITICAL: "critical",
} as const;
export type NotificationSeverity =
  (typeof NOTIFICATION_SEVERITY)[keyof typeof NOTIFICATION_SEVERITY];

export const ROOM_BOOKING_STATUS = {
  REQUESTED: "requested",
  CONFIRMED: "confirmed",
  RELOCATED: "relocated",
  CANCELLED: "cancelled",
} as const;
export type RoomBookingStatus =
  (typeof ROOM_BOOKING_STATUS)[keyof typeof ROOM_BOOKING_STATUS];

export const PAYMENT_PROVIDER_NAME = {
  STUB: "stub",
  XENDIT: "xendit",
} as const;
export type PaymentProviderName =
  (typeof PAYMENT_PROVIDER_NAME)[keyof typeof PAYMENT_PROVIDER_NAME];

export const MEETING_PROVIDER = {
  GOOGLE_MEET: "google_meet",
  MANUAL: "manual",
  PENDING: "pending",
} as const;
export type MeetingProvider =
  (typeof MEETING_PROVIDER)[keyof typeof MEETING_PROVIDER];

export const ACTOR_TYPE = {
  ADMIN: "admin",
  TUTOR: "tutor",
  STUDENT: "student",
  SYSTEM: "system",
} as const;
export type ActorType = (typeof ACTOR_TYPE)[keyof typeof ACTOR_TYPE];

export const ENTRY_TYPE = {
  CREDIT: "credit",
  HOLD: "hold",
  RELEASE: "release",
  DEDUCT: "deduct",
  COMPENSATE_CREDIT: "compensate_credit",
  COMPENSATE_DEDUCT: "compensate_deduct",
} as const;
export type EntryType = (typeof ENTRY_TYPE)[keyof typeof ENTRY_TYPE];

export const ATTENDANCE_STATE = {
  PRESENT: "present",
  LATE: "late",
  ABSENT: "absent",
  UNKNOWN: "unknown",
} as const;
export type AttendanceState =
  (typeof ATTENDANCE_STATE)[keyof typeof ATTENDANCE_STATE];
