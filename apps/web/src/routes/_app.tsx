import {
  createFileRoute,
  Outlet,
  redirect,
  useRouterState,
} from "@tanstack/react-router";

import type { CogitoUser } from "@cogito-app/auth";

import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { Layout } from "@/components/dashboard/layout";
import { authClient } from "@/lib/auth-client";

const routeTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/balance": "Balance",
  "/bookings": "My Bookings",
  "/tutor-bookings": "Tutor Bookings",
  "/achievements": "Achievements",
  "/tutors": "Tutors",
  "/profile": "Profile",
  "/onboarding": "Tutor Onboarding",
  "/availability": "Availability",
  "/notifications": "Notifications",
  "/admin-tutors": "Manage Tutors",
  "/admin-achievements": "Achievement Moderation",
  "/admin-operations": "Operations",
};

export const Route = createFileRoute("/_app")({
  component: RouteComponent,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      redirect({
        to: "/login",
        throw: true,
      });
    }
    return { session };
  },
});

function RouteComponent() {
  const { session } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const title = pathname.startsWith("/bookings/")
    ? "Booking Details"
    : pathname.startsWith("/tutors/")
      ? "Book a Session"
      : (routeTitles[pathname] ?? "Dashboard");

  return (
    <Layout
      title={title}
      sidebar={
        <AppSidebar
          userEmail={session.data?.user.email}
          userName={session.data?.user.name}
          role={(session.data?.user as CogitoUser | undefined)?.role}
        />
      }
    >
      <Outlet />
    </Layout>
  );
}
