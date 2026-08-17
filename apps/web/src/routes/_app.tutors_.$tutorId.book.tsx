import { createFileRoute, redirect } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";

import { CreateBookingPage } from "@/components/booking/create-booking-page";

export const Route = createFileRoute("/_app/tutors_/$tutorId/book")({
  component: CreateBookingRoute,
  beforeLoad: ({ context }) => {
    const user = context.session?.data?.user as CogitoUser | undefined;
    if (user?.role !== "student") throw redirect({ to: "/dashboard" });
  },
});

function CreateBookingRoute() {
  const { tutorId } = Route.useParams();
  return <CreateBookingPage key={tutorId} tutorId={tutorId} />;
}
