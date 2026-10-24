import { createContentAdminModule } from "./modules/content-admin";
import type { ContentAdminService } from "./modules/content-admin/content-admin.service";
import type { ContentAdminHandler } from "./modules/content-admin/content-admin.handler";
import { createPrivateKbStorage } from "./lib/private-kb-storage";
import { db } from "./lib/db";
import { env } from "@cogito-app/env/server";
import { initRedis } from "./lib/redis";
import { initIdempotencyStores } from "./lib/idempotency";
import { createAuditModule } from "./modules/audit";
import { createPricingModule } from "./modules/pricing";
import { createEconomyModule } from "./modules/economy";
import { createWalletModule } from "./modules/wallet";
import { createAuthModule } from "./modules/auth";
import { createAdminModule } from "./modules/admin";
import { createAdminTutorModule } from "./modules/admin-tutor";
import { createAdminMarkPackageModule } from "./modules/admin-mark-package";
import { createAdminKnowledgeBankModule } from "./modules/admin-knowledge-bank";
import { createCompetitionCatalogModule } from "./modules/competition-catalog";
import { createAcademyClassModule } from "./modules/academy-class";
import { createClassEnrollmentModule } from "./modules/class-enrollment";
import { createTutorModule } from "./modules/tutor";
import { createDiscoveryModule } from "./modules/tutor-discovery";
import { createInviteModule } from "./modules/invite";
import { createAchievementModule } from "./modules/achievement";
import { createBookingModule } from "./modules/booking";
import type { BookingReportReminderService } from "./modules/booking";
import { createNotificationModule } from "./modules/notification";
import { createEmailModule } from "./modules/email";
import { createPaymentModule } from "./modules/payment";
import { createRoomModule } from "./modules/room";
import { createAdminBookingModule } from "./modules/admin-booking";
import { createRefundModule } from "./modules/refund";
import { createMeetingModule } from "./modules/meeting";
import {
  createTestClassMeetingProvider,
  updateTestClassMeetingEvent,
} from "./modules/meeting/test-class-meeting.provider";
import type { MeetingModule } from "./modules/meeting";
import { createContentModule } from "./modules/content";
import type { ContentService } from "./modules/content/content.service";
import { createPublicContentModule } from "./modules/public-content";
import type { PublicContentService } from "./modules/public-content";
import { createFaqModule } from "./modules/faq";
import type { FaqService } from "./modules/faq/faq.service";
import { createSupportModule } from "./modules/support";
import { createUploadModule } from "./modules/upload";
import { createContactModule } from "./modules/contact";
import { createReferralModule } from "./modules/referral";
import { createStorage } from "./lib/storage";
import type { MidtransMode } from "./modules/payment/midtrans-payment.provider";

