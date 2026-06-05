import { createFileRoute } from "@tanstack/react-router";

import { DashboardPage } from "@/components/dashboard/page";

export const Route = createFileRoute("/_app/dashboard")({
  component: RouteComponent,
});

function RouteComponent() {
  return <DashboardPage />;
}
