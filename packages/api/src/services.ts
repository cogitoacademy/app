import { db } from "./lib/db";
import { createAuditRepo } from "./modules/audit/audit.repo";
import { createAuditHandler } from "./modules/audit/audit.handler";
import { createPricingService } from "./modules/pricing/pricing.service";
import { createWalletRepo } from "./modules/wallet/wallet.repo";
import { createWalletHandler } from "./modules/wallet/wallet.handler";
import { createAuthRepo } from "./modules/auth/auth.repo";
import { createAuthHandler } from "./modules/auth/auth.handler";
import { createAdminRepo } from "./modules/admin/admin.repo";
import { createAdminHandler } from "./modules/admin/admin.handler";
import { createAdminTutorRepo } from "./modules/admin-tutor/admin-tutor.repo";
import { createAdminTutorHandler } from "./modules/admin-tutor/admin-tutor.handler";
import { createTutorRepo } from "./modules/tutor/tutor.repo";
import { createTutorHandler } from "./modules/tutor/tutor.handler";
import { createDiscoveryRepo } from "./modules/tutor-discovery/discovery.repo";
import { createDiscoveryHandler } from "./modules/tutor-discovery/discovery.handler";
import { createInviteRepo } from "./modules/invite/invite.repo";
import { createInviteHandler } from "./modules/invite/invite.handler";
import { createAchievementRepo } from "./modules/achievement/achievement.repo";
import { createAchievementHandler } from "./modules/achievement/achievement.handler";
import { createBookingService } from "./modules/booking/booking.service";
import { createNotificationService } from "./modules/notification/notification.service";
import { createPaymentService } from "./modules/payment/payment.service";
import { createRoomService } from "./modules/room/room.service";
import { createFallbackMeetingProvider } from "./modules/meeting/fallback.provider";
import { createStubPaymentProvider } from "./modules/payment/stub-payment.provider";
import { createXenditPaymentProvider } from "./modules/payment/xendit-payment.provider";
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
import type { NotificationService } from "./modules/notification/notification.service";
import type { PaymentService } from "./modules/payment/payment.service";
import type { RoomService } from "./modules/room/room.service";

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
  notification: NotificationService;
  payment: PaymentService;
  room: RoomService;
}

function createServices(): ServiceRegistry {
  const auditRepo = createAuditRepo();
  const audit = createAuditHandler(auditRepo);
  const pricing = createPricingService();
  const wallet = createWalletHandler(createWalletRepo(db), db);

  const authRepo = createAuthRepo();
  const auth = createAuthHandler({ authRepo, walletPort: wallet });

  const adminRepo = createAdminRepo();
  const admin = createAdminHandler({ adminRepo, auditPort: audit });

  const adminTutorRepo = createAdminTutorRepo();
  const adminTutor = createAdminTutorHandler({
    adminTutorRepo,
    auditPort: audit,
    db,
  });

  const tutorRepo = createTutorRepo();
  const tutor = createTutorHandler({
    tutorRepo,
    pricingPort: pricing,
    auditPort: audit,
    db,
  });

  const discoveryRepo = createDiscoveryRepo();
  const discovery = createDiscoveryHandler({ discoveryRepo, db });

  const inviteRepo = createInviteRepo();
  const invite = createInviteHandler({ inviteRepo, auditPort: audit, db });

  const achievementRepo = createAchievementRepo();
  const achievement = createAchievementHandler({
    achievementRepo,
    auditPort: audit,
    db,
  });

  const meeting = createFallbackMeetingProvider(db);

  const notification = createNotificationService(db);

  const useXendit = !!(env.XENDIT_SECRET_KEY && env.XENDIT_WEBHOOK_TOKEN);
  const paymentProvider = useXendit
    ? createXenditPaymentProvider({
        secretKey: env.XENDIT_SECRET_KEY!,
        webhookToken: env.XENDIT_WEBHOOK_TOKEN!,
        successRedirectUrl: env.XENDIT_SUCCESS_REDIRECT_URL ?? "",
        failureRedirectUrl: env.XENDIT_FAILURE_REDIRECT_URL ?? "",
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

  const booking = createBookingService({
    db,
    wallet,
    pricing,
    audit,
    notification,
    meeting,
  });

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
    payment,
    room,
  };
}

export const services = createServices();
