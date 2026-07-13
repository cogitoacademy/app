import type { RouterClient } from "@orpc/server";

import { publicProcedure } from "./procedures";
import { authRouter } from "./modules/auth/auth.router";
import { adminRouter } from "./modules/admin/admin.router";
import { adminTutorRouter } from "./modules/admin-tutor/admin-tutor.router";
import { tutorRouter } from "./modules/tutor/tutor.router";
import { discoveryRouter } from "./modules/tutor-discovery/discovery.router";
import { inviteRouter } from "./modules/invite/invite.router";
import { achievementRouter } from "./modules/achievement/achievement.router";
import { walletRouter } from "./modules/wallet/wallet.router";
import { paymentRouter } from "./modules/payment/payment.router";
import {
  bookingRouter,
  tutorActionsRouter,
} from "./modules/booking/booking.router";
import { roomRouter } from "./modules/room/room.router";
import { notificationRouter } from "./modules/notification/notification.router";
import { adminBookingRouter } from "./modules/admin-booking/admin-booking.router";
import { refundRouter } from "./modules/refund/refund.router";

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
};

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
