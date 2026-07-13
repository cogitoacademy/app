import { db } from "./lib/db";
import { createAuditRepo } from "./modules/audit/audit.repo";
import { createAuditService } from "./modules/audit/audit.service";
import { createPricingService } from "./modules/pricing/pricing.service";
import { createWalletRepo } from "./modules/wallet/wallet.repo";
import { createWalletService } from "./modules/wallet/wallet.service";
import { createAuthRepo } from "./modules/auth/auth.repo";
import {
  createAuthHandler,
  createAuthService,
} from "./modules/auth/auth.handler";
import { createAdminRepo } from "./modules/admin/admin.repo";
import {
  createAdminHandler,
  createAdminService,
} from "./modules/admin/admin.handler";
import { createAdminTutorRepo } from "./modules/admin-tutor/admin-tutor.repo";
import {
  createAdminTutorHandler,
  createAdminTutorService,
} from "./modules/admin-tutor/admin-tutor.handler";
import { createTutorRepo } from "./modules/tutor/tutor.repo";
import {
  createTutorHandler,
  createTutorService,
} from "./modules/tutor/tutor.handler";
import { createDiscoveryRepo } from "./modules/tutor-discovery/discovery.repo";
import { createDiscoveryHandler } from "./modules/tutor-discovery/discovery.handler";
import { createInviteRepo } from "./modules/invite/invite.repo";
import {
  createInviteHandler,
  createInviteService,
} from "./modules/invite/invite.handler";
import { createAchievementRepo } from "./modules/achievement/achievement.repo";
import {
  createAchievementHandler,
  createAchievementService,
} from "./modules/achievement/achievement.handler";
import { createBookingRepo } from "./modules/booking/booking.repo";
import { createBookingService } from "./modules/booking/booking.service";
import { createNotificationService } from "./modules/notification/notification.service";
import { createNotificationHandler } from "./modules/notification/notification.handler";
import { createEmailService } from "./modules/email/email.service";
import { createStubEmailProvider } from "./modules/email/stub-email.provider";
import { createPaymentService } from "./modules/payment/payment.service";
import { createRoomService } from "./modules/room/room.service";
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

import type { AuditPort } from "./shared/ports/audit.port";
import type { PricingPort } from "./shared/ports/pricing.port";
import type { WalletPort } from "./shared/ports/wallet.port";
import type { AuthHandler } from "./modules/auth/auth.handler";
import type { AdminHandler } from "./modules/admin/admin.handler";
import type { AdminTutorHandler } from "./modules/admin-tutor/admin-tutor.handler";
import type { TutorHandler } from "./modules/tutor/tutor.handler";
import type { DiscoveryHandler } from "./modules/tutor-discovery/discovery.handler";
import type { InviteHandler } from "./modules/invite/invite.handler";
import type { AchievementHandler } from "./modules/achievement/achievement.handler";
import type { BookingService } from "./modules/booking/booking.service";
import type { NotificationHandler } from "./modules/notification/notification.handler";
import type { PaymentService } from "./modules/payment/payment.service";
import type { RoomService } from "./modules/room/room.service";
import type { AdminBookingHandler } from "./modules/admin-booking/admin-booking.handler";
import type { RefundHandler } from "./modules/refund/refund.handler";
import type { EmailService } from "./modules/email/email.service";

export interface ServiceRegistry {
  audit: AuditPort;
  pricing: PricingPort;
  wallet: WalletPort;
  auth: AuthHandler;
  admin: AdminHandler;
  adminTutor: AdminTutorHandler;
  tutor: TutorHandler;
  discovery: DiscoveryHandler;
  invite: InviteHandler;
  achievement: AchievementHandler;
  booking: BookingService;
  notification: NotificationHandler;
  email: EmailService;
  payment: PaymentService;
  room: RoomService;
  adminBooking: AdminBookingHandler;
  refund: RefundHandler;
}

function createServices(): ServiceRegistry {
  const auditRepo = createAuditRepo();
  const audit = createAuditService(auditRepo);
  const pricing = createPricingService();
  const walletRepo = createWalletRepo(db);
  const wallet = createWalletService(walletRepo, db);

  const authRepo = createAuthRepo();
  const authService = createAuthService({ authRepo, walletPort: wallet, db });
  const auth = createAuthHandler({ authRepo, walletPort: wallet, authService });

  const adminRepo = createAdminRepo();
  const adminService = createAdminService({ adminRepo, auditPort: audit, db });
  const admin = createAdminHandler({ adminService });

  const adminTutorRepo = createAdminTutorRepo();
  const adminTutorService = createAdminTutorService({
    adminTutorRepo,
    auditPort: audit,
    db,
  });
  const adminTutor = createAdminTutorHandler({ adminTutorService });

  const tutorRepo = createTutorRepo();
  const tutorService = createTutorService({
    tutorRepo,
    pricingPort: pricing,
    auditPort: audit,
    db,
  });
  const tutor = createTutorHandler({ tutorService });

  const discoveryRepo = createDiscoveryRepo();
  const discovery = createDiscoveryHandler({ discoveryRepo, db });

  const inviteRepo = createInviteRepo();
  const inviteService = createInviteService({
    inviteRepo,
    auditPort: audit,
    db,
  });
  const invite = createInviteHandler({ inviteService });

  const achievementRepo = createAchievementRepo();
  const achievementService = createAchievementService({
    achievementRepo,
    auditPort: audit,
    db,
  });
  const achievement = createAchievementHandler({ achievementService });

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

  const emailProvider = createStubEmailProvider();
  const email = createEmailService(emailProvider);

  const notificationService = createNotificationService(db, email);
  const notification = createNotificationHandler(notificationService);

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

  const room = createRoomService(db);

  const bookingRepo = createBookingRepo(db);
  const booking = createBookingService({
    db,
    repo: bookingRepo,
    wallet,
    pricing,
    audit,
    notification,
    meeting,
  });

  const adminBookingRepo = createAdminBookingRepo();
  const adminBookingService = createAdminBookingService({
    db,
    repo: adminBookingRepo,
    auditPort: audit,
    wallet,
  });
  const adminBooking = createAdminBookingHandler({ adminBookingService });

  const refundRepo = createRefundRepo(db);
  const refundService = createRefundService({
    db,
    repo: refundRepo,
    wallet,
    auditPort: audit,
  });
  const refund = createRefundHandler({ refundService });

  return {
    audit,
    pricing,
    wallet,
    auth,
    admin,
    adminTutor,
    tutor,
    discovery,
    invite,
    achievement,
    booking,
    notification,
    email,
    payment,
    room,
    adminBooking,
    refund,
  };
}

export const services = createServices();