import type { AuditPort } from "./modules/audit/audit.service";
import type { PricingPort } from "./modules/pricing/pricing.service";
import type { WalletPort } from "./modules/wallet/wallet.service";
import type { AuthService } from "./modules/auth/auth.service";
import type { AdminService } from "./modules/admin/admin.service";
import type { AdminTutorService } from "./modules/admin-tutor/admin-tutor.service";
import type { AdminMarkPackageService } from "./modules/admin-mark-package/admin-mark-package.service";
import type { AdminKnowledgeBankService } from "./modules/admin-knowledge-bank/admin-knowledge-bank.service";
import type { CompetitionCatalogService } from "./modules/competition-catalog/competition-catalog.service";
import type { AcademyClassService } from "./modules/academy-class/academy-class.service";
import type { ClassEnrollmentService } from "./modules/class-enrollment/class-enrollment.service";
import type { TutorService } from "./modules/tutor/tutor.service";
import type { InviteService } from "./modules/invite/invite.service";
import type { AchievementService } from "./modules/achievement/achievement.service";
import type { BookingService } from "./modules/booking/booking.service";
import type { NotificationService } from "./modules/notification/notification.service";
import type { EmailService } from "./modules/email/email.service";
import type { PaymentService } from "./modules/payment/payment.service";
import type { RoomService } from "./modules/room/room.service";
import type { AdminBookingService } from "./modules/admin-booking/admin-booking.service";
import type { RefundService } from "./modules/refund/refund.service";
import type { WalletHandler } from "./modules/wallet/wallet.handler";
import type {
  BookingHandler,
  TutorActionsHandler,
} from "./modules/booking/booking.handler";
import type { PaymentHandler } from "./modules/payment/payment.handler";
import type { RoomHandler } from "./modules/room/room.handler";
import type { AuthHandler } from "./modules/auth/auth.handler";
import type { AdminHandler } from "./modules/admin/admin.handler";
import type { AdminTutorHandler } from "./modules/admin-tutor/admin-tutor.handler";
import type { AdminMarkPackageHandler } from "./modules/admin-mark-package/admin-mark-package.handler";
import type { AdminKnowledgeBankHandler } from "./modules/admin-knowledge-bank/admin-knowledge-bank.handler";
import type { CompetitionCatalogHandler } from "./modules/competition-catalog/competition-catalog.handler";
import type { AcademyClassHandler } from "./modules/academy-class/academy-class.handler";
import type { ClassEnrollmentHandler } from "./modules/class-enrollment/class-enrollment.handler";
import type { TutorHandler } from "./modules/tutor/tutor.handler";
import type { DiscoveryHandler } from "./modules/tutor-discovery/discovery.handler";
import type { InviteHandler } from "./modules/invite/invite.handler";
import type { AchievementHandler } from "./modules/achievement/achievement.handler";
import type { NotificationHandler } from "./modules/notification/notification.handler";
import type { AdminBookingHandler } from "./modules/admin-booking/admin-booking.handler";
import type { RefundHandler } from "./modules/refund/refund.handler";
import type { SupportService } from "./modules/support/support.service";
import type { SupportHandler } from "./modules/support/support.handler";
import type { UploadService } from "./modules/upload/upload.service";
import type { UploadHandler } from "./modules/upload/upload.handler";
import type { ContentHandler } from "./modules/content/content.handler";
import type { PublicContentHandler } from "./modules/public-content";
import type { FaqHandler } from "./modules/faq/faq.handler";
import type { ContactService } from "./modules/contact/contact.service";
import type { ContactHandler } from "./modules/contact/contact.handler";
import type { ReferralService } from "./modules/referral/referral.service";
import type { ReferralHandler } from "./modules/referral/referral.handler";
import { createReportExportModule } from "./modules/report-export";
import type { ReportExportService } from "./modules/report-export";

export interface ServiceRegistry {
  audit: AuditPort;
  pricing: PricingPort;
  wallet: WalletPort;
  auth: AuthService;
  admin: AdminService;
  adminTutor: AdminTutorService;
  adminMarkPackage: AdminMarkPackageService;
  adminKnowledgeBank: AdminKnowledgeBankService;
  competitionCatalog: CompetitionCatalogService;
  academyClass: AcademyClassService;
  classEnrollment: ClassEnrollmentService;
  tutor: TutorService;
  invite: InviteService;
  achievement: AchievementService;
  booking: BookingService;
  bookingReportReminders: BookingReportReminderService;
  notification: NotificationService;
  email: EmailService;
  payment: PaymentService;
  room: RoomService;
  adminBooking: AdminBookingService;
  refund: RefundService;
  support: SupportService;
  upload: UploadService;
  content: ContentService;
  publicContent: PublicContentService;
  contentAdmin: ContentAdminService;
  faq: FaqService;
  meeting: MeetingModule;
  contact: ContactService;
  referral: ReferralService;
  reportExport: ReportExportService;
}

export interface HandlerRegistry {
  auth: AuthHandler;
  admin: AdminHandler;
  adminTutor: AdminTutorHandler;
  adminMarkPackage: AdminMarkPackageHandler;
  adminKnowledgeBank: AdminKnowledgeBankHandler;
  competitionCatalog: CompetitionCatalogHandler;
  academyClass: AcademyClassHandler;
  classEnrollment: ClassEnrollmentHandler;
  tutor: TutorHandler;
  discovery: DiscoveryHandler;
  invite: InviteHandler;
  achievement: AchievementHandler;
  notification: NotificationHandler;
  adminBooking: AdminBookingHandler;
  refund: RefundHandler;
  wallet: WalletHandler;
  booking: BookingHandler;
  tutorActions: TutorActionsHandler;
  payment: PaymentHandler;
  room: RoomHandler;
  support: SupportHandler;
  upload: UploadHandler;
  content: ContentHandler;
  publicContent: PublicContentHandler;
  contentAdmin: ContentAdminHandler;
  faq: FaqHandler;
  contact: ContactHandler;
  referral: ReferralHandler;
}

