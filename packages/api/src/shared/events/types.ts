export interface BookingCreated {
  bookingId: string;
  tutorId: string;
  proposerId: string;
  modality: string;
  type: string;
}

export interface BookingConfirmed {
  bookingId: string;
  tutorId: string;
  scheduledStartAt: string;
}

export interface BookingCancelled {
  bookingId: string;
  reason: string;
  refundedAmount: number;
}

export interface BookingDeclined {
  bookingId: string;
  tutorId: string;
}

export interface MeetingDue {
  bookingId: string;
  attendeeEmails: string[];
}

export interface PaymentSucceeded {
  paymentId: string;
  userId: string;
  marks: number;
}

export interface RefundIssued {
  refundId: string;
  userId: string;
  amountIdr: number;
  marks: number;
}

export interface TutorInvited {
  inviteId: string;
  email: string;
  displayName: string;
  token: string;
}

export interface AchievementReviewed {
  achievementId: string;
  userId: string;
  status: string;
}

export interface TutorProfilePublished {
  tutorProfileId: string;
  userId: string;
}

export interface DomainEvent {
  "booking.created": (e: BookingCreated) => void;
  "booking.confirmed": (e: BookingConfirmed) => void;
  "booking.cancelled": (e: BookingCancelled) => void;
  "booking.declined": (e: BookingDeclined) => void;
  "meeting.due": (e: MeetingDue) => void;
  "payment.succeeded": (e: PaymentSucceeded) => void;
  "refund.issued": (e: RefundIssued) => void;
  "tutor.invited": (e: TutorInvited) => void;
  "achievement.reviewed": (e: AchievementReviewed) => void;
  "tutor_profile.published": (e: TutorProfilePublished) => void;
}
