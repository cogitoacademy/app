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
  "/achievements": "Achievements",
  "/tutors": "Tutors",
  "/profile": "Profile",
  "/onboarding": "Tutor Onboarding",
  "/admin-tutors": "Manage Tutors",
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

  return (
    <Layout
      title={routeTitles[pathname] ?? "Dashboard"}
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
