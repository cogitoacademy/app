import {
  createFileRoute,
  Outlet,
  redirect,
  useRouterState,
} from "@tanstack/react-router";

import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { Layout } from "@/components/dashboard/layout";
import { authClient } from "@/lib/auth-client";

const routeTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/balance": "Balance",
  "/achievements": "Achievements",
  "/tutors": "Tutors",
  "/todos": "Todos",
  "/profile": "Profile",
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
  const { isLoading, pathname } = useRouterState({
    select: (state) => ({
      isLoading: state.isLoading,
      pathname: state.location.pathname,
    }),
  });

  return (
    <Layout
      isContentPending={isLoading}
      title={routeTitles[pathname] ?? "Dashboard"}
      sidebar={
        <AppSidebar
          userEmail={session.data?.user.email}
          userName={session.data?.user.name}
        />
      }
    >
      <Outlet />
    </Layout>
  );
}
