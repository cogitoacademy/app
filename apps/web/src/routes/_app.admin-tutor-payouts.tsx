import { createFileRoute, redirect } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";

import { AdminTutorPayoutsPage } from "@/components/admin/admin-tutor-payouts-page";

export const Route = createFileRoute("/_app/admin-tutor-payouts")({
  head: () => ({
    meta: [
      {
        title: "Tutor payouts · Cogito Academy",
      },
    ],
  }),
  component: AdminTutorPayoutsPage,
  beforeLoad: ({ context }) => {
    const user = context.session.data?.user as CogitoUser | undefined;
    if (user?.role !== "admin") {
      throw redirect({ to: "/dashboard" });
    }
  },
});
