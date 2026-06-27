import { createFileRoute } from "@tanstack/react-router";

import { BookingsPage } from "@/components/dashboard/pages/bookings-page";

export const Route = createFileRoute("/_app/bookings")({
  component: BookingsPage,
});
