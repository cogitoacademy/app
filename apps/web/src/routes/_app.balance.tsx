import { createFileRoute, redirect } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";

import { BalancePage } from "@/components/dashboard/pages/balance-page";

export const Route = createFileRoute("/_app/balance")({
  component: BalancePage,
  beforeLoad: ({ context }) => {
    const user = context.session?.data?.user as CogitoUser | undefined;
    if (user?.role !== "student") throw redirect({ to: "/dashboard" });
  },
});
