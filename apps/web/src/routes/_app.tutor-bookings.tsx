import { createFileRoute } from "@tanstack/react-router";

import { TutorBookingsPage } from "@/components/dashboard/pages/tutor-bookings-page";

export const Route = createFileRoute("/_app/tutor-bookings")({
  component: TutorBookingsPage,
});
