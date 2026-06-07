import type { RouterClient } from "@orpc/server";

import { adminRouter } from "./admin-router";
import { adminTutorRouter } from "./admin-tutor-router";
import { authRouter } from "./auth-router";
import { inviteRouter } from "./invite-router";
import { tutorPublicRouter } from "./tutor-public-router";
import { tutorRouter } from "./tutor-router";
import { protectedProcedure, publicProcedure } from "../index";
import { achievementRouter } from "./achievement-router";
import { todoRouter } from "./todo";

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
  tutors: tutorPublicRouter,
  invite: inviteRouter,
  todo: todoRouter,
  achievement: achievementRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
