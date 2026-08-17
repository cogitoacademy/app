import { createFileRoute } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";

import { BookingDetailPage } from "@/components/booking/booking-detail-page";

export const Route = createFileRoute("/_app/bookings_/$bookingId")({
  component: BookingDetailRoute,
});

function BookingDetailRoute() {
  const { bookingId } = Route.useParams();
  const { session } = Route.useRouteContext();
  const viewer = session.data?.user as CogitoUser | undefined;

  return (
    <BookingDetailPage
      bookingId={bookingId}
      viewerId={viewer?.id ?? ""}
      viewerRole={viewer?.role ?? "student"}
    />
  );
}