export interface GoogleMeetConfigInput {
  googleMeetClientId?: string;
  googleClientId?: string;
  googleMeetClientSecret?: string;
  googleClientSecret?: string;
  refreshToken?: string;
  clientEmail?: string;
  privateKey?: string;
  impersonatedUser?: string;
  calendarId?: string;
  sendUpdates?: "none" | "all" | "externalOnly";
}

export function resolveGoogleMeetConfig(input: GoogleMeetConfigInput) {
  const clientId = input.googleMeetClientId ?? input.googleClientId;
  const clientSecret = input.googleMeetClientSecret ?? input.googleClientSecret;

  if (clientId && clientSecret && input.refreshToken) {
    return {
      authType: "oauth_refresh_token" as const,
      clientId,
      clientSecret,
      refreshToken: input.refreshToken,
      calendarId: input.calendarId ?? "primary",
      sendUpdates: input.sendUpdates ?? "none",
    };
  }

  if (input.clientEmail && input.privateKey) {
    return {
      authType: "service_account" as const,
      clientEmail: input.clientEmail,
      privateKey: input.privateKey,
      impersonatedUser: input.impersonatedUser,
      calendarId: input.calendarId ?? "primary",
      sendUpdates: input.sendUpdates ?? "none",
    };
  }

  return undefined;
}

export interface MidtransConfigInput {
  provider: string;
  serverKey?: string;
  merchantId?: string;
  mode?: MidtransMode;
  webhookSignatureKey?: string;
  // Shared test-mode UAT list, normalized to trim + lowercase.
  testAllowedEmails?: string;
}

