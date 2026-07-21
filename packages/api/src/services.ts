import { db } from "./lib/db";
import { createAuditRepo } from "./modules/audit/audit.repo";
import { createAuditService } from "./modules/audit/audit.service";
import { createPricingService } from "./modules/pricing/pricing.service";
import { createWalletRepo } from "./modules/wallet/wallet.repo";
import { createWalletService } from "./modules/wallet/wallet.service";
import { createWalletHandler } from "./modules/wallet/wallet.handler";
import { createAuthRepo } from "./modules/auth/auth.repo";
import { createAuthHandler } from "./modules/auth/auth.handler";
import { createAuthService } from "./modules/auth/auth.service";
import { createAdminRepo } from "./modules/admin/admin.repo";
import { createAdminHandler } from "./modules/admin/admin.handler";
import { createAdminService } from "./modules/admin/admin.service";
import { createAdminTutorRepo } from "./modules/admin-tutor/admin-tutor.repo";
import { createAdminTutorHandler } from "./modules/admin-tutor/admin-tutor.handler";
import { createAdminTutorService } from "./modules/admin-tutor/admin-tutor.service";
import { createTutorRepo } from "./modules/tutor/tutor.repo";
import { createTutorHandler } from "./modules/tutor/tutor.handler";
import { createTutorService } from "./modules/tutor/tutor.service";
import { createDiscoveryRepo } from "./modules/tutor-discovery/discovery.repo";
import { createDiscoveryHandler } from "./modules/tutor-discovery/discovery.handler";
import { createInviteRepo } from "./modules/invite/invite.repo";
import { createInviteHandler } from "./modules/invite/invite.handler";
import { createInviteService } from "./modules/invite/invite.service";
import { createAchievementRepo } from "./modules/achievement/achievement.repo";
import { createAchievementHandler } from "./modules/achievement/achievement.handler";
import { createAchievementService } from "./modules/achievement/achievement.service";
import { createBookingRepo } from "./modules/booking/booking.repo";
import { createBookingService } from "./modules/booking/booking.service";
import {
  createBookingHandler,
  createTutorActionsHandler,
} from "./modules/booking/booking.handler";
import { createNotificationService } from "./modules/notification/notification.service";
import { createNotificationHandler } from "./modules/notification/notification.handler";
import { createEmailService } from "./modules/email/email.service";
import { createStubEmailProvider } from "./modules/email/stub-email.provider";
import { createResendEmailProvider } from "./modules/email/resend-email.provider";
import { createPaymentService } from "./modules/payment/payment.service";
import { createPaymentHandler } from "./modules/payment/payment.handler";
import { createRoomService } from "./modules/room/room.service";
import { createRoomHandler } from "./modules/room/room.handler";
import { createFallbackMeetingProvider } from "./modules/meeting/fallback.provider";
import { createGoogleMeetingProviderWithFallback } from "./modules/meeting/google-meeting.provider";
import { createStubPaymentProvider } from "./modules/payment/stub-payment.provider";
import { createXenditPaymentProvider } from "./modules/payment/xendit-payment.provider";
import { createAdminBookingRepo } from "./modules/admin-booking/admin-booking.repo";
import { createAdminBookingService } from "./modules/admin-booking/admin-booking.service";
import { createAdminBookingHandler } from "./modules/admin-booking/admin-booking.handler";
import { createRefundRepo } from "./modules/refund/refund.repo";
import { createRefundService } from "./modules/refund/refund.service";
import { createRefundHandler } from "./modules/refund/refund.handler";
import { env } from "@cogito-app/env/server";

