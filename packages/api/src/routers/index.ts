import type { RouterClient } from "@orpc/server";

import { adminRouter } from "./admin-router";
import { authRouter } from "./auth-router";
import { protectedProcedure, publicProcedure } from "../index";
import { todoRouter } from "./todo";

export const appRouter = {
  healthCheck: publicProcedure.handler(() => {
    return "OK";
  }),
  privateData: protectedProcedure.handler(({ context }) => {
    return {
      message: "This is private",
      user: context.session?.user,
    };
  }),
  auth: authRouter,
  admin: adminRouter,
  todo: todoRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
