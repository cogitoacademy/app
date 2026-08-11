import { createFileRoute } from "@tanstack/react-router";

import { BookingDetailPage } from "@/components/booking/booking-detail-page";

export const Route = createFileRoute("/_app/bookings/$bookingId")({
  component: BookingDetailRoute,
});

function BookingDetailRoute() {
  const { bookingId } = Route.useParams();
  return <BookingDetailPage bookingId={bookingId} />;
}
