import { createFileRoute } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";

import { AdminDashboardPage } from "@/components/dashboard/admin-dashboard-page";
import { StudentDashboardPage } from "@/components/dashboard/student-dashboard-page";
import { TutorDashboardPage } from "@/components/dashboard/tutor-dashboard-page";

export const Route = createFileRoute("/_app/dashboard")({
  component: RouteComponent,
});

function RouteComponent() {
  const { session } = Route.useRouteContext();
  const user = session.data?.user as CogitoUser | undefined;

  if (user?.role === "student") {
    return <StudentDashboardPage studentName={user.name} />;
  }

  if (user?.role === "tutor") {
    return <TutorDashboardPage tutorName={user.name} />;
  }

  return <AdminDashboardPage adminName={user?.name ?? "Admin"} />;
}
