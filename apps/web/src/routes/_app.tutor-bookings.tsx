import { createFileRoute, redirect } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";
import { TutorBookingsPage } from "@/components/dashboard/pages/tutor-bookings-page";

export const Route = createFileRoute("/_app/tutor-bookings")({
  component: TutorBookingsPage,
  beforeLoad: async ({ context }) => {
    const user = context.session?.data?.user as CogitoUser | undefined;
    if (user?.role !== "tutor") {
      throw redirect({ to: "/dashboard" });
    }
  },
});
