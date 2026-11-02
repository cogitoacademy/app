import { createFileRoute } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";

import { AdminBookingDetailPage } from "@/components/admin/admin-operations-page";
import { BookingDetailPage } from "@/components/booking/booking-detail-page";

export const Route = createFileRoute("/_app/bookings_/$bookingId")({
  head: () => ({
    meta: [
      {
        title: "Booking detail · Cogito Academy",
      },
    ],
  }),
  component: BookingDetailRoute,
});

function BookingDetailRoute() {
  const { bookingId } = Route.useParams();
  const { session } = Route.useRouteContext();
  const viewer = session.data?.user as CogitoUser | undefined;

  if (viewer?.role === "admin")
    return (
      <AdminBookingDetailPage bookingId={bookingId} viewerId={viewer.id} />
    );

  return (
    <BookingDetailPage
      bookingId={bookingId}
      viewerId={viewer?.id ?? ""}
      viewerRole={viewer?.role ?? "student"}
    />
  );
}
