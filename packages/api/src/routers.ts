import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "./procedures";
import { authRouter } from "./modules/auth/auth.router";
import { adminRouter } from "./modules/admin/admin.router";
import { adminTutorRouter } from "./modules/admin-tutor/admin-tutor.router";
import { tutorRouter } from "./modules/tutor/tutor.router";
import { discoveryRouter } from "./modules/tutor-discovery/discovery.router";
import { inviteRouter } from "./modules/invite/invite.router";
import { achievementRouter } from "./modules/achievement/achievement.router";
import { walletRouter } from "./modules/wallet/wallet.router";
import { paymentRouter } from "./modules/payment/payment.router";

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
  privateData: protectedProcedure
    .route({
      method: "POST",
      path: "/private-data",
      tags: ["System"],
      summary: "Private data",
      description: "Returns private data for the authenticated user",
    })
    .handler(({ context }) => {
      return {
        message: "This is private",
        user: context.session?.user,
      };
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
};

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
