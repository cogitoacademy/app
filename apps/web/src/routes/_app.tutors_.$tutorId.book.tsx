import { createFileRoute } from "@tanstack/react-router";

import { CreateBookingPage } from "@/components/booking/create-booking-page";

export const Route = createFileRoute("/_app/tutors_/$tutorId/book")({
  component: CreateBookingRoute,
});

function CreateBookingRoute() {
  const { tutorId } = Route.useParams();
  return <CreateBookingPage key={tutorId} tutorId={tutorId} />;
}
