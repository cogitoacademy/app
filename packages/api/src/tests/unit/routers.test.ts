import { describe, test, expect, mock } from "bun:test";

mock.module("../../procedures", () => ({
  publicProcedure: {
    route: () => ({
      handler: (fn: () => any) => fn,
    }),
  },
  o: {},
  requireAuth: { middleware: (fn: any) => fn },
  requireAdmin: { middleware: (fn: any) => fn },
  protectedProcedure: {
    use: () => ({
      route: () => ({ handler: (fn: any) => fn }),
    }),
  },
  adminProcedure: {
    use: () => ({
      route: () => ({ handler: (fn: any) => fn }),
    }),
  },
}));

mock.module("../../modules/auth/auth.router", () => ({ authRouter: {} }));
mock.module("../../modules/admin/admin.router", () => ({ adminRouter: {} }));
mock.module("../../modules/admin-tutor/admin-tutor.router", () => ({
  adminTutorRouter: {},
}));
mock.module("../../modules/tutor/tutor.router", () => ({ tutorRouter: {} }));
mock.module("../../modules/tutor-discovery/discovery.router", () => ({
  discoveryRouter: {},
}));
mock.module("../../modules/invite/invite.router", () => ({
  inviteRouter: {},
}));
mock.module("../../modules/achievement/achievement.router", () => ({
  achievementRouter: {},
}));
mock.module("../../modules/wallet/wallet.router", () => ({
  walletRouter: {},
}));
mock.module("../../modules/payment/payment.router", () => ({
  paymentRouter: {},
}));
mock.module("../../modules/booking/booking.router", () => ({
  bookingRouter: {},
  tutorActionsRouter: {},
}));
mock.module("../../modules/room/room.router", () => ({ roomRouter: {} }));
mock.module("../../modules/notification/notification.router", () => ({
  notificationRouter: {},
}));
mock.module("../../modules/admin-booking/admin-booking.router", () => ({
  adminBookingRouter: {},
}));
mock.module("../../modules/refund/refund.router", () => ({
  refundRouter: {},
}));

const { appRouter } = await import("../../routers");

describe("appRouter healthCheck", () => {
  test("handler returns 'OK'", () => {
    const result = appRouter.healthCheck();
    expect(result).toBe("OK");
  });
});
