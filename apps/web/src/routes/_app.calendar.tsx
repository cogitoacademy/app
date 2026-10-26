import type { CogitoUser } from "@cogito-app/auth";
import { createFileRoute } from "@tanstack/react-router";

import { ContentPage } from "@/components/admin/content-page";
import { CompetitionCalendarPage } from "@/components/content/competition-calendar-page";

export const Route = createFileRoute("/_app/calendar")({
  head: () => ({
    meta: [
      {
        title: "Competition calendar · Cogito Academy",
      },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { session } = Route.useRouteContext();
  const user = session.data?.user as CogitoUser | undefined;
  return user?.role === "admin" ? (
    <ContentPage kind="event" preview={<CompetitionCalendarPage />} />
  ) : (
    <CompetitionCalendarPage />
  );
}
