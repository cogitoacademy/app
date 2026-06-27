import { db } from "./lib/db";
import { createAuditService } from "./modules/audit/audit.service";
import { createPricingService } from "./modules/pricing/pricing.service";
import { createWalletService } from "./modules/wallet/wallet.service";
import { createAuthService } from "./modules/auth/auth.service";
import { createAdminService } from "./modules/admin/admin.service";
import { createAdminTutorService } from "./modules/admin-tutor/admin-tutor.service";
import { createTutorService } from "./modules/tutor/tutor.service";
import { createDiscoveryService } from "./modules/tutor-discovery/discovery.service";
import { createInviteService } from "./modules/invite/invite.service";
import { createAchievementService } from "./modules/achievement/achievement.service";
import { createPaymentService } from "./modules/payment/payment.service";
import { createStubPaymentProvider } from "./modules/payment/stub-payment.provider";
import { createXenditPaymentProvider } from "./modules/payment/xendit-payment.provider";
import { createNotificationService } from "./modules/notification/notification.service";
import { createBookingService } from "./modules/booking/booking.service";
import { createFallbackMeetingProvider } from "./modules/meeting/fallback.provider";
import { createRoomService } from "./modules/room/room.service";
import { env } from "@cogito-app/env/server";

import type { AuditPort } from "./shared/ports/audit.port";
import type { PricingPort } from "./shared/ports/pricing.port";
import type { WalletPort } from "./shared/ports/wallet.port";
import type { InAppNotificationPort } from "./shared/ports/notification.port";
import type { MeetingPort } from "./shared/ports/meeting.port";
import type { AuthService } from "./modules/auth/auth.service";
import type { AdminService } from "./modules/admin/admin.service";
import type { AdminTutorService } from "./modules/admin-tutor/admin-tutor.service";
import type { TutorService } from "./modules/tutor/tutor.service";
import type { DiscoveryService } from "./modules/tutor-discovery/discovery.service";
import type { InviteService } from "./modules/invite/invite.service";
import type { AchievementService } from "./modules/achievement/achievement.service";
import type { PaymentService } from "./modules/payment/payment.service";
import type { BookingService } from "./modules/booking/booking.service";
import type { RoomService } from "./modules/room/room.service";

export interface ServiceRegistry {
  audit: AuditPort;
  pricing: PricingPort;
  wallet: WalletPort;
  notification: InAppNotificationPort;
  meeting: MeetingPort;
  auth: AuthService;
  admin: AdminService;
  adminTutor: AdminTutorService;
  tutor: TutorService;
  discovery: DiscoveryService;
  invite: InviteService;
  achievement: AchievementService;
  payment: PaymentService;
  booking: BookingService;
  room: RoomService;
}

function createServices(): ServiceRegistry {
  const audit = createAuditService();
  const pricing = createPricingService();
  const wallet = createWalletService(db);
  const notification = createNotificationService(db);
  const meeting = createFallbackMeetingProvider(db);
  const auth = createAuthService({ db, wallet });
  const admin = createAdminService({ db, audit });
  const adminTutor = createAdminTutorService({ db, audit });
  const tutor = createTutorService({ db, pricing, audit });
  const discovery = createDiscoveryService({ db });
  const invite = createInviteService({ db, audit });
  const achievement = createAchievementService({ db, audit });
  const providerName = env.PAYMENT_PROVIDER;
  const paymentProvider =
    providerName === "xendit"
      ? createXenditPaymentProvider({
          secretKey: env.XENDIT_SECRET_KEY!,
          webhookToken: env.XENDIT_WEBHOOK_TOKEN!,
          successRedirectUrl: env.XENDIT_SUCCESS_REDIRECT_URL!,
          failureRedirectUrl: env.XENDIT_FAILURE_REDIRECT_URL!,
        })
      : createStubPaymentProvider(env.PAYMENT_WEBHOOK_SECRET);
  const payment = createPaymentService({
    db,
    wallet,
    provider: paymentProvider,
    providerName,
  });
  const booking = createBookingService({
    db,
    wallet,
    pricing,
    audit,
    notification,
    meeting,
  });
  const room = createRoomService(db);

  return {
    audit,
    pricing,
    wallet,
    notification,
    meeting,
    auth,
    admin,
    adminTutor,
    tutor,
    discovery,
    invite,
    achievement,
    payment,
    booking,
    room,
  };
}

export const services = createServices();
