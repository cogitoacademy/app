import { createFileRoute, redirect } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";

import { AdminDashboardPage } from "@/components/dashboard/admin-dashboard-page";

export const Route = createFileRoute("/_app/admin")({
  component: AdminRoute,
  beforeLoad: ({ context }) => {
    const user = context.session.data?.user as CogitoUser | undefined;
    if (user?.role !== "admin") throw redirect({ to: "/dashboard" });
  },
});

function AdminRoute() {
  const { session } = Route.useRouteContext();
  const user = session.data?.user as CogitoUser;

  return <AdminDashboardPage adminName={user.name} />;
}
