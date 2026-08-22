import { createFileRoute, redirect } from "@tanstack/react-router";

import { BookingsPage } from "@/components/dashboard/pages/bookings-page";

export const Route = createFileRoute("/_app/tutor-bookings")({
  component: BookingsPage,
  beforeLoad: () => {
    throw redirect({ to: "/bookings" });
  },
});
