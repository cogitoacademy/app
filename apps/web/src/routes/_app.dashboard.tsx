import { createFileRoute } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";

import { DashboardPage } from "@/components/dashboard/page";
import { StudentDashboardPage } from "@/components/dashboard/student-dashboard-page";

export const Route = createFileRoute("/_app/dashboard")({
  component: RouteComponent,
});

function RouteComponent() {
  const { session } = Route.useRouteContext();
  const user = session.data?.user as CogitoUser | undefined;

  if (user?.role === "student") {
    return <StudentDashboardPage studentName={user.name} />;
  }

  return <DashboardPage />;
}