import type { AuditPort } from "./modules/audit/audit.service";
import type { PricingPort } from "./modules/pricing/pricing.service";
import type { WalletPort } from "./modules/wallet/wallet.service";
import type { AuthService } from "./modules/auth/auth.service";
import type { AdminService } from "./modules/admin/admin.service";
import type { AdminTutorService } from "./modules/admin-tutor/admin-tutor.service";
import type { TutorService } from "./modules/tutor/tutor.service";
import type { InviteService } from "./modules/invite/invite.service";
import type { AchievementService } from "./modules/achievement/achievement.service";
import type { BookingService } from "./modules/booking/booking.service";
import type { NotificationService } from "./modules/notification/notification.service";
import type { PaymentService } from "./modules/payment/payment.service";
import type { RoomService } from "./modules/room/room.service";
import type { AdminBookingService } from "./modules/admin-booking/admin-booking.service";
import type { RefundService } from "./modules/refund/refund.service";
import type { EmailService } from "./modules/email/email.service";
import type { WalletHandler } from "./modules/wallet/wallet.handler";
import type {
  BookingHandler,
  TutorActionsHandler,
} from "./modules/booking/booking.handler";
import type { PaymentHandler } from "./modules/payment/payment.handler";
import type { RoomHandler } from "./modules/room/room.handler";

export interface ServiceRegistry {
  audit: AuditPort;
  pricing: PricingPort;
  wallet: WalletPort;
  auth: AuthService;
  admin: AdminService;
  adminTutor: AdminTutorService;
  tutor: TutorService;
  invite: InviteService;
  achievement: AchievementService;
  booking: BookingService;
  notification: NotificationService;
  email: EmailService;
  payment: PaymentService;
  room: RoomService;
  adminBooking: AdminBookingService;
  refund: RefundService;
}

export interface HandlerRegistry {
  auth: ReturnType<typeof createAuthHandler>;
  admin: ReturnType<typeof createAdminHandler>;
  adminTutor: ReturnType<typeof createAdminTutorHandler>;
  tutor: ReturnType<typeof createTutorHandler>;
  discovery: ReturnType<typeof createDiscoveryHandler>;
  invite: ReturnType<typeof createInviteHandler>;
  achievement: ReturnType<typeof createAchievementHandler>;
  notification: ReturnType<typeof createNotificationHandler>;
  adminBooking: ReturnType<typeof createAdminBookingHandler>;
  refund: ReturnType<typeof createRefundHandler>;
  wallet: WalletHandler;
  booking: BookingHandler;
  tutorActions: TutorActionsHandler;
  payment: PaymentHandler;
  room: RoomHandler;
}