export function resolveMidtransConfig(input: MidtransConfigInput) {
  if (
    input.provider !== "midtrans" ||
    !input.serverKey ||
    !input.merchantId ||
    !input.mode
  ) {
    return undefined;
  }

  // Preserve the historical 4-key shape when no allowlist is configured so
  // existing callers/tests pinning the exact object keep passing; the
  // payment module treats a missing list as fail-closed in test mode.
  const base = {
    serverKey: input.serverKey,
    merchantId: input.merchantId,
    mode: input.mode,
    webhookSignatureKey: input.webhookSignatureKey,
  };
  if (input.testAllowedEmails === undefined) return base;
  return {
    ...base,
    testAllowedEmails: (input.testAllowedEmails ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  };
}

export function createProviderRefundDelegate(provider: {
  refund(
    paymentRequestId: string,
    amountIdr: number,
    reason?: string,
  ): Promise<{ providerRefundId: string }>;
}) {
  return (paymentRequestId: string, amountIdr: number, reason?: string) =>
    provider.refund(paymentRequestId, amountIdr, reason);
}

function createServices() {
  const redis = initRedis(env.REDIS_URL);
  initIdempotencyStores(redis);
  const googleMeetConfig = resolveGoogleMeetConfig({
    googleMeetClientId: env.GOOGLE_MEET_CLIENT_ID,
    googleClientId: env.GOOGLE_CLIENT_ID,
    googleMeetClientSecret: env.GOOGLE_MEET_CLIENT_SECRET,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET,
    refreshToken: env.GOOGLE_MEET_REFRESH_TOKEN,
    clientEmail: env.GOOGLE_CLIENT_EMAIL,
    privateKey: env.GOOGLE_PRIVATE_KEY,
    impersonatedUser: env.GOOGLE_IMPERSONATED_USER,
    calendarId: env.GOOGLE_CALENDAR_ID,
    sendUpdates: env.GOOGLE_CALENDAR_SEND_UPDATES,
  });

  // Infrastructure modules
  const audit = createAuditModule();
  const economy = createEconomyModule({ db });
  const pricing = createPricingModule({
    db,
    economy: economy.service,
  });
  const competitionCatalog = createCompetitionCatalogModule({
    includeCalendarReferences:
      env.CONTENT_ADMIN_ENABLED || env.CC_SOURCE === "database",
    db,
    audit: audit.service,
    economy: economy.service,
  });
  const email = createEmailModule({
    resendApiKey: env.RESEND_API_KEY,
    emailFrom: env.EMAIL_FROM,
    redis,
  });
  const adminKnowledgeBank = createAdminKnowledgeBankModule({
    db,
    audit: audit.service,
  });
  const meeting = createMeetingModule({
    db,
    googleMeetEnabled: !!(env.GOOGLE_MEET_ENABLED && googleMeetConfig),
    googleConfig: googleMeetConfig,
    redis,
    ...(env.NODE_ENV === "test"
      ? {
          classMeetingCancellationProvider: async (
            externalEventId: string | null,
            sessionId?: string,
          ) => {
            const eventId = externalEventId ?? `test-class-event-${sessionId}`;
            if (!eventId.startsWith("test-class-event-"))
              throw new Error(
                "Refusing non-synthetic class event in the test provider",
              );
          },
          classMeetingProvider: createTestClassMeetingProvider({
            failFirstTitlePrefix:
              process.env.ACADEMY_CLASS_MEETING_TEST_FAIL_FIRST_TITLE_PREFIX,
          }),
          classMeetingUpdateProvider: updateTestClassMeetingEvent,
        }
      : {}),
  });

  // Core modules
  const wallet = createWalletModule({
    db,
    knowledgeBankAccess: adminKnowledgeBank.service,
  });
  const referral = createReferralModule({
    db,
    wallet: wallet.service,
    audit: audit.service,
  });
  const privateKbStorage = () => createPrivateKbStorage(env);
  const contentAdmin = createContentAdminModule({
    db,
    audit: audit.service,
    storage: privateKbStorage,
    enabled: () => env.CONTENT_ADMIN_ENABLED,
  });
  const content = createContentModule({
    database: contentAdmin.repo,
    privateStorage: privateKbStorage,
    kbSource: env.KB_SOURCE,
    ccSource: env.CC_SOURCE,
    wallet: wallet.service,
    competitionPalette: competitionCatalog.service,
  });
  const publicContent = createPublicContentModule({ db });
  const faq = createFaqModule({ db });
  const auth = createAuthModule({ db, wallet: wallet.service });
  const notification = createNotificationModule({ db, email: email.service });
  const academyClass = createAcademyClassModule({
    db,
    audit: audit.service,
    meeting,
    notification: notification.service,
  });
  const contact = createContactModule({
    db,
    notification: notification.service,
    audit: audit.service,
  });

  // Room is created before booking (U14: booking requests rooms at creation)
  // with a lazy booking port — the delegate only fires at runtime, after
  // `bookingService` is assigned below.
  let bookingService: BookingService | undefined;
  const room = createRoomModule({
    db,
    bookingPort: {
      transitionBookingToScheduled: (tx, bookingId, actorId) =>
        bookingService!.transitionBookingToScheduled(tx, bookingId, actorId),
      syncOfflineCalendarEvent: (bookingId, assignedRoom, schedule) =>
        bookingService!.syncOfflineCalendarEvent(
          bookingId,
          assignedRoom,
          schedule,
        ),
      syncOfflineCalendarAfterRoomRemoval: (bookingId) =>
        bookingService!.syncOfflineCalendarAfterRoomRemoval(bookingId),
      getBookingRecipients: (tx, bookingId) =>
        bookingService!.getBookingRecipients(tx, bookingId),
      cancelOfflineBooking: (tx, bookingId, actorId) =>
        bookingService!.cancelOfflineBooking(tx, bookingId, actorId),
    },
    notificationPort: notification.service,
  });
  const booking = createBookingModule({
    db,
    appBaseUrl: env.CORS_ORIGIN,
    wallet: wallet.service,
    pricing: pricing.service,
    audit: audit.service,
    competitionPalette: competitionCatalog.service,
    notification: notification.service,
    meeting,
    roomPort: room.service,
    referralPort: referral.service,
  });
  bookingService = booking.service;
  const admin = createAdminModule({
    db,
    audit: audit.service,
    wallet: wallet.service,
    payout: booking.service,
    economy: economy.service,
    competitionCatalog: competitionCatalog.service,
  });
  const adminTutor = createAdminTutorModule({
    db,
    audit: audit.service,
    email: email.service,
    appBaseUrl: env.CORS_ORIGIN,
  });
  const adminMarkPackage = createAdminMarkPackageModule({
    db,
    audit: audit.service,
  });
  const tutor = createTutorModule({
    db,
    pricing: pricing.service,
    audit: audit.service,
    payout: booking.service,
  });
  const discovery = createDiscoveryModule({ db, pricing: pricing.service });
  const invite = createInviteModule({ db, audit: audit.service });
  const achievement = createAchievementModule({
    db,
    audit: audit.service,
    notification: notification.service,
  });

  const refund = createRefundModule({
    db,
    audit: audit.service,
    wallet: wallet.service,
  });

  const payment = createPaymentModule({
    db,
    economy: economy.service,
    wallet: wallet.service,
    provider: env.PAYMENT_PROVIDER,
    midtransConfig: resolveMidtransConfig({
      provider: env.PAYMENT_PROVIDER,
      serverKey: env.MIDTRANS_SERVER_KEY,
      merchantId: env.MIDTRANS_MERCHANT_ID,
      mode: env.MIDTRANS_MODE,
      webhookSignatureKey: env.MIDTRANS_WEBHOOK_SIGNATURE_KEY,
      // Shared test-mode UAT list gates Midtrans Sandbox purchases too.
      testAllowedEmails: env.PAYMENT_TEST_ALLOWED_EMAILS,
    }),
    webhookSecret: env.PAYMENT_WEBHOOK_SECRET,
    notification: notification.service,
    audit: audit.service,
    refundRecord: refund.repo,
    kolCommission: referral.service,
    redis,
  });

  const classEnrollment = createClassEnrollmentModule({
    db,
    wallet: wallet.service,
    payment: payment.service,
    notification: notification.service,
    appBaseUrl: env.CORS_ORIGIN,
    referralPort: referral.service,
  });
  const reportExport = createReportExportModule({ db });

  const adminBooking = createAdminBookingModule({
    db,
    audit: audit.service,
    wallet: wallet.service,
    refund: {
      ...refund.service,
      // The provider refund runs against the active payment provider
      // (real provider refund / stub mock id).
      refundWithProvider: createProviderRefundDelegate(
        payment.service.provider,
      ),
    },
    notification: notification.service,
    meeting,
  });

  const support = createSupportModule({
    db,
    audit: audit.service,
    notification: notification.service,
  });

  const upload = createUploadModule({
    storage: createStorage({
      R2_ACCOUNT_ID: env.R2_ACCOUNT_ID,
      R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY,
      R2_BUCKET: env.R2_BUCKET,
      R2_PUBLIC_URL: env.R2_PUBLIC_URL,
      UPLOAD_DIR: env.UPLOAD_DIR,
    }),
  });

  const services: ServiceRegistry = {
    audit: audit.service,
    pricing: pricing.service,
    wallet: wallet.service,
    auth: auth.service,
    admin: admin.service,
    adminTutor: adminTutor.service,
    adminMarkPackage: adminMarkPackage.service,
    adminKnowledgeBank: adminKnowledgeBank.service,
    competitionCatalog: competitionCatalog.service,
    academyClass: academyClass.service,
    classEnrollment: classEnrollment.service,
    tutor: tutor.service,
    invite: invite.service,
    achievement: achievement.service,
    booking: booking.service,
    bookingReportReminders: booking.reportReminders,
    notification: notification.service,
    email: email.service,
    payment: payment.service,
    room: room.service,
    adminBooking: adminBooking.service,
    refund: refund.service,
    support: support.service,
    upload: upload.service,
    content: content.service,
    publicContent: publicContent.service,
    contentAdmin: contentAdmin.service,
    faq: faq.service,
    meeting,
    contact: contact.service,
    referral: referral.service,
    reportExport: reportExport.service,
  };

  const handlers: HandlerRegistry = {
    auth: auth.handler,
    admin: admin.handler,
    adminTutor: adminTutor.handler,
    adminMarkPackage: adminMarkPackage.handler,
    adminKnowledgeBank: adminKnowledgeBank.handler,
    competitionCatalog: competitionCatalog.handler,
    academyClass: academyClass.handler,
    classEnrollment: classEnrollment.handler,
    tutor: tutor.handler,
    discovery: discovery.handler,
    invite: invite.handler,
    achievement: achievement.handler,
    notification: notification.handler,
    adminBooking: adminBooking.handler,
    refund: refund.handler,
    wallet: wallet.handler,
    booking: booking.handler,
    tutorActions: booking.tutorActionsHandler,
    payment: payment.handler,
    room: room.handler,
    support: support.handler,
    upload: upload.handler,
    content: content.handler,
    publicContent: publicContent.handler,
    contentAdmin: contentAdmin.handler,
    faq: faq.handler,
    contact: contact.handler,
    referral: referral.handler,
  };

  return { services, handlers, redis };
}

const { services, handlers, redis } = createServices();
export { services, handlers, redis };
