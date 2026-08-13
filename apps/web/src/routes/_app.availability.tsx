import { createFileRoute, redirect } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";

import { AvailabilityPage } from "@/components/tutor/availability-page";

export const Route = createFileRoute("/_app/availability")({
  component: AvailabilityPage,
  beforeLoad: async ({ context }) => {
    const user = context.session?.data?.user as CogitoUser | undefined;
    if (user?.role !== "tutor") {
      throw redirect({ to: "/dashboard" });
    }
  },
});