function createServices() {
  const auditRepo = createAuditRepo();
  const audit = createAuditService(auditRepo);
  const pricing = createPricingService();
  const walletRepo = createWalletRepo(db);
  const wallet = createWalletService(walletRepo, db);
  const walletHandler = createWalletHandler(wallet);

  const authRepo = createAuthRepo();
  const authService = createAuthService({ authRepo, walletPort: wallet, db });
  const authHandler = createAuthHandler(authService);

  const adminRepo = createAdminRepo();
  const adminService = createAdminService({ adminRepo, auditPort: audit, db });
  const adminHandler = createAdminHandler(adminService);

  const adminTutorRepo = createAdminTutorRepo();
  const adminTutorService = createAdminTutorService({
    adminTutorRepo,
    auditPort: audit,
    db,
  });
  const adminTutorHandler = createAdminTutorHandler(adminTutorService);

  const tutorRepo = createTutorRepo();
  const tutorService = createTutorService({
    tutorRepo,
    pricingPort: pricing,
    auditPort: audit,
    db,
  });
  const tutorHandler = createTutorHandler(tutorService);

  const discoveryRepo = createDiscoveryRepo();
  const discoveryHandler = createDiscoveryHandler({ discoveryRepo, db });

  const inviteRepo = createInviteRepo();
  const inviteService = createInviteService({
    inviteRepo,
    auditPort: audit,
    db,
  });
  const inviteHandler = createInviteHandler({ inviteService });

  const achievementRepo = createAchievementRepo();
  const achievementService = createAchievementService({
    achievementRepo,
    auditPort: audit,
    db,
  });
  const achievementHandler = createAchievementHandler({ achievementService });

  const meeting =
    env.GOOGLE_MEET_ENABLED && env.GOOGLE_CLIENT_EMAIL && env.GOOGLE_PRIVATE_KEY
      ? createGoogleMeetingProviderWithFallback(
          {
            clientEmail: env.GOOGLE_CLIENT_EMAIL!,
            privateKey: env.GOOGLE_PRIVATE_KEY!,
            calendarId: env.GOOGLE_CALENDAR_ID ?? "primary",
          },
          db,
        )
      : createFallbackMeetingProvider(db);

  const emailProvider = env.RESEND_API_KEY
    ? createResendEmailProvider(env.RESEND_API_KEY, env.EMAIL_FROM)
    : createStubEmailProvider();
  const email = createEmailService(emailProvider);

  const notificationService = createNotificationService(db, email);
  const notificationHandler = createNotificationHandler({
    notificationService,
  });

  const useXendit = !!(env.XENDIT_SECRET_KEY && env.XENDIT_WEBHOOK_TOKEN);
  const paymentProvider = useXendit
    ? createXenditPaymentProvider({
        secretKey: env.XENDIT_SECRET_KEY!,
        webhookToken: env.XENDIT_WEBHOOK_TOKEN!,
        successRedirectUrl: env.XENDIT_SUCCESS_REDIRECT_URL ?? "",
        failureRedirectUrl: env.XENDIT_FAILURE_REDIRECT_URL ?? "",
        defaultPaymentMethod: env.XENDIT_DEFAULT_PAYMENT_METHOD,
      })
    : createStubPaymentProvider(env.PAYMENT_WEBHOOK_SECRET);
  const providerName = useXendit ? "xendit" : "stub";

  const payment = createPaymentService({
    db,
    wallet,
    provider: paymentProvider,
    providerName,
  });
  const paymentHandler = createPaymentHandler(payment, wallet);

  const room = createRoomService(db);
  const roomHandler = createRoomHandler(room);

  const bookingRepo = createBookingRepo(db);
  const booking = createBookingService({
    db,
    repo: bookingRepo,
    wallet,
    pricing,
    audit,
    notification: notificationService,
    meeting,
  });
  const bookingHandler = createBookingHandler(booking);
  const tutorActionsHandler = createTutorActionsHandler(booking);

  const refundRepo = createRefundRepo(db);

  const adminBookingRepo = createAdminBookingRepo();
  const adminBookingService = createAdminBookingService({
    db,
    repo: adminBookingRepo,
    auditPort: audit,
    wallet,
    refundRepo,
  });
  const adminBookingHandler = createAdminBookingHandler(adminBookingService);

  const refundService = createRefundService({
    db,
    repo: refundRepo,
    wallet,
    auditPort: audit,
  });
  const refundHandler = createRefundHandler({ refundService });

  const services: ServiceRegistry = {
    audit,
    pricing,
    wallet,
    auth: authService,
    admin: adminService,
    adminTutor: adminTutorService,
    tutor: tutorService,
    invite: inviteService,
    achievement: achievementService,
    booking,
    notification: notificationService,
    email,
    payment,
    room,
    adminBooking: adminBookingService,
    refund: refundService,
  };

  const handlers: HandlerRegistry = {
    auth: authHandler,
    admin: adminHandler,
    adminTutor: adminTutorHandler,
    tutor: tutorHandler,
    discovery: discoveryHandler,
    invite: inviteHandler,
    achievement: achievementHandler,
    notification: notificationHandler,
    adminBooking: adminBookingHandler,
    refund: refundHandler,
    wallet: walletHandler,
    booking: bookingHandler,
    tutorActions: tutorActionsHandler,
    payment: paymentHandler,
    room: roomHandler,
  };

  return { services, handlers };
}

const { services, handlers } = createServices();
export { services, handlers };
