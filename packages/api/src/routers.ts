import type { RouterClient } from "@orpc/server";

import { publicProcedure } from "./procedures";
import { createAuthRouter } from "./modules/auth/auth.router";
import { createAdminRouter } from "./modules/admin/admin.router";
import { createAdminTutorRouter } from "./modules/admin-tutor/admin-tutor.router";
import { createAdminMarkPackageRouter } from "./modules/admin-mark-package/admin-mark-package.router";
import { createTutorRouter } from "./modules/tutor/tutor.router";
import { createDiscoveryRouter } from "./modules/tutor-discovery/discovery.router";
import { createInviteRouter } from "./modules/invite/invite.router";
import { createAchievementRouter } from "./modules/achievement/achievement.router";
import { createWalletRouter } from "./modules/wallet/wallet.router";
import { createPaymentRouter } from "./modules/payment/payment.router";
import {
  createBookingRouter,
  createTutorActionsRouter,
} from "./modules/booking/booking.router";
import { createRoomRouter } from "./modules/room/room.router";
import { createNotificationRouter } from "./modules/notification/notification.router";
import { createAdminBookingRouter } from "./modules/admin-booking/admin-booking.router";
import { createRefundRouter } from "./modules/refund/refund.router";
import { createSupportRouter } from "./modules/support/support.router";
import { createUploadRouter } from "./modules/upload/upload.router";
import { createContentRouter } from "./modules/content/content.router";
import { createContactRouter } from "./modules/contact/contact.router";
import { handlers } from "./services";

const authRouter = createAuthRouter(handlers.auth);
const adminRouter = createAdminRouter(handlers.admin);
const adminTutorRouter = createAdminTutorRouter(handlers.adminTutor);
const adminMarkPackageRouter = createAdminMarkPackageRouter(
  handlers.adminMarkPackage,
);
const tutorRouter = createTutorRouter(handlers.tutor);
const discoveryRouter = createDiscoveryRouter(handlers.discovery);
const inviteRouter = createInviteRouter(handlers.invite);
const achievementRouter = createAchievementRouter(handlers.achievement);
const walletRouter = createWalletRouter(handlers.wallet);
const paymentRouter = createPaymentRouter(handlers.payment);
const bookingRouter = createBookingRouter(handlers.booking);
const tutorActionsRouter = createTutorActionsRouter(handlers.tutorActions);
const roomRouter = createRoomRouter(handlers.room);
const notificationRouter = createNotificationRouter(handlers.notification);
const adminBookingRouter = createAdminBookingRouter(handlers.adminBooking);
const refundRouter = createRefundRouter(handlers.refund);
const supportRouter = createSupportRouter(handlers.support);
const uploadRouter = createUploadRouter(handlers.upload);
const contentRouter = createContentRouter(handlers.content);
const contactRouter = createContactRouter(handlers.contact);

export const appRouter = {
  healthCheck: publicProcedure
    .route({
      method: "POST",
      path: "/health-check",
      tags: ["System"],
      summary: "Health check",
      description: "Returns OK if the server is running",
    })
    .handler(() => {
      return "OK";
    }),
  auth: authRouter,
  admin: adminRouter,
  adminTutor: adminTutorRouter,
  adminMarkPackage: adminMarkPackageRouter,
  tutor: tutorRouter,
  tutors: discoveryRouter,
  invite: inviteRouter,
  achievement: achievementRouter,
  wallet: walletRouter,
  payment: paymentRouter,
  booking: bookingRouter,
  tutorActions: tutorActionsRouter,
  room: roomRouter,
  notification: notificationRouter,
  adminBooking: adminBookingRouter,
  refund: refundRouter,
  support: supportRouter,
  upload: uploadRouter,
  content: contentRouter,
  contact: contactRouter,
};

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
