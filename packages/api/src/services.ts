import { db } from "./lib/db";
import { env } from "@cogito-app/env/server";
import { initRedis } from "./lib/redis";
import { initIdempotencyStores } from "./lib/idempotency";
import { createAuditModule } from "./modules/audit";
import { createPricingModule } from "./modules/pricing";
import { createWalletModule } from "./modules/wallet";
import { createAuthModule } from "./modules/auth";
import { createAdminModule } from "./modules/admin";
import { createAdminTutorModule } from "./modules/admin-tutor";
import { createTutorModule } from "./modules/tutor";
import { createDiscoveryModule } from "./modules/tutor-discovery";
import { createInviteModule } from "./modules/invite";
import { createAchievementModule } from "./modules/achievement";
import { createBookingModule } from "./modules/booking";
import { createNotificationModule } from "./modules/notification";
import { createEmailModule } from "./modules/email";
import { createPaymentModule } from "./modules/payment";
import { createRoomModule } from "./modules/room";
import { createAdminBookingModule } from "./modules/admin-booking";
import { createRefundModule } from "./modules/refund";
import { createMeetingModule } from "./modules/meeting";
import { createSupportModule } from "./modules/support";
import { createUploadModule } from "./modules/upload";
import { createStorage } from "./lib/storage";

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
  support: SupportService;
  upload: UploadService;
}

export interface HandlerRegistry {
  auth: AuthHandler;
  admin: AdminHandler;
  adminTutor: AdminTutorHandler;
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
}

function createServices() {
  const redis = initRedis(env.REDIS_URL);
  initIdempotencyStores(redis);
  const googleMeetClientId = env.GOOGLE_MEET_CLIENT_ID ?? env.GOOGLE_CLIENT_ID;
  const googleMeetClientSecret =
    env.GOOGLE_MEET_CLIENT_SECRET ?? env.GOOGLE_CLIENT_SECRET;
  const googleMeetConfig =
    googleMeetClientId &&
    googleMeetClientSecret &&
    env.GOOGLE_MEET_REFRESH_TOKEN
      ? {
          authType: "oauth_refresh_token" as const,
          clientId: googleMeetClientId,
          clientSecret: googleMeetClientSecret,
          refreshToken: env.GOOGLE_MEET_REFRESH_TOKEN,
          calendarId: env.GOOGLE_CALENDAR_ID ?? "primary",
        }
      : env.GOOGLE_CLIENT_EMAIL && env.GOOGLE_PRIVATE_KEY
        ? {
            authType: "service_account" as const,
            clientEmail: env.GOOGLE_CLIENT_EMAIL,
            privateKey: env.GOOGLE_PRIVATE_KEY,
            impersonatedUser: env.GOOGLE_IMPERSONATED_USER,
            calendarId: env.GOOGLE_CALENDAR_ID ?? "primary",
          }
        : undefined;

  // Infrastructure modules
  const audit = createAuditModule();
  const pricing = createPricingModule();
  const email = createEmailModule({
    resendApiKey: env.RESEND_API_KEY,
    emailFrom: env.EMAIL_FROM,
    redis,
  });
  const meeting = createMeetingModule({
    db,
    googleMeetEnabled: !!(env.GOOGLE_MEET_ENABLED && googleMeetConfig),
    googleConfig: googleMeetConfig,
    redis,
  });

  // Core modules
  const wallet = createWalletModule({ db });
  const auth = createAuthModule({ db, wallet: wallet.service });
  const notification = createNotificationModule({ db, email: email.service });
  const booking = createBookingModule({
    db,
    wallet: wallet.service,
    pricing: pricing.service,
    audit: audit.service,
    notification: notification.service,
    meeting,
  });
  const admin = createAdminModule({
    db,
    audit: audit.service,
    wallet: wallet.service,
    payout: booking.service,
  });
  const adminTutor = createAdminTutorModule({ db, audit: audit.service });
  const tutor = createTutorModule({
    db,
    pricing: pricing.service,
    audit: audit.service,
    payout: booking.service,
  });
  const discovery = createDiscoveryModule({ db });
  const invite = createInviteModule({ db, audit: audit.service });
  const achievement = createAchievementModule({
    db,
    audit: audit.service,
    notification: notification.service,
  });
  const room = createRoomModule({ db, bookingPort: booking.service });

  const payment = createPaymentModule({
    db,
    wallet: wallet.service,
    xenditConfig:
      env.XENDIT_SECRET_KEY && env.XENDIT_WEBHOOK_TOKEN
        ? {
            secretKey: env.XENDIT_SECRET_KEY!,
            webhookToken: env.XENDIT_WEBHOOK_TOKEN!,
            successRedirectUrl: env.XENDIT_SUCCESS_REDIRECT_URL ?? "",
            failureRedirectUrl: env.XENDIT_FAILURE_REDIRECT_URL ?? "",
            defaultPaymentMethod: env.XENDIT_DEFAULT_PAYMENT_METHOD,
          }
        : undefined,
    webhookSecret: env.PAYMENT_WEBHOOK_SECRET,
  });

  const refund = createRefundModule({
    db,
    audit: audit.service,
    wallet: wallet.service,
  });

  const adminBooking = createAdminBookingModule({
    db,
    audit: audit.service,
    wallet: wallet.service,
    refund: refund.service,
    notification: notification.service,
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
    tutor: tutor.service,
    invite: invite.service,
    achievement: achievement.service,
    booking: booking.service,
    notification: notification.service,
    email: email.service,
    payment: payment.service,
    room: room.service,
    adminBooking: adminBooking.service,
    refund: refund.service,
    support: support.service,
    upload: upload.service,
  };

  const handlers: HandlerRegistry = {
    auth: auth.handler,
    admin: admin.handler,
    adminTutor: adminTutor.handler,
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
  };

  return { services, handlers, redis };
}

const { services, handlers, redis } = createServices();
export { services, handlers, redis };
