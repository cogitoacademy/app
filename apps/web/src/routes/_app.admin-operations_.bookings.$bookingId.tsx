import { createFileRoute, redirect } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";

export const Route = createFileRoute(
  "/_app/admin-operations_/bookings/$bookingId",
)({
  beforeLoad: ({ context, params }) => {
    const user = context.session.data?.user as CogitoUser | undefined;
    if (user?.role !== "admin") throw redirect({ to: "/dashboard" });
    throw redirect({
      to: "/bookings/$bookingId",
      params: { bookingId: params.bookingId },
      replace: true,
    });
  },
});
