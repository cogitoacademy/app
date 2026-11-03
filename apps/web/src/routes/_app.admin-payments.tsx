import { createFileRoute, redirect } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";

import { AdminPaymentsPage } from "@/components/admin/admin-payments-page";

export const Route = createFileRoute("/_app/admin-payments")({
  head: () => ({
    meta: [
      {
        title: "Payments · Cogito Academy",
      },
    ],
  }),
  component: AdminPaymentsPage,
  beforeLoad: ({ context }) => {
    const user = context.session.data?.user as CogitoUser | undefined;
    if (user?.role !== "admin") throw redirect({ to: "/dashboard" });
  },
});
